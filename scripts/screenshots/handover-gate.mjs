/**
 * Photographs the Section 7 handover gate and the refusals that now appear
 * beside the control that caused them.
 *
 * Prints the text it is photographing before each shot, and — for the whole
 * point of the UX fix — measures how far the message is from the button. A
 * screenshot cannot show "this used to be 900px up the page"; a number can.
 *
 *   BOTHMADE_SHOT_DIR=... node scripts/screenshots/handover-gate.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BOTHMADE_BASE ?? 'http://localhost:3100';
const OUT = process.env.BOTHMADE_SHOT_DIR ?? '/tmp/handover-shots';
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

/* Next injects an always-empty <next-route-announcer role="alert">. */
const speaking = (page) => page.locator('[role="alert"]:not(:empty)');

async function readAlert(page, label) {
  const alert = speaking(page).first();
  await alert.waitFor({ state: 'visible', timeout: 15_000 });
  await alert.scrollIntoViewIfNeeded();
  console.log(`  ${label}: ${(await alert.innerText()).replace(/\s+/g, ' ').trim()}`);
  return alert;
}

/** How far the message sits from the control that produced it. */
async function gapFrom(button, alert) {
  const b = await button.boundingBox();
  const a = await alert.boundingBox();
  if (!b || !a) return null;
  return Math.round(a.y - (b.y + b.height));
}

const main = async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BOTHMADE_CHROMIUM ?? undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });

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

  // Straight to the launch page for the project whose Payment 3 is unpaid.
  await page.goto(`${BASE}/admin/deployment`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByText('Havisham Joinery').first().click();
  await page.waitForTimeout(2500);
  console.log(`  on ${page.url()}`);

  /* ------------------------------------------------------------------ */
  console.log('\nFUNCTIONALITY — Section 7 on the handover');
  const handover = page.getByRole('button', { name: /mark it handed over/i });
  await handover.scrollIntoViewIfNeeded();
  await handover.click();
  const alert = await readAlert(page, 'REFUSAL SAYS');

  const gap = await gapFrom(handover, alert);
  console.log(`  message sits ${gap}px below the button it belongs to`);

  // The card, so the shot is the button and its reason together rather than a
  // full page in which the two happen to both appear.
  const card = page.locator('div.rounded-xl', { hasText: 'Handover' }).last();
  await shot(card, 'handover-refused-section-7');
  await shot(page, 'handover-refused-full-page');

  // It must not have been recorded — the confirmed state has an "undo".
  const undo = await card.getByRole('button', { name: /undo/i }).count();
  console.log(`  recorded anyway? ${undo > 0 ? 'YES — BAD' : 'NO'}`);

  /* ------------------------------------------------------------------ */
  console.log('\nUX/UI — a launch check that will not save');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  // Only the PATCH fails; the page itself keeps working, which is what made
  // the silence so easy to miss.
  await page.route('**/deployment', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
      : route.continue()
  );

  const check = page.getByRole('button', { name: /Every form tested end to end/i }).first();
  await check.scrollIntoViewIfNeeded();
  await check.click();
  const rowAlert = await readAlert(page, 'ROW SAYS');
  console.log(`  message sits ${await gapFrom(check, rowAlert)}px below the row it belongs to`);
  console.log(`  messages on screen: ${await speaking(page).count()} (must be 1 — only the row pressed)`);
  await shot(check.locator('xpath=..'), 'launch-check-refused-at-the-row');

  /* ------------------------------------------------------------------ */
  console.log('\n  …and a save that works, which must stay silent');
  await page.unroute('**/deployment');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const check2 = page.getByRole('button', { name: /Every form tested end to end/i }).first();
  await check2.scrollIntoViewIfNeeded();
  await check2.click();
  await page.waitForTimeout(2000);
  console.log(`  messages on screen: ${await speaking(page).count()} (must be 0)`);
  await shot(check2.locator('xpath=..'), 'launch-check-saved-silently');

  /* ------------------------------------------------------------------ */
  console.log('\nOn a phone, 393×852');
  const phone = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await phone.context().addCookies(await page.context().cookies());
  await phone.goto(page.url(), { waitUntil: 'networkidle' });
  await phone.waitForTimeout(2000);
  const phoneHandover = phone.getByRole('button', { name: /mark it handed over/i });
  await phoneHandover.scrollIntoViewIfNeeded();
  await phoneHandover.click();
  const phoneAlert = await readAlert(phone, 'REFUSAL SAYS (phone)');
  console.log(`  message sits ${await gapFrom(phoneHandover, phoneAlert)}px below the button`);
  console.log(
    `  horizontal overflow: ${await phone.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )}px`
  );
  await shot(phone, 'handover-refused-phone');

  await browser.close();
  console.log(`\nAll shots in ${OUT}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
