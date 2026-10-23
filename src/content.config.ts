import { defineCollection, z } from 'astro:content';
import { file } from 'astro/loaders';

// YAML parses bare dates into Date objects; normalize to YYYY-MM-DD strings.
const isoDate = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
);

const events = defineCollection({
  loader: file('src/data/events.yaml'),
  schema: z.object({
    name: z.string(),
    date: isoDate, // local Twin Cities date
    start_time: z.string().optional(), // "HH:MM" 24h; omit for all-day
    type: z.enum(['race', 'group-run', 'social', 'trail']),
    distances: z.array(z.string()).default([]),
    venue: z.string(),
    city: z.string().optional(),
    host: z.string(),
    url: z.string().url().optional(),
    price: z.string().optional(),
    description: z.string().optional(),
    added: isoDate,
  }),
});

const groups = defineCollection({
  loader: file('src/data/groups.yaml'),
  schema: z.object({
    name: z.string(),
    url: z.string().url().optional(),
    blurb: z.string().optional(),
  }),
});

export const collections = { events, groups };
