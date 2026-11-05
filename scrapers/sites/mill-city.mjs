// Mill City Running's store calendar (a JavaScript widget on their Shopify site).

import { scrapePage } from '../lib/browser.mjs';

export const id = 'mill-city';
export const url = 'https://www.millcityrunning.com/pages/calendar';

const STORES = [
  { match: /highland|cleveland/i, venue: '767 Cleveland Ave S (Mill City Running Highland)', city: 'St. Paul' },
  { match: /northeast|\bne\b|hennepin/i, venue: '411 E Hennepin Ave (Mill City Running Northeast)', city: 'Minneapolis' },
];

function typeOf(name) {
  if (/\b(race|5k|10k|half|marathon|relay|mile)\b/i.test(name) && !/training|program|long run/i.test(name)) return 'race';
  if (/demo|party|social|clinic|night|happy hour|launch/i.test(name)) return 'social';
  return 'group-run';
}

export async function scrape({ debugDir }) {
  const found = await scrapePage(url, { debugDir });
  const events = found.events.map((e) => {
    const store = STORES.find((s) => s.match.test(`${e.name} ${e.venue ?? ''}`));
    return {
      name: e.name,
      date: e.date,
      start_time: e.start_time,
      type: typeOf(e.name),
      venue: store?.venue ?? e.venue ?? 'Mill City Running',
      city: store?.city,
      host: 'Mill City Running',
      url: e.url ?? url,
      description: e.description?.slice(0, 600),
    };
  });
  return { ...found, events };
}
