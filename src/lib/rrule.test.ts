// Run: node src/lib/rrule.test.ts
import assert from 'node:assert/strict';
import { parseRule, occurrences } from './rrule.ts';
const u = (raw: string) => `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;
// weekly Thursday since 2019, no end
let r = parseRule('FREQ=WEEKLY;WKST=MO', u)!;
assert.deepEqual(occurrences(r, '2019-10-31', '2026-11-01', '2026-11-20'), ['2026-11-05','2026-11-12','2026-11-19']);
// weekly Sundays with UNTIL and EXDATE
r = parseRule('FREQ=WEEKLY;WKST=SU;UNTIL=20261122T045959Z;INTERVAL=1;BYDAY=SU', u)!;
assert.deepEqual(occurrences(r, '2026-11-01', '2026-11-01', '2026-12-31', new Set(['2026-11-08'])), ['2026-11-01','2026-11-15','2026-11-22']);
// every other Tue/Thu
r = parseRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH', u)!;
assert.deepEqual(occurrences(r, '2026-11-03', '2026-11-01', '2026-11-30'), ['2026-11-03','2026-11-05','2026-11-17','2026-11-19']);
// COUNT
r = parseRule('FREQ=DAILY;COUNT=3', u)!;
assert.deepEqual(occurrences(r, '2026-11-03', '2026-11-04', '2026-11-30'), ['2026-11-04','2026-11-05']);
// monthly first Saturday, last Sunday
r = parseRule('FREQ=MONTHLY;BYDAY=1SA', u)!;
assert.deepEqual(occurrences(r, '2026-11-07', '2026-11-01', '2027-01-31'), ['2026-11-07','2026-12-05','2027-01-02']);
r = parseRule('FREQ=MONTHLY;BYDAY=-1SU', u)!;
assert.deepEqual(occurrences(r, '2026-11-29', '2026-11-01', '2027-01-31'), ['2026-11-29','2026-12-27','2027-01-31']);
assert.equal(parseRule('FREQ=YEARLY', u), undefined);
console.log('rrule ok');
