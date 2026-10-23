import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Escape per RFC 5545 and fold lines at 75 octets (approximated as chars).
const esc = (s: string) => s.replace(/[\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
const fold = (line: string) => line.match(/.{1,74}/g)!.join('\r\n ');
const ymd = (d: string) => d.replaceAll('-', '');

function nextDay(d: string) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

export const GET: APIRoute = async ({ site }) => {
  const events = await getCollection('events');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//msp.run//events//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:msp.run · Twin Cities running',
    'X-WR-TIMEZONE:America/Chicago',
  ];
  for (const { id, data: e } of events) {
    const page = new URL(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/events/${id}`, site).href;
    lines.push('BEGIN:VEVENT', `UID:${id}@msp.run`, `DTSTAMP:${stamp}`);
    if (e.start_time) {
      // Assume a 90-minute default duration; most runs fit.
      const [h, m] = e.start_time.split(':').map(Number);
      const end = h * 60 + m + 90;
      const hhmm = (mins: number) => String(Math.floor(mins / 60) % 24).padStart(2, '0') + String(mins % 60).padStart(2, '0');
      lines.push(
        `DTSTART;TZID=America/Chicago:${ymd(e.date)}T${hhmm(h * 60 + m)}00`,
        `DTEND;TZID=America/Chicago:${ymd(e.date)}T${hhmm(Math.min(end, 23 * 60 + 59))}00`,
      );
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(e.date))}`);
    }
    const desc = [e.host, e.distances.join(' / '), e.price, e.description, e.url ?? page].filter(Boolean).join('\n');
    lines.push(
      `SUMMARY:${esc(e.name)}`,
      `LOCATION:${esc([e.venue, e.city].filter(Boolean).join(', '))}`,
      `DESCRIPTION:${esc(desc)}`,
      `URL:${page}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
};
