import { getCollection, type CollectionEntry } from 'astro:content';

export type Event = CollectionEntry<'events'>;

const TZ = 'America/Chicago';

export function todayLocal(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export async function upcomingEvents(): Promise<Event[]> {
  const today = todayLocal();
  return (await getCollection('events'))
    .filter((e) => e.data.date >= today)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

export async function recentlyAdded(n = 3): Promise<Event[]> {
  return (await upcomingEvents())
    .sort((a, b) => b.data.added.localeCompare(a.data.added))
    .slice(0, n);
}

const sortKey = (e: Event) => `${e.data.date} ${e.data.start_time ?? '00:00'}`;

// Dates are calendar dates, so format them in UTC to avoid shifting the day.
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

export const fmtDay = (d: string) =>
  asDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export const fmtLongDay = (d: string) =>
  asDate(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export const fmtMonth = (d: string) =>
  asDate(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function fmtTime(t?: string): string {
  if (!t) return 'All day';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
