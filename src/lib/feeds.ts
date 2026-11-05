// Events from iCal feeds listed in src/data/feeds.yaml, fetched at build time.
// A feed that fails to load is skipped (the build never fails over it).

import { getCollection } from 'astro:content';
import { todayLocal, type Event } from './events';
import { parseRule, occurrences } from './rrule';
import { htmlToText, clip } from './html';

const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

const TZ = 'America/Chicago';
const WEEKS_AHEAD = 6; // same window as recurring.yaml runs

export interface IcsEvent {
  uid?: string;
  name: string;
  date: string; // YYYY-MM-DD, Twin Cities time
  start_time?: string; // HH:MM 24h
  venue?: string;
  url?: string;
  description?: string;
  rrule?: string;
  status?: string;
  recurrence_id?: string; // date of the repeat this event edits (YYYY-MM-DD)
  exdates?: string[]; // dates removed from a repeating event
}

const pad = (n: number | string) => String(n).padStart(2, '0');

function localParts(d: Date): { date: string; time: string } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)!.value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}

function parseDt(value: string): { date: string; start_time?: string } | undefined {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{2}(Z)?)?$/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, z] = m;
  if (!h) return { date: `${y}-${mo}-${d}` };
  if (z) {
    const { date, time } = localParts(new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi)));
    return { date, start_time: time };
  }
  // TZID or floating time: treat as Twin Cities local time.
  return { date: `${y}-${mo}-${d}`, start_time: `${h}:${mi}` };
}

export function parseIcs(text: string): IcsEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const unesc = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
  const out: IcsEvent[] = [];
  let ev: Partial<IcsEvent> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT') {
      if (ev?.name && ev.date) out.push(ev as IcsEvent);
      ev = null;
      continue;
    }
    if (!ev) continue;
    const m = line.match(/^([A-Z-]+)(?:;[^:]*)?:(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key === 'SUMMARY') ev.name = htmlToText(unesc(value));
    else if (key === 'LOCATION') ev.venue = htmlToText(unesc(value)) || undefined;
    else if (key === 'URL') ev.url = value.trim();
    else if (key === 'UID') ev.uid = value.trim();
    else if (key === 'DESCRIPTION') ev.description = clip(htmlToText(unesc(value)), 600) || undefined;
    else if (key === 'RRULE') ev.rrule = value;
    else if (key === 'STATUS') ev.status = value.trim().toUpperCase();
    else if (key === 'DTSTART') Object.assign(ev, parseDt(value.trim()));
    else if (key === 'RECURRENCE-ID') ev.recurrence_id = parseDt(value.trim())?.date;
    else if (key === 'EXDATE') ev.exdates = [...(ev.exdates ?? []), ...value.split(',').map((v) => parseDt(v.trim())?.date).filter((d): d is string => !!d)];
  }
  return out;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

let cached: Promise<{ events: Event[]; replaced: Set<string> }> | undefined;

export function feedEvents() {
  cached ??= (async () => {
    const events: Event[] = [];
    const replaced = new Set<string>();
    const today = todayLocal();
    const oldest = addDays(today, -30);
    for (const { id: feedId, data: f } of await getCollection('feeds')) {
      try {
        const res = await fetch(f.url.replace(/^webcal:/, 'https:'));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = parseIcs(await res.text());
        const used = new Set<string>();
        let kept = 0;
        // Expand repeating events into dates (up to WEEKS_AHEAD out), leaving out dates that
        // were cancelled (EXDATE) or edited, since an edited date is its own event in the feed.
        const edited = new Set(parsed.filter((e) => e.recurrence_id).map((e) => `${e.uid}|${e.recurrence_id}`));
        const horizon = addDays(today, WEEKS_AHEAD * 7);
        const dated: IcsEvent[] = [];
        let unsupported = 0;
        for (const e of parsed) {
          if (!e.rrule) { dated.push(e); continue; }
          const rule = parseRule(e.rrule, (raw) => parseDt(raw)?.date);
          if (!rule) { unsupported++; continue; }
          for (const date of occurrences(rule, e.date, oldest, horizon, new Set(e.exdates))) {
            if (!edited.has(`${e.uid}|${date}`)) dated.push({ ...e, date });
          }
        }
        for (const e of dated) {
          // Shared calendars (e.g. Google) carry years of history; skip anything long past.
          if (e.status === 'CANCELLED' || e.date < oldest) continue;
          let id = `${e.date}-${feedId}-${slug(e.name)}`;
          for (let n = 2; used.has(id); n++) id = `${e.date}-${feedId}-${slug(e.name)}-${n}`;
          used.add(id);
          kept++;
          events.push({
            id,
            data: {
              name: e.name,
              date: e.date,
              start_time: e.start_time,
              type: f.type,
              distances: f.distances,
              venue: e.venue ?? 'TBA',
              host: f.host,
              url: e.url ?? f.link,
              price: f.price,
              description: e.description,
              added: f.added,
            },
          });
        }
        console.log(`[feeds] ${feedId}: ${kept} events${unsupported ? ` (${unsupported} repeating events with an unsupported rule skipped)` : ''}`);
        if (kept && f.replaces) replaced.add(f.replaces);
      } catch (err) {
        console.warn(`[feeds] ${feedId} skipped: ${(err as Error).message}`);
      }
    }
    return { events, replaced };
  })();
  return cached;
}
