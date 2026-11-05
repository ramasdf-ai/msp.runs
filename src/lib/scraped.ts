// Events scraped from club websites by scrapers/run.mjs, which writes
// src/data/scraped/<site>.json before each build (see scrapers/README.md).

import type { Event } from './events';

type ScrapedFile = { events: (Event['data'] & { id: string })[] };

const files = import.meta.glob<ScrapedFile>('../data/scraped/*.json', { eager: true, import: 'default' });

/**
 * Scraped events, minus any that a hand-entered event already covers
 * (same host, date and start time), so hand edits always win.
 */
export function scrapedEvents(handEntered: Event[]): Event[] {
  const key = (d: Event['data']) => `${d.host}|${d.date}|${d.start_time ?? ''}`;
  const taken = new Set(handEntered.map((e) => key(e.data)));
  return Object.values(files)
    .flatMap((f) => f.events ?? [])
    .filter((e) => !taken.has(key(e)))
    .map(({ id, ...data }) => ({ id, data: { distances: [], ...data } }));
}
