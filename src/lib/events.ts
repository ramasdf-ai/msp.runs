import { getCollection, type CollectionEntry } from 'astro:content';
import { submittedEvents } from './submissions';

export type Event = Pick<CollectionEntry<'events'>, 'id' | 'data'> & { series?: string };

const TZ = 'America/Chicago';

export function todayLocal(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKS_AHEAD = 6;

function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

async function recurringEvents(): Promise<Event[]> {
  const today = todayLocal();
  const out: Event[] = [];
  for (const { id, data: r } of await getCollection('recurring')) {
    const offset = (WEEKDAYS.indexOf(r.weekday) - new Date(`${today}T00:00:00Z`).getUTCDay() + 7) % 7;
    for (let w = 0; w < WEEKS_AHEAD; w++) {
      const date = addDays(today, offset + w * 7);
      if ((r.starts && date < r.starts) || (r.ends && date > r.ends)) continue;
      const { weekday, starts, ends, ...rest } = r;
      out.push({ id: `${date}-${id}`, series: id, data: { ...rest, date, price: undefined } });
    }
  }
  return out;
}

export async function allEvents(): Promise<Event[]> {
  const oneOff: Event[] = (await getCollection('events')).map(({ id, data }) => ({ id, data }));
  return [...oneOff, ...(await recurringEvents()), ...(await submittedEvents())].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

export async function upcomingEvents(): Promise<Event[]> {
  const today = todayLocal();
  return (await allEvents()).filter((e) => e.data.date >= today);
}

export async function recentlyAdded(n = 3): Promise<Event[]> {
  // Show a weekly run once, by its next date, not every week of it.
  const seen = new Set<string>();
  return (await upcomingEvents())
    .filter((e) => !e.series || (!seen.has(e.series) && seen.add(e.series)))
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
