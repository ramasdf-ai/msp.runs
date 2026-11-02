// Events submitted through the Google Form, read from its response sheet
// (published as CSV) at build time.
//
// A row goes live when:
//   - its Approved cell is "yes", or
//   - its Approved cell is blank and the submitter's email already has an
//     approved row (trusted organizer).
// "no" in Approved always hides the row. Trust only comes from a "yes".
//
// The CSV URL lives in the SUBMISSIONS_CSV_URL secret, not in the repo,
// because the sheet includes submitters' emails.

import type { Event } from './events';

const TYPES = ['race', 'group-run', 'social', 'trail'] as const;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

// Google Forms exports dates as M/D/YYYY and times as h:mm:ss AM/PM.
export function toIsoDate(s: string): string | undefined {
  s = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : undefined;
}

export function to24h(s: string): string | undefined {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$/i);
  if (!m) return undefined;
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

function toType(s: string): Event['data']['type'] {
  const t = s.toLowerCase();
  if (t.includes('trail')) return 'trail';
  if (t.includes('social')) return 'social';
  if (t.includes('group')) return 'group-run';
  return 'race';
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

// Match form questions by keyword so small wording changes don't break the import.
const COLUMNS: Record<string, RegExp> = {
  timestamp: /^timestamp$/i,
  email: /email/i,
  approved: /^approved$/i,
  name: /event name|^name$/i,
  date: /^date|event date/i,
  start_time: /time/i,
  type: /type/i,
  distances: /distance/i,
  venue: /venue|location|meeting/i,
  city: /city/i,
  host: /host|organi[sz]er|club/i,
  url: /link|url|website|registration/i,
  price: /price|cost/i,
  description: /description|details|notes/i,
};

export function eventsFromRows(rows: string[][]): Event[] {
  const [header, ...body] = rows;
  if (!header) return [];
  const col: Record<string, number> = {};
  for (const [key, re] of Object.entries(COLUMNS)) {
    col[key] = header.findIndex((h, i) => re.test(h.trim()) && !Object.values(col).includes(i));
  }
  const get = (r: string[], key: string) => (col[key] >= 0 ? (r[col[key]] ?? '').trim() : '');

  const approval = (r: string[]) => get(r, 'approved').toLowerCase();
  const email = (r: string[]) => get(r, 'email').toLowerCase();
  const trusted = new Set(body.filter((r) => approval(r) === 'yes' && email(r)).map(email));

  const used = new Set<string>();
  const out: Event[] = [];
  for (const r of body) {
    const a = approval(r);
    if (!(a === 'yes' || (a === '' && trusted.has(email(r))))) continue;
    const date = toIsoDate(get(r, 'date'));
    const name = get(r, 'name');
    if (!date || !name) continue;
    let id = `${date}-${slug(name)}`;
    for (let n = 2; used.has(id); n++) id = `${date}-${slug(name)}-${n}`;
    used.add(id);
    const url = get(r, 'url');
    out.push({
      id,
      data: {
        name,
        date,
        start_time: to24h(get(r, 'start_time')),
        type: toType(get(r, 'type')),
        distances: get(r, 'distances').split(/[,;]/).map((d) => d.trim()).filter(Boolean),
        venue: get(r, 'venue') || 'TBA',
        city: get(r, 'city') || undefined,
        host: get(r, 'host') || 'Community submission',
        url: /^https?:\/\//.test(url) ? url : undefined,
        price: get(r, 'price') || undefined,
        description: get(r, 'description') || undefined,
        added: toIsoDate(get(r, 'timestamp')) ?? date,
      },
    });
  }
  return out;
}

let cached: Promise<Event[]> | undefined;

export function submittedEvents(): Promise<Event[]> {
  const src = process.env.SUBMISSIONS_CSV_URL;
  if (!src) return Promise.resolve([]);
  cached ??= fetch(src)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then((text) => {
      const rows = parseCsv(text);
      const events = eventsFromRows(rows);
      console.log(`[submissions] ${Math.max(rows.length - 1, 0)} responses, ${events.length} published`);
      return events;
    })
    .catch((err) => {
      // Never fail the deploy over the sheet; just skip submissions this build.
      console.warn(`[submissions] skipped: ${err.message}`);
      return [];
    });
  return cached;
}
