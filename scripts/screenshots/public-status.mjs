/**
 * The page a client actually watches.
 *
 * It needs no password, it is the link that got emailed, and it is where
 * somebody checks progress for six weeks — which makes it the most-read
 * screen the studio owns and the one with the fewest eyes on it internally,
 * because nobody on the team has a reason to open it.
 *
 * Four states are worth having in front of you: mid-build, waiting on the
 * client's own design approval, finished with something to point at, and the
 * link having been turned off. The last one is the only page in the product a
 * visitor can reach while holding a credential that used to work, so what it
 * says matters more than how it looks.
 *
 * ## Running it
 *
 *   npm i -D playwright --no-save   # not a project dependency; see below
 *   npm run dev                     # a real dev server, no database needed
 *   node scripts/screenshots/public-status.mjs
 *
 * Captured at 1500px and at an iPhone's 393px. The phone matters most here:
 * this link is opened from an email, and email is read on a phone.
 *
 * Playwright is deliberately NOT in package.json, for the reason
 * scripts/screenshots/billing.mjs gives.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.SHOT_BASE_URL || 'http://localhost:3000';
const OUT = process.env.SHOT_OUT || path.join(process.cwd(), '.screenshots');
const CHROMIUM = process.env.CHROMIUM_PATH;

fs.mkdirSync(OUT, { recursive: true });

const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const PROJECT_ID = 'p_northgate';
const TOKEN = 'tok_northgate';

const updates = [
  { id: 'u_3', title: 'Into the build', description: 'Designs are signed off — we are writing the software now.', statusStage: 'build', createdAt: day(6) },
  { id: 'u_2', title: 'Design ready to review', description: 'Have a look and tell us what you think.', statusStage: 'design', createdAt: day(14) },
  { id: 'u_1', title: 'Kick-off', description: 'Thanks for the answers — we have everything we need to start.', statusStage: 'discovery', createdAt: day(40) },
];

const STATES = {
  building: {
    name: 'Northgate — Website', company: 'Northgate Dental', statusStage: 2,
    estimatedCompletionDate: day(-18), liveUrl: null, awaitingYourReview: null, updates,
  },
  /*
   * The one state where nothing moves until the client acts. Before this
   * existed on the page they saw "Design · Stage 2 of 5" and no hint that
   * they were the holdup.
   */
  awaiting: {
    name: 'Northgate — Website', company: 'Northgate Dental', statusStage: 1,
    estimatedCompletionDate: day(-24), liveUrl: null,
    awaitingYourReview: { presentedAt: day(3), reviewEndsAt: day(-4) },
    updates: updates.slice(1),
  },
  live: {
    name: 'Northgate — Website', company: 'Northgate Dental', statusStage: 4,
    estimatedCompletionDate: day(2), liveUrl: 'https://northgatedental.example',
    awaitingYourReview: null,
    updates: [{ id: 'u_4', title: 'Live', description: 'It is shipped. Thank you for a good project.', statusStage: 'complete', createdAt: day(1) }, ...updates],
  },
};

const DEVICES = [
  { key: 'desk', viewport: { width: 1500, height: 1200 }, scale: 2, mobile: false },
  { key: 'phone', viewport: { width: 393, height: 852 }, scale: 3, mobile: true },
];

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
console.log(`\nPublic status screenshots → ${OUT}\n`);

let overflowed = false;

for (const device of DEVICES) {
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.scale,
    isMobile: device.mobile,
    hasTouch: device.mobile,
  });
  const page = await context.newPage();

  let state = 'building';
  let revoked = false;

  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/api/public/projects/')) {
      // What a rotated token gets: the same 404 a wrong one gets, deliberately.
      if (revoked) return json({ error: 'Not found' }, 404);
      return json({ success: true, project: STATES[state] });
    }
    return json({ success: true });
  });

  let n = 0;
  async function shot(name, note) {
    const file = path.join(OUT, `status-${device.key}-${String(++n).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const tall = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(`  ${path.relative(process.cwd(), file)}  ${String(tall).padStart(5)}px  — ${note}`);
  }

  async function checkWidth(where) {
    const w = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    if (w.page > w.viewport) {
      overflowed = true;
      console.log(`  !! ${device.key} ${where}: page is ${w.page}px in a ${w.viewport}px viewport.`);
    }
  }

  const open = async () => {
    await page.goto(`${BASE}/status/${PROJECT_ID}?t=${TOKEN}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
  };

  await open();
  await shot('building', 'mid-build, with a target date');
  await checkWidth('building');

  state = 'awaiting';
  await open();
  await shot('awaiting-review', 'waiting on them — the one state where nothing moves without the client');
  await checkWidth('awaiting review');

  state = 'live';
  await open();
  await shot('live', 'finished, with somewhere to send them');
  await checkWidth('live');

  revoked = true;
  await open();
  await shot('revoked', 'a link that has been turned off');
  await checkWidth('revoked');

  await context.close();
}

await browser.close();
console.log(`\n${overflowed ? 'Done, with an overflow above.' : 'Done — nothing overflowed.'}\n`);
process.exit(overflowed ? 1 : 0);
