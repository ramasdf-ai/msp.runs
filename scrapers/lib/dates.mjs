// Date helpers. Everything on the site is Twin Cities local time.

export const TZ = 'America/Chicago';

const pad = (n) => String(n).padStart(2, '0');

/** A Date (an instant) -> { date: 'YYYY-MM-DD', start_time: 'HH:MM' } in Twin Cities time. */
export function localParts(d) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t) => f.find((p) => p.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, start_time: `${g('hour')}:${g('minute')}` };
}

/**
 * Parse the many shapes a calendar widget uses for a start time:
 * "2026-11-07", "2026-11-07T08:00:00", "2026-11-07T14:00:00Z", "2026-11-07T08:00:00-06:00",
 * unix seconds/ms, or Google's { dateTime } / { date } objects.
 * Strings with no offset are taken as local time. Returns undefined if unparseable.
 */
export function parseStart(v) {
  if (v == null) return undefined;
  if (typeof v === 'object' && !(v instanceof Date)) return parseStart(v.dateTime ?? v.date_time ?? v.date ?? v.local ?? v.utc);
  if (v instanceof Date) return isNaN(v) ? undefined : localParts(v);
  if (typeof v === 'number') return localParts(new Date(v < 1e11 ? v * 1000 : v));
  const s = String(v).trim();
  if (/^\d{10,13}$/.test(s)) return parseStart(Number(s));
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { date: s };
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (m) {
    const [, y, mo, d, h, mi, off] = m;
    if (!off) return { date: `${y}-${mo}-${d}`, start_time: `${h}:${mi}` };
    return localParts(new Date(s));
  }
  // Last resort: something Date can read, like "Sat, 07 Nov 2026 14:00:00 GMT".
  const t = Date.parse(s);
  return isNaN(t) ? undefined : localParts(new Date(t));
}

export function todayLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export { pad };
