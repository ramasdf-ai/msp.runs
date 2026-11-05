// Load a JavaScript-rendered calendar page in headless Chromium and pull events out of it.
//
// Calendar widgets usually fetch their events as JSON, or embed a calendar that has an
// iCal feed. So instead of reading pixels off the page, this:
//   1. records every network response the page makes,
//   2. uses an iCal feed if the page points at one (Google Calendar embed, .ics/webcal link),
//   3. otherwise picks the JSON response that looks most like a list of events,
//   4. otherwise reads schema.org Event JSON-LD from the rendered page.
// Whatever it finds, it saves the page, a screenshot and a network log to the debug folder
// so a broken scraper can be fixed from the GitHub Actions artifact.

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { parseIcs } from './ics.mjs';
import { parseStart } from './dates.mjs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 msp.run-calendar-bot';

/** Turn a Google Calendar embed URL into its public iCal feed URLs. */
export function googleIcsUrls(embedUrl) {
  try {
    const u = new URL(embedUrl);
    if (!/calendar\.google\.com$/.test(u.hostname)) return [];
    return u.searchParams.getAll('src').map((id) => `https://calendar.google.com/calendar/ical/${encodeURIComponent(id)}/public/basic.ics`);
  } catch {
    return [];
  }
}

const TITLE_KEYS = ['title', 'name', 'summary', 'subject', 'event_name', 'eventName'];
const START_KEYS = ['start', 'startDate', 'start_date', 'startTime', 'start_time', 'starts_at', 'startsAt', 'start_at', 'dtstart', 'begin', 'date', 'startDateTime'];
const VENUE_KEYS = ['location', 'venue', 'address', 'place'];
const URL_KEYS = ['url', 'link', 'permalink', 'htmlLink', 'event_url'];
const DESC_KEYS = ['description', 'desc', 'details', 'body', 'content', 'excerpt'];

const pick = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; };
const text = (v) => {
  if (v == null) return undefined;
  if (typeof v === 'object') return text(v.name ?? v.title ?? v.address ?? v.text ?? v.rendered);
  const s = String(v).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return s || undefined;
};

/** One object -> an event, or undefined if it doesn't look like one. */
export function toEvent(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined;
  const name = text(pick(o, TITLE_KEYS));
  const when = parseStart(pick(o, START_KEYS));
  if (!name || !when?.date) return undefined;
  const url = pick(o, URL_KEYS);
  return {
    name,
    ...when,
    venue: text(pick(o, VENUE_KEYS)),
    url: typeof url === 'string' && /^https?:/.test(url) ? url : undefined,
    description: text(pick(o, DESC_KEYS)),
  };
}

/** Find the array (anywhere in a JSON document) with the most event-like objects. */
export function eventsFromJson(doc) {
  let best = [];
  const seen = new Set();
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 8 || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      const evs = v.map(toEvent).filter(Boolean);
      if (evs.length > best.length) best = evs;
      for (const x of v.slice(0, 50)) walk(x, depth + 1);
    } else {
      for (const x of Object.values(v)) walk(x, depth + 1);
    }
  };
  walk(doc, 0);
  return best;
}

function eventsFromJsonLd(blocks) {
  const out = [];
  for (const raw of blocks) {
    let doc;
    try { doc = JSON.parse(raw); } catch { continue; }
    const items = [doc].flat().flatMap((d) => d?.['@graph'] ?? [d]);
    for (const it of items) {
      if (!/Event$/.test([it?.['@type']].flat().join(' '))) continue;
      const e = toEvent({ ...it, location: it.location?.name ?? it.location });
      if (e) out.push(e);
    }
  }
  return out;
}

/**
 * Scrape a page. Returns { events, method, source }.
 * `debugDir` (optional) receives page.html, screenshot.png and network.json.
 */
