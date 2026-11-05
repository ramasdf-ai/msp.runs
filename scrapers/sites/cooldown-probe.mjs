// TEMPORARY probe: renders Cooldown Running's Pie pages and logs what they expose.
// Not for merging.
import { chromium } from 'playwright';

export const id = 'cooldown-probe';
export const url = 'https://getpie.app/p/01a06922-325d-711a-83c0-cde8d5d89d04';
const URLS = [url, 'https://getpie.app/plans/fca18a2c-df28-4866-bce4-0f1d64ccac82'];

export async function scrape() {
  const browser = await chromium.launch();
  try {
    for (const u of URLS) {
      const page = await browser.newPage();
      page.on('response', async (r) => {
        const t = r.headers()['content-type'] ?? '';
        if (!/json/.test(t)) return;
        let body = '';
        try { body = (await r.text()).slice(0, 3000); } catch {}
        console.log(`PIEJSON ${r.status()} ${r.request().method()} ${r.url().slice(0, 200)}\n${body}\n`);
      });
      await page.goto(u, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => console.log('goto', e.message));
      await page.waitForTimeout(4000);
      console.log(`PIETEXT ${u}\n${(await page.innerText('body').catch(() => '')).slice(0, 4000)}\n`);
      const meta = await page.$$eval('meta[property^="og:"], meta[name="description"], script[type="application/ld+json"]', (els) => els.map((e) => e.outerHTML.slice(0, 800)));
      console.log('PIEMETA', JSON.stringify(meta, null, 1));
      await page.close();
    }
  } finally { await browser.close(); }
  return { events: [], method: 'probe', source: {} };
}
