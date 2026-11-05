// Minimal iCal (.ics) reader: one entry per VEVENT, repeating rules not expanded.

import { localParts } from './dates.mjs';

function parseDt(value) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{2}(Z)?)?$/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, z] = m;
  if (!h) return { date: `${y}-${mo}-${d}` };
  if (z) return localParts(new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi)));
  return { date: `${y}-${mo}-${d}`, start_time: `${h}:${mi}` }; // TZID or floating: local time
}

export function parseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const unesc = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
  const out = [];
  let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT') {
      if (ev?.name && ev.date && ev.status !== 'CANCELLED') out.push(ev);
      ev = null;
      continue;
    }
    if (!ev) continue;
    const m = line.match(/^([A-Z-]+)(?:;[^:]*)?:(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key === 'SUMMARY') ev.name = unesc(value);
    else if (key === 'LOCATION') ev.venue = unesc(value) || undefined;
    else if (key === 'URL') ev.url = value.trim();
    else if (key === 'DESCRIPTION') ev.description = unesc(value) || undefined;
    else if (key === 'STATUS') ev.status = value.trim().toUpperCase();
    else if (key === 'DTSTART') Object.assign(ev, parseDt(value.trim()));
  }
  return out;
}
