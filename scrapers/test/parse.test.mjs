import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { parseStart } from '../lib/dates.mjs';
import { parseIcs } from '../lib/ics.mjs';
import { eventsFromJson, googleIcsUrls, scrapePage } from '../lib/browser.mjs';

test('parseStart handles the usual widget formats', () => {
  assert.deepEqual(parseStart('2026-11-07'), { date: '2026-11-07' });
  assert.deepEqual(parseStart('2026-11-07T08:00:00'), { date: '2026-11-07', start_time: '08:00' });
  assert.deepEqual(parseStart('2026-11-07T14:00:00Z'), { date: '2026-11-07', start_time: '08:00' });
  assert.deepEqual(parseStart('2026-11-07T08:00:00-06:00'), { date: '2026-11-07', start_time: '08:00' });
  assert.deepEqual(parseStart({ dateTime: '2026-11-11T00:30:00Z' }), { date: '2026-11-10', start_time: '18:30' });
  assert.deepEqual(parseStart(1794060000), parseStart('2026-11-07T14:00:00Z'));
  assert.equal(parseStart('soon'), undefined);
});

test('eventsFromJson finds the event list inside a nested payload', () => {
  const doc = { meta: { page: 1 }, data: { items: [
    { id: 1, title: 'Assisted Long Run @ Highland', start: { dateTime: '2026-11-07T08:00:00-06:00' }, location: 'Highland' },
    { id: 2, title: 'Northeast Tuesday Run', start_date: '2026-11-10 18:00:00' },
    { id: 3, label: 'not an event' },
  ] }, nav: [{ name: 'Home' }] };
  const evs = eventsFromJson(doc);
  assert.equal(evs.length, 2);
  assert.deepEqual(evs[0], { name: 'Assisted Long Run @ Highland', date: '2026-11-07', start_time: '08:00', venue: 'Highland', url: undefined, description: undefined });
  assert.equal(evs[1].start_time, '18:00');
});

test('googleIcsUrls turns an embed into its public feed', () => {
  assert.deepEqual(
    googleIcsUrls('https://calendar.google.com/calendar/embed?src=abc%40group.calendar.google.com&ctz=America%2FChicago'),
    ['https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/public/basic.ics'],
  );
  assert.deepEqual(googleIcsUrls('https://example.com/?src=x'), []);
});

test('parseIcs skips cancelled events and converts UTC', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Run\\, then coffee\r\nDTSTART:20261107T140000Z\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Gone\r\nSTATUS:CANCELLED\r\nDTSTART:20261108\r\nEND:VEVENT\r\nEND:VCALENDAR';
  assert.deepEqual(parseIcs(ics), [{ name: 'Run, then coffee', date: '2026-11-07', start_time: '08:00' }]);
});

test('scrapePage reads events a JS widget fetches as JSON', async (t) => {
  const server = createServer((req, res) => {
    if (req.url === '/api/events') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ events: [
        { name: 'Fresh Coffee Friday', startDate: '2026-11-13T06:30:00-06:00' },
        { name: 'BIPOC Community Run', startDate: '2026-11-12T18:00:00-06:00' },
      ] }));
    }
    res.setHeader('content-type', 'text/html');
    res.end(`<div id=cal></div><script>fetch('/api/events').then(r=>r.json()).then(d=>{cal.textContent=d.events.map(e=>e.name).join(', ')})</script>`);
  });
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const { events, method } = await scrapePage(`http://127.0.0.1:${server.address().port}/`, { waitMs: 500 });
  assert.equal(method, 'json');
  assert.deepEqual(events.map((e) => [e.name, e.date, e.start_time]), [
    ['Fresh Coffee Friday', '2026-11-13', '06:30'],
    ['BIPOC Community Run', '2026-11-12', '18:00'],
  ]);
});

test('scrapePage clicks "next" and merges each page of the widget', async (t) => {
  const pages = {
    1: [{ title: 'Highland Community Run', startDate: '2026-11-10T00:00:00.000Z' }],
    2: [{ title: 'Highland Community Run', startDate: '2026-11-10T00:00:00.000Z' }, { title: 'Turkey Trot', startDate: '2026-11-26T14:00:00.000Z' }],
  };
  const server = createServer((req, res) => {
    const m = req.url.match(/^\/api\/events\?page=(\d)/);
    if (m) {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ events: pages[m[1]] ?? [], page: +m[1] }));
    }
    res.setHeader('content-type', 'text/html');
    res.end(`<div id=cal></div><button aria-label="Next month" id=nx>›</button><script>
      let p=1; const load=()=>fetch('/api/events?page='+p).then(r=>r.json()).then(d=>{cal.textContent=d.events.length});
      nx.onclick=()=>{p++;load()}; load();</script>`);
  });
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const { events } = await scrapePage(`http://127.0.0.1:${server.address().port}/`, { waitMs: 300, nextClicks: 3 });
  assert.deepEqual(events.map((e) => [e.name, e.date, e.start_time]), [
    ['Highland Community Run', '2026-11-09', '18:00'],
    ['Turkey Trot', '2026-11-26', '08:00'],
  ]);
});
