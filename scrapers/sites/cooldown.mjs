// Cooldown Running's Minneapolis walk/run club, posted as "plans" on the Pie app
// (getpie.app/p/cooldownmsp). Pie's web page is JavaScript-only, but it loads from a
// public JSON API, so this reads the API directly and needs no browser.

import { parseStart } from '../lib/dates.mjs';

export const id = 'cooldown';
const COMMUNITY = '01a06922-325d-711a-83c0-cde8d5d89d04';
const API = 'https://plans-service.getpie.app/api/public/v2/plans';
export const url = `https://getpie.app/p/${COMMUNITY}`;

async function getJson(u) {
  const res = await fetch(u, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${u}`);
  return res.json();
}

export async function scrape() {
  const list = await getJson(`${API}/community/${COMMUNITY}`);
  const events = [];
  for (const p of list.future ?? []) {
    // The list only has "Monday, Nov 09" with no year; the details have the real timestamp.
    const d = await getJson(`${API}/details/${p.planId}`);
    const meta = d.analytics?.metadata ?? {};
    const start = parseStart(meta.start_at);
    if (!start) continue;
    events.push({
      name: p.title ?? meta.plan_title ?? 'Cooldown Walk / Run Club',
      ...start,
      type: 'group-run',
      distances: ['1–3 mi'],
      // "1401 West River Rd N, Minneapolis, MN 55411, USA" -> "1401 West River Rd N"
      venue: [p.venue, d.addressString?.split(',')[0]].filter(Boolean).join(', ') || 'TBA',
      city: 'Minneapolis',
      host: 'Cooldown Running',
      url: `https://getpie.app/plans/${p.planId}`,
      price: p.priceString ?? undefined,
      description: 'Walk, run, or jog 1–3 miles. All ability levels welcome. RSVP on Pie.',
    });
  }
  return { events, method: 'pie-api', source: `${API}/community/${COMMUNITY}` };
}
