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

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml` (enable Pages → Source: GitHub Actions in repo settings). It also rebuilds hourly, so past events drop off and approved submissions appear.

## Form submissions

The "Submit your event" Google Form writes to a response sheet. That sheet, published as CSV, is read on every build through the `SUBMISSIONS_CSV_URL` repository secret, which is kept out of the repo because the sheet contains submitters' emails.

- Type `yes` in a row's **Approved** column to publish it.
- Once an email has an approved event, its later submissions go live automatically (leave **Approved** blank).
- Type `no` to hide any event. Trust only comes from a `yes`.

The site rebuilds hourly, so changes show up within the hour. If the sheet can't be reached, the build skips submissions instead of failing.

## Scraped calendars

Clubs without an iCal feed are scraped with a headless browser on every build;
see [`scrapers/README.md`](scrapers/README.md). Results land in
`src/data/scraped/` and are committed back to `main` when they change. A
hand-entered event with the same host, date and start time always wins over a
scraped one.
