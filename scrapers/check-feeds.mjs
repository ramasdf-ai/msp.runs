// Fetch every feed in src/data/feeds.yaml and report what it holds, so a new feed can be
// checked from GitHub Actions (this repo's dev container can't reach most calendars).
//   node check-feeds.mjs            # all feeds
//   node check-feeds.mjs <id>       # one feed

import { readFile } from 'node:fs/promises';
import { parseIcs } from './lib/ics.mjs';
import { todayLocal } from './lib/dates.mjs';

const yaml = await readFile(new URL('../src/data/feeds.yaml', import.meta.url), 'utf8');
const feeds = [...yaml.matchAll(/^- id: (\S+)\n(?:  .*\n)*?  url: (\S+)/gm)].map(([, id, url]) => ({ id, url }));
const only = process.argv[2];
const today = todayLocal();

for (const { id, url } of feeds.filter((f) => !only || f.id === only)) {
  try {
    const res = await fetch(url.replace(/^webcal:/, 'https:'));
    const text = await res.text();
    const all = parseIcs(text);
    const upcoming = all.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const rrules = (text.match(/^RRULE:/gm) ?? []).length;
    console.log(`== ${id}: HTTP ${res.status}, ${all.length} events, ${upcoming.length} upcoming, ${rrules} repeating (RRULE)`);
    // Repeating events that may still produce future dates (no UNTIL/COUNT, or UNTIL ahead).
    const blocks = text.split('BEGIN:VEVENT').slice(1);
    const live = blocks.filter((b) => {
      const r = b.match(/^RRULE:(.*)$/m)?.[1];
      if (!r) return false;
      const until = r.match(/UNTIL=(\d{8})/)?.[1];
      return until ? until >= today.replace(/-/g, '') : !/COUNT=/.test(r);
    });
    console.log(`   ${live.length} repeating events still active`);
    for (const b of live.slice(0, 6)) console.log(`   RRULE ${b.match(/^SUMMARY:(.*)$/m)?.[1]} | ${b.match(/^DTSTART[^:]*:(.*)$/m)?.[1]} | ${b.match(/^RRULE:(.*)$/m)?.[1]}`);
    for (const e of upcoming.slice(0, 8)) console.log(`   ${e.date} ${e.start_time ?? 'all day'}  ${e.name}  @ ${e.venue ?? '-'}`);
  } catch (err) {
    console.log(`== ${id}: FAILED ${err.message}`);
  }
}
