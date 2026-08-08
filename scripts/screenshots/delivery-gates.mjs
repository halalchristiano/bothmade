/**
 * Photographs this round's two fixes on the real pages, driving a real
 * browser against a real dev server and a real database.
 *
 * It prints the text it is photographing before each shot. A screenshot on
 * its own proves a page rendered; it does not prove the sentence in it says
 * what the commit claims, and half the value of doing this is catching the
 * shot taken mid-"Saving…" or scrolled past the thing it was meant to show.
 *
 *   BOTHMADE_SHOT_DIR=... node scripts/screenshots/delivery-gates.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BOTHMADE_BASE ?? 'http://localhost:3100';
const OUT = process.env.BOTHMADE_SHOT_DIR ?? '/tmp/delivery-shots';
const EMAIL = 'kiana@bothmade.studio';
const PASSWORD = 'screenshot-only';

fs.mkdirSync(OUT, { recursive: true });

let step = 0;
async function shot(page, name) {
  step += 1;
  const file = path.join(OUT, `${String(step).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  → ${path.basename(file)}`);
}

/*
 * Next's App Router injects <next-route-announcer role="alert"> on every
 * page — permanently present and permanently empty. Counting it would make
 * "no alert on screen" impossible to assert, so every query here asks for
 * alerts that actually say something.
 */
const speakingAlerts = (page) => page.locator('[role="alert"]:not(:empty)');

/** Wait for the alert, scroll it into view, and say out loud what it says. */
async function readAlert(page, label) {
  const alert = speakingAlerts(page).first();
  await alert.waitFor({ state: 'visible', timeout: 15_000 });
  await alert.scrollIntoViewIfNeeded();
  const text = (await alert.innerText()).replace(/\s+/g, ' ').trim();
  console.log(`  ${label}: ${text}`);
  return text;
}

const main = async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BOTHMADE_CHROMIUM ?? undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });

  console.log('\nLogging in');
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  /*
   * Typed, then read back before pressing Login.
   *
   * These are controlled inputs. A fill() that lands before React hydrates
   * sets the DOM value and never reaches state, so the form posts empty and
   * the page answers "Email and password are required" — which looks exactly
   * like a wrong password and is neither.
   */
  const email = page.getByLabel(/email/i);
  const password = page.getByLabel(/password/i);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await email.fill(EMAIL);
    await password.fill(PASSWORD);
    if ((await email.inputValue()) === EMAIL && (await password.inputValue()) === PASSWORD) break;
    await page.waitForTimeout(500);
  }
  await page.getByRole('button', { name: /^login$/i }).click();
  try {
    await page.waitForURL(/\/admin\/(?!login)/, { timeout: 30_000 });
  } catch {
    // Say why rather than timing out into a stack trace — nine times out of
    // ten it is the login rate limiter, and the page is already saying so.
    const said = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300);
    throw new Error(`still on ${page.url()} — page says: ${said}`);
  }
  console.log('  signed in');

  /* ------------------------------------------------------------------ */
  console.log('\nFUNCTIONALITY — a launch confirmed in writing, still at Build');
  await page.goto(`${BASE}/admin/deployment`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, 'deployment-board-ready-for-launch');

  const boardText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  console.log(`  BOARD SAYS: ${boardText.slice(0, 260)}`);

  console.log('\n  …and the payment schedule on the project itself');
  await page.goto(`${BASE}/admin/projects`, { waitUntil: 'networkidle' });
  await page.getByText('Havisham Joinery').first().click();
  await page.waitForTimeout(2500);
  const p3 = page.getByText('Payment 3 of 3').first();
  if (await p3.count()) {
    await p3.scrollIntoViewIfNeeded();
    console.log(`  PANEL SAYS: ${(await p3.locator('xpath=ancestor::*[4]').innerText()).replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  await shot(page, 'project-payment-schedule');

  console.log('\n  …and what the priorities list now calls that money');
  await page.goto(`${BASE}/admin/priorities`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const band = page.getByText(/never invoiced/i).first();
  if (await band.count()) {
    await band.scrollIntoViewIfNeeded();
    console.log(`  BAND SAYS: ${(await band.innerText()).replace(/\s+/g, ' ')}`);
  }
  const havishamRow = page.getByText(/payable and hasn/i).first();
  if (await havishamRow.count()) {
    console.log(`  ROW SAYS: ${(await havishamRow.innerText()).replace(/\s+/g, ' ')}`);
  }
  await shot(page, 'priorities-unbilled-after-confirmation');

  /* ------------------------------------------------------------------ */
  console.log('\nUX/UI — a snooze the server refuses');
  // The snooze PATCH, and only the snooze PATCH, fails. Everything else on
  // the page keeps working, which is what makes the silence so easy to miss.
  await page.route('**/snooze', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  await page.getByRole('button', { name: 'a week' }).first().click();
  await readAlert(page, 'ALERT SAYS');
  await shot(page, 'priorities-snooze-failed');

  const rowStillThere = await page.getByText('Okafor Plumbing').first().count();
  console.log(`  row still on the list: ${rowStillThere > 0 ? 'YES' : 'NO'}`);

  console.log('\n  …and the same failure with the route’s own sentence');
  await page.unroute('**/snooze');
  await page.route('**/snooze', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Project not found' }),
    })
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '3 days' }).first().click();
  await readAlert(page, 'ALERT SAYS');
  await shot(page, 'priorities-snooze-route-message');

  /* ------------------------------------------------------------------ */
  console.log('\n  …and a snooze that works, which must stay silent');
  await page.unroute('**/snooze');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'a week' }).first().click();
  await page.getByRole('button', { name: /bring back/i }).first().waitFor({ timeout: 15_000 });
  const alerts = await speakingAlerts(page).allInnerTexts();
  console.log(`  alerts on screen: ${alerts.length}`);
  for (const a of alerts) console.log(`    STRAY: ${a.replace(/\s+/g, ' ').trim()}`);
  await shot(page, 'priorities-snooze-succeeded');

  /* ------------------------------------------------------------------ */
  console.log('\nOn a phone, 393×852');
  const phone = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await phone.context().addCookies(await page.context().cookies());
  await phone.route('**/snooze', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
  );
  await phone.goto(`${BASE}/admin/priorities`, { waitUntil: 'networkidle' });
  await phone.waitForTimeout(1500);
  const weekBtn = phone.getByRole('button', { name: 'a week' }).first();
  if (await weekBtn.count()) {
    await weekBtn.click();
    await readAlert(phone, 'ALERT SAYS (phone)');
  }
  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  console.log(`  horizontal overflow: ${overflow}px`);
  await shot(phone, 'priorities-snooze-failed-phone');

  await browser.close();
  console.log(`\nAll shots in ${OUT}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
