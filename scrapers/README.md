# Scrapers

Some clubs only publish their schedule in a JavaScript calendar widget with no
iCal feed. These scrapers load those pages in headless Chromium during the
GitHub Actions build and write `src/data/scraped/<site>.json`, which the site
reads like any other event list.

Prefer an iCal feed (`src/data/feeds.yaml`) whenever a club has one: it's more
reliable and needs no browser. The scraper says so in the build log if it finds one.

## How a scraper finds events

`lib/browser.mjs` opens the page, records every network request, and takes the first of:

1. an iCal feed the page links to or embeds (including Google Calendar embeds),
2. the JSON response that looks most like a list of events (what most widgets fetch),
3. schema.org `Event` data in the page.

Each site file in `sites/` maps those raw events to the site's fields (venue, host, type).

## When a scraper breaks

It never breaks the site. The build keeps the last good JSON, shows a ⚠️ in the
run summary, and deploys anyway. It also refuses a result that drops below a
third of the last list, in case the page half-loaded.

To see what the browser saw, run **Actions → Test scrapers** (it also runs on
any branch push that touches `scrapers/`) and download the `scrape-debug`
artifact: `page.html`, `screenshot.png` and `network.json` per site.

## Adding a site

Copy `sites/mill-city.mjs`, change `id`, `url` and the field mapping. Skip
login-walled sources (Instagram, Strava): they block bots and their terms forbid it.

## Run locally

```sh
cd scrapers
npm ci && npx playwright install chromium
npm test
DEBUG_DIR=debug node run.mjs          # or: node run.mjs mill-city
```
