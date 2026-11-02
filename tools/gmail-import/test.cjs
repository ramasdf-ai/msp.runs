// node tools/gmail-import/test.cjs — checks the pure helpers in Code.gs.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const ctx = { module: { exports: {} }, console };
vm.runInNewContext(fs.readFileSync(__dirname + '/Code.gs', 'utf8'), ctx);
const { parseIcs, mapColumns, toRow, parseSender, guessType } = ctx.module.exports;
// Objects come from another realm, so compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));

const fmt = (o) => (d) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', ...o }).format(d).replace(/ /g, ' ');
const fmtDate = fmt({ month: 'numeric', day: 'numeric', year: 'numeric' });
const fmtTime = fmt({ hour: 'numeric', minute: '2-digit' });

const ics = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:abc@runsignup',
  'SUMMARY:Turkey Trot 5K\\, Lake Nokomis',
  'DTSTART;TZID=America/Chicago:20261126T080000',
  'LOCATION:Lake Nokomis\\, Minneapolis',
  'DESCRIPTION:Register at https://runsignup.com/x\\nSee you there',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:def',
  'SUMMARY:Winter Social Run',
  'DTSTART:20261210T003000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Holiday Trail Day',
  'DTSTART;VALUE=DATE:20261219',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const evs = parseIcs(ics, fmtDate, fmtTime);
assert.strictEqual(evs.length, 3);
assert.deepStrictEqual(
  { name: evs[0].name, date: evs[0].date, t: evs[0].start_time, venue: evs[0].venue, url: evs[0].url },
  { name: 'Turkey Trot 5K, Lake Nokomis', date: '11/26/2026', t: '8:00 AM', venue: 'Lake Nokomis, Minneapolis', url: 'https://runsignup.com/x' },
);
// 00:30 UTC Dec 10 = 6:30 PM Dec 9 Central
assert.deepStrictEqual(plain([evs[1].date, evs[1].start_time]), ['12/9/2026', '6:30 PM']);
assert.deepStrictEqual(plain([evs[2].date, evs[2].start_time]), ['12/19/2026', null]);

const header = ['Timestamp', 'Email Address', 'Event name', 'Event date', 'Start time', 'Type', 'Venue', 'Host / club', 'Approved'];
const col = mapColumns(header);
assert.deepStrictEqual(plain(Object.keys(col).sort()), ['approved', 'email', 'host', 'name', 'start_time', 'timestamp', 'type', 'date', 'venue'].sort());
const row = toRow(header.length, col, { name: 'X', date: '1/2/2027', approved: 'yes', email: 'a@b.c' });
assert.strictEqual(row[8], '', 'never writes Approved');
assert.strictEqual(row[2], 'X');

assert.deepStrictEqual(plain(parseSender('"Mill City Running" <News@MillCity.com>')), { name: 'Mill City Running', email: 'news@millcity.com' });
assert.strictEqual(guessType('Turkey Trot 5K'), 'Race');
assert.strictEqual(guessType('Saturday long run'), 'Group run');
console.log('ok');
