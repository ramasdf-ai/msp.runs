# msp.run

The unofficial calendar of Twin Cities running events, modeled on [msp.bike](https://msp.bike).

## Adding an event

Edit `src/data/events.yaml` and add an entry:

```yaml
- id: 2026-11-26-turkey-trot   # date + short slug, must be unique
  name: Turkey Trot
  date: 2026-11-26
  start_time: "08:00"          # 24h, omit for all-day
  type: race                   # race | group-run | social | trail
  distances: [5K, 10K]
  venue: Lake Nokomis
  city: Minneapolis
  host: Some Running Club
  url: https://...             # registration or info link
  price: "$40"
  added: 2026-10-23            # drives "Recently added"
```

Clubs and run groups live in `src/data/groups.yaml`. Set the Google Form link in `src/lib/site.ts`.

## Develop

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs dist/
```

## Deploy

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml` (enable Pages → Source: GitHub Actions in repo settings). It also rebuilds daily so past events drop off.
