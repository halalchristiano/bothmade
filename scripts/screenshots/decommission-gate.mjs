/**
 * Photographs what happens when you press Decommission on a client who still
 * has work in flight.
 *
 * The button reads like tidying up and sits next to "Edit". What it does is
 * lock the client out of their dashboard mid-session and make their unpaid
 * invoices unsendable. So the thing to photograph is not that a message
 * appears — it is that the press did NOT go through, and that there is a
 * second answer.
 *
 * Every claim is printed before its shot, including the PATCH bodies actually
 * sent, because "it refused" and "it refused and then did it anyway" look
 * identical in a picture.
 *
 *   BOTHMADE_SHOT_DIR=... node scripts/screenshots/decommission-gate.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BOTHMADE_BASE ?? 'http://localhost:3100';
const OUT = process.env.BOTHMADE_SHOT_DIR ?? '/tmp/decommission-shots';
const EMAIL = 'kiana@bothmade.studio';
const PASSWORD = 'screenshot-only';

fs.mkdirSync(OUT, { recursive: true });

let step = 0;
async function shot(target, name) {
  step += 1;
  const file = path.join(OUT, `${String(step).padStart(2, '0')}-${name}.png`);
  await target.screenshot({ path: file });
  console.log(`  → ${path.basename(file)}`);
}

const speaking = (page) => page.locator('[role="alert"]:not(:empty)');

async function readAlert(page, label) {
  const alert = speaking(page).first();
  await alert.waitFor({ state: 'visible', timeout: 15_000 });
  await alert.scrollIntoViewIfNeeded();
  console.log(`  ${label}: ${(await alert.innerText()).replace(/\s+/g, ' ').trim()}`);
  return alert;
}

const main = async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BOTHMADE_CHROMIUM ?? undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

  // Every PATCH body the page sends, so "refused" can be told from
  // "refused and did it anyway".
  const patches = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && r.url().includes('/api/admin/clients/')) {
      patches.push(r.postData());
    }
  });

  console.log('\nLogging in');
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  const email = page.getByLabel(/email/i);
  const password = page.getByLabel(/password/i);
  for (let i = 0; i < 10; i += 1) {
    await email.fill(EMAIL);
    await password.fill(PASSWORD);
    if ((await email.inputValue()) === EMAIL && (await password.inputValue()) === PASSWORD) break;
    await page.waitForTimeout(500);
  }
  await page.getByRole('button', { name: /^login$/i }).click();
  await page.waitForURL(/\/admin\/(?!login)/, { timeout: 30_000 });
  console.log('  signed in');

  console.log('\nFUNCTIONALITY — a client with a live project and an unpaid invoice');
  await page.goto(`${BASE}/admin/clients`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, 'clients-list');
  /*
   * Straight to the record rather than clicking the row. The list renders a
   * desktop and a mobile variant and hides one of them, so "the first thing
   * matching the name" is reliably the invisible one.
   */
  const clientId = process.env.BOTHMADE_CLIENT_ID;
  if (!clientId) throw new Error('set BOTHMADE_CLIENT_ID from the seed output');
  await page.goto(`${BASE}/admin/clients/${clientId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  console.log(`  on ${page.url()}`);

  const button = page.getByRole('button', { name: /^decommission$/i });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await readAlert(page, 'REFUSAL SAYS');

  console.log(`  PATCH bodies sent so far: ${JSON.stringify(patches)}`);
  const anyway = page.getByRole('button', { name: /decommission anyway/i });
  const notNow = page.getByRole('button', { name: /not now/i });
  console.log(`  second answer offered? anyway=${await anyway.count()} notNow=${await notNow.count()}`);
  // Still active: the Decommission button is only rendered while they are.
  console.log(`  still active? ${(await button.count()) > 0 ? 'YES' : 'NO — BAD'}`);

  const card = page.locator('[role="alert"]').filter({ hasText: 'Decommissioning' }).first();
  await shot(card, 'decommission-refused-live-work');
  await shot(page, 'decommission-refused-full-page');

  console.log('\nUX/UI — "Not now" is a first-class answer');
  await notNow.click();
  await page.waitForTimeout(600);
  console.log(`  messages on screen: ${await speaking(page).count()} (must be 0)`);
  console.log(`  PATCH bodies after Not now: ${JSON.stringify(patches)} (must still be 1)`);
  console.log(`  still active? ${(await button.count()) > 0 ? 'YES' : 'NO — BAD'}`);
  await shot(page, 'decommission-not-now');

  console.log('\n  …and the second press, which does go through');
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await readAlert(page, 'REFUSAL SAYS');
  await page.getByRole('button', { name: /decommission anyway/i }).click();
  await page.waitForTimeout(2500);
  console.log(`  PATCH bodies sent: ${JSON.stringify(patches)}`);
  const decommissioned = await page.getByText(/Decommissioned/i).first().count();
  console.log(`  now decommissioned? ${decommissioned > 0 ? 'YES' : 'NO'}`);
  await shot(page, 'decommission-went-through');

  console.log('\nOn a phone, 393×852');
  const phone = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await phone.context().addCookies(await page.context().cookies());
  // Reinstate first, so the phone sees the same refusal rather than the
  // already-decommissioned state.
  await phone.goto(page.url(), { waitUntil: 'networkidle' });
  await phone.waitForTimeout(2000);
  const reactivate = phone.getByRole('button', { name: /reactivate/i });
  if (await reactivate.count()) {
    await reactivate.click();
    await phone.waitForTimeout(2500);
  }
  const phoneButton = phone.getByRole('button', { name: /^decommission$/i });
  await phoneButton.scrollIntoViewIfNeeded();
  await phoneButton.click();
  await readAlert(phone, 'REFUSAL SAYS (phone)');
  console.log(
    `  horizontal overflow: ${await phone.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )}px`
  );
  await shot(phone, 'decommission-refused-phone');

  await browser.close();
  console.log(`\nAll shots in ${OUT}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
