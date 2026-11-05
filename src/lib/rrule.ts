// Expands iCal repeating events (RRULE) into dated occurrences.
// Handles what club calendars actually use: FREQ=DAILY/WEEKLY/MONTHLY, INTERVAL, BYDAY
// (incl. "1SA"/"-1SU" for monthly), BYMONTHDAY, UNTIL, COUNT, plus EXDATE and edited
// single occurrences (RECURRENCE-ID), which replace or cancel the generated date.

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (t: Date) => t.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => {
  const t = toDate(d);
  t.setUTCDate(t.getUTCDate() + n);
  return iso(t);
};

export interface Rule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  byday: { n?: number; day: number }[];
  bymonthday: number[];
  until?: string; // YYYY-MM-DD local
  count?: number;
}

/** Parse an RRULE value. `untilDate` converts its UNTIL (often UTC) to a local date. */
export function parseRule(value: string, untilDate: (raw: string) => string | undefined): Rule | undefined {
  const p = Object.fromEntries(value.split(';').map((kv) => kv.split('=') as [string, string]));
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(p.FREQ)) return undefined;
  return {
    freq: p.FREQ as Rule['freq'],
    interval: Math.max(1, Number(p.INTERVAL ?? 1)),
    byday: (p.BYDAY ? p.BYDAY.split(',') : []).map((s) => {
      const m = s.match(/^([+-]?\d+)?([A-Z]{2})$/)!;
      return { n: m[1] ? Number(m[1]) : undefined, day: DAYS.indexOf(m[2]) };
    }),
    bymonthday: p.BYMONTHDAY ? p.BYMONTHDAY.split(',').map(Number) : [],
    until: p.UNTIL ? untilDate(p.UNTIL) : undefined,
    count: p.COUNT ? Number(p.COUNT) : undefined,
  };
}

function matches(rule: Rule, start: string, d: string): boolean {
  const t = toDate(d);
  const s = toDate(start);
  const dow = t.getUTCDay();
  if (rule.freq === 'DAILY') {
    const days = Math.round((+t - +s) / 864e5);
    return days % rule.interval === 0 && (!rule.byday.length || rule.byday.some((b) => b.day === dow));
  }
  if (rule.freq === 'WEEKLY') {
    // Weeks counted from the Monday on or before the start date.
    const monday = (x: Date) => +x - ((x.getUTCDay() + 6) % 7) * 864e5;
    const weeks = Math.round((monday(t) - monday(s)) / (7 * 864e5));
    const days = rule.byday.length ? rule.byday.map((b) => b.day) : [s.getUTCDay()];
    return weeks % rule.interval === 0 && days.includes(dow);
  }
  // MONTHLY
  const months = (t.getUTCFullYear() - s.getUTCFullYear()) * 12 + t.getUTCMonth() - s.getUTCMonth();
  if (months % rule.interval !== 0) return false;
  const dom = t.getUTCDate();
  if (rule.bymonthday.length) return rule.bymonthday.includes(dom);
  if (rule.byday.length) {
    const daysInMonth = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    const nth = Math.ceil(dom / 7);
    const nthFromEnd = -Math.ceil((daysInMonth - dom + 1) / 7);
    return rule.byday.some((b) => b.day === dow && (b.n === undefined || b.n === nth || b.n === nthFromEnd));
  }
  return dom === s.getUTCDate();
}

/** Dates (YYYY-MM-DD) the rule produces from `start`, between `from` and `to` inclusive. */
export function occurrences(rule: Rule, start: string, from: string, to: string, exdates: Set<string> = new Set()): string[] {
  const out: string[] = [];
  const last = rule.until && rule.until < to ? rule.until : to;
  let n = 0;
  for (let d = start; d <= last; d = addDays(d, 1)) {
    if (!matches(rule, start, d)) continue;
    n++; // COUNT includes excluded dates, per the spec
    if (rule.count && n > rule.count) break;
    if (d >= from && !exdates.has(d)) out.push(d);
  }
  return out;
}