export async function scrapePage(pageUrl, { debugDir, waitMs = 8000, maxPages = 12 } = {}) {
  const browser = await chromium.launch();
  const responses = [];
  const icsCandidates = new Set();
  let pagesFetched = 1;
  try {
    const context = await browser.newContext({ userAgent: UA, timezoneId: 'America/Chicago', locale: 'en-US' });
    const page = await context.newPage();
    page.on('response', async (res) => {
      const url = res.url();
      const type = res.headers()['content-type'] ?? '';
      const req = res.request();
      const entry = { url, status: res.status(), type, method: req.method(), post: req.postData()?.slice(0, 500) };
      responses.push(entry);
      if (/text\/calendar/.test(type) || /\.ics(\?|$)/.test(url)) icsCandidates.add(url);
      if (/json|javascript/.test(type) && res.ok()) {
        try {
          const body = await res.text();
          entry.size = body.length;
          const t = body.trim().replace(/^[^([{]*\(/, '').replace(/\);?\s*$/, ''); // strip JSONP wrapper
          if (/^[[{]/.test(t)) {
            entry.json = JSON.parse(t);
            if (!Array.isArray(entry.json)) entry.keys = Object.keys(entry.json).slice(0, 20);
          }
        } catch { /* not JSON */ }
      }
    });

    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(waitMs);
    // Some widgets load more when scrolled into view.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(2000);

    // Widgets fetch events a page at a time ({"page": 1} in a POST body, or ?page=1).
    // Ask the same endpoint for the following pages until one brings nothing new.
    const firstPage = responses.find((r) => r.json && eventsFromJson(r.json).length);
    if (firstPage) {
      for (let n = 2; n <= maxPages; n++) {
        const next = await page.evaluate(async ({ url, method, post, n }) => {
          let body = post;
          let target = url;
          if (post && /"page"\s*:\s*\d+/.test(post)) body = post.replace(/"page"\s*:\s*\d+/, `"page":${n}`);
          else if (/[?&]page=\d+/.test(url)) target = url.replace(/([?&]page=)\d+/, `$1${n}`);
          else return null;
          const res = await fetch(target, { method, body, headers: body ? { 'content-type': 'application/json' } : {} });
          return res.ok ? { url: target, json: await res.json() } : null;
        }, { url: firstPage.url, method: firstPage.method, post: firstPage.post, n }).catch(() => null);
        if (!next) break;
        const before = new Set(responses.filter((r) => r.json).flatMap((r) => eventsFromJson(r.json)).map((e) => `${e.date}|${e.start_time}|${e.name}`));
        const fresh = eventsFromJson(next.json).filter((e) => !before.has(`${e.date}|${e.start_time}|${e.name}`));
        if (!fresh.length) break;
        responses.push({ url: next.url, status: 200, type: 'application/json', method: firstPage.method, page: n, json: next.json });
        pagesFetched = n;
      }
    }

    for (const f of page.frames()) for (const u of googleIcsUrls(f.url())) icsCandidates.add(u);
    const hrefs = await page.$$eval('a[href], iframe[src]', (els) => els.map((e) => e.href || e.src)).catch(() => []);
    for (const h of hrefs) {
      for (const u of googleIcsUrls(h)) icsCandidates.add(u);
      if (/^webcal:|\.ics(\?|$)/i.test(h)) icsCandidates.add(h.replace(/^webcal:/i, 'https:'));
    }
    const jsonLd = await page.$$eval('script[type="application/ld+json"]', (els) => els.map((e) => e.textContent)).catch(() => []);

    if (debugDir) {
      await mkdir(debugDir, { recursive: true });
      await writeFile(join(debugDir, 'page.html'), await page.content()).catch(() => {});
      await page.screenshot({ path: join(debugDir, 'screenshot.png'), fullPage: true }).catch(() => {});
      const frames = page.frames().map((f) => f.url()).filter((u) => u && u !== 'about:blank');
      const net = responses.map(({ json, ...r }) => ({ ...r, ...(json ? { jsonEvents: eventsFromJson(json).length } : {}) }));
      const buttons = await page.$$eval('button, [role="button"]', (els) => els.map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40)).filter(Boolean)).catch(() => []);
      await writeFile(join(debugDir, 'network.json'), JSON.stringify({ frames, icsCandidates: [...icsCandidates], pagesFetched, buttons, responses: net }, null, 2));
    }

    // 1. iCal feed
    for (const url of icsCandidates) {
      try {
        const res = await fetch(url, { headers: { 'user-agent': UA } });
        if (!res.ok) continue;
        const events = parseIcs(await res.text());
        if (events.length) return { events, method: 'ics', source: url };
      } catch { /* try the next one */ }
    }
    // 2. JSON from the widget's API. Merge every response from the same endpoint
    //    (one per page we asked for), dropping repeats.
    const byEndpoint = new Map();
    for (const r of responses) {
      if (!r.json) continue;
      const events = eventsFromJson(r.json);
      if (!events.length) continue;
      const u = new URL(r.url);
      const key = u.origin + u.pathname;
      const g = byEndpoint.get(key) ?? { source: key, events: [], seen: new Set(), samples: [] };
      for (const e of events) {
        const k = `${e.date}|${e.start_time ?? ''}|${e.name}`;
        if (!g.seen.has(k)) { g.seen.add(k); g.events.push(e); }
      }
      g.samples.push(r.json);
      byEndpoint.set(key, g);
    }
    const best = [...byEndpoint.values()].sort((a, b) => b.events.length - a.events.length)[0];
    if (best) {
      if (debugDir) await writeFile(join(debugDir, 'source.json'), JSON.stringify(best.samples.at(-1), null, 2));
      return { events: best.events, method: pagesFetched > 1 ? `json, ${pagesFetched} pages` : 'json', source: best.source };
    }
    // 3. schema.org JSON-LD
    const ld = eventsFromJsonLd(jsonLd);
    if (ld.length) return { events: ld, method: 'json-ld', source: pageUrl };

    return { events: [], method: 'none', source: pageUrl };
  } finally {
    await browser.close();
  }
}
