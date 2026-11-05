// Runs every scraper in sites/ and writes src/data/scraped/<id>.json for the site build.
//
// A scraper that throws, times out or finds nothing never fails the build: its last good
// file is left in place and a warning shows on the GitHub Actions run.
//
//   node run.mjs                 # all scrapers
//   node run.mjs mill-city       # just one
//   DEBUG_DIR=debug node run.mjs # also save page.html / screenshot / network log per site

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { todayLocal } from './lib/dates.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '..', 'src', 'data', 'scraped');
const TIMEOUT_MS = 3 * 60 * 1000;
const DAYS_AHEAD = 90;
const inActions = !!process.env.GITHUB_ACTIONS;

const warn = (title, msg) => console.log(inActions ? `::warning title=${title}::${msg}` : `WARN ${title}: ${msg}`);
const summary = [];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '');

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return undefined; }
}

function withTimeout(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timed out after ${ms / 1000}s`)), ms); })]).finally(() => clearTimeout(t));
}

async function runOne(file) {
  const site = await import(join(here, 'sites', file));
  const outPath = join(OUT_DIR, `${site.id}.json`);
  const previous = await readJson(outPath);
  const debugDir = process.env.DEBUG_DIR ? join(process.env.DEBUG_DIR, site.id) : undefined;
  const label = `Scraper ${site.id}`;
  try {
    const { events, method, source } = await withTimeout(site.scrape({ debugDir }), TIMEOUT_MS);
    // Weekly runs can repeat for a year; the site only needs the next few months.
    const today = todayLocal();
    const horizon = new Date(Date.now() + (site.daysAhead ?? DAYS_AHEAD) * 864e5).toISOString().slice(0, 10);
    const valid = events.filter((e) => e.name && isDate(e.date) && e.date >= today && e.date <= horizon);
    if (!valid.length) throw new Error(`found no upcoming events on ${site.url} (tried iCal, widget JSON, JSON-LD)`);

    // Keep each event's "added" date from earlier runs so "Recently added" stays honest.
    const addedBefore = new Map((previous?.events ?? []).map((e) => [e.id, e.added]));
    const used = new Set();
    const out = valid
      .sort((a, b) => `${a.date} ${a.start_time ?? ''}`.localeCompare(`${b.date} ${b.start_time ?? ''}`))
      .map((e) => {
        let id = `${e.date}-${site.id}-${slug(e.name)}`;
        for (let n = 2; used.has(id); n++) id = `${e.date}-${site.id}-${slug(e.name)}-${n}`;
        used.add(id);
        const clean = Object.fromEntries(Object.entries(e).filter(([, v]) => v != null && v !== ''));
        return { id, ...clean, added: addedBefore.get(id) ?? today };
      });

    const prevCount = previous?.events?.length ?? 0;
    if (prevCount >= 5 && out.length < prevCount / 3) {
      throw new Error(`found only ${out.length} events, down from ${prevCount}; keeping the old list in case the page half-loaded`);
    }

    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(outPath, JSON.stringify({ source: site.url, method, from: source, events: out }, null, 2) + '\n');
    console.log(`[scrape] ${site.id}: ${out.length} events via ${method} (${source})`);
    if (method === 'ics') console.log(`[scrape] ${site.id}: tip, this iCal feed could go straight in src/data/feeds.yaml without a browser: ${source}`);
    summary.push(`| ${site.id} | ✅ ${out.length} events | ${method} |`);
  } catch (err) {
    const kept = previous ? `keeping last good list (${previous.events?.length ?? 0} events)` : 'no earlier list to fall back on';
    warn(label, `${err.message}; ${kept}`);
    summary.push(`| ${site.id} | ⚠️ ${err.message.replace(/\|/g, '/')} | ${kept} |`);
  }
}

const only = process.argv[2];
const files = (await readdir(join(here, 'sites'))).filter((f) => f.endsWith('.mjs') && (!only || f === `${only}.mjs`));
for (const f of files) await runOne(f);

if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, ['### Scrapers', '', '| Site | Result | Detail |', '|---|---|---|', ...summary, ''].join('\n'), { flag: 'a' });
}
