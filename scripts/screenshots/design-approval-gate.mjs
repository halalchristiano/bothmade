/**
 * Photographs what happens when you record that a client approved the design.
 *
 * Section 7 puts Payment 2 on that exact moment. The stage dropdown — a guess
 * at the same thing — has prompted for it since forever; the act that records
 * the approval itself said nothing. So what is worth capturing is the prompt
 * appearing, and the sentence on it, which must not be the one written for a
 * dropdown.
 *
 * Then the other half: the panel with the network pulled out. Presenting is
 * what starts the Section 4 clock, and it used to fail in complete silence.
 *
 *   BOTHMADE_PROJECT_ID=... BOTHMADE_SHOT_DIR=... node scripts/screenshots/design-approval-gate.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BOTHMADE_BASE ?? 'http://localhost:3100';
const OUT = process.env.BOTHMADE_SHOT_DIR ?? '/tmp/design-shots';
const PROJECT_ID = process.env.BOTHMADE_PROJECT_ID;
const EMAIL = 'kiana@bothmade.studio';
const PASSWORD = 'screenshot-only';

if (!PROJECT_ID) throw new Error('set BOTHMADE_PROJECT_ID from the seed output');
fs.mkdirSync(OUT, { recursive: true });

let step = 0;
async function shot(target, name) {
  step += 1;
  const file = path.join(OUT, `${String(step).padStart(2, '0')}-${name}.png`);
  await target.screenshot({ path: file });
  console.log(`  → ${path.basename(file)}`);
}

/** This page polls, so networkidle never settles. */
async function openProject(page, id) {
  await page.goto(`${BASE}/admin/projects/${id}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('combobox').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(1500);
}

const main = async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BOTHMADE_CHROMIUM ?? undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });

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

  await openProject(page, PROJECT_ID);

  /* ------------------------------------------------------------------ */
  console.log('\nFUNCTIONALITY — recording the approval reports the payment it makes due');
  const approve = page.getByRole('button', { name: /approved/i }).first();
  await approve.scrollIntoViewIfNeeded();
  console.log(`  panel offers: "${(await approve.innerText()).trim()}"`);
  await shot(approve.locator('xpath=ancestor::*[2]'), 'review-clock-running');

  await approve.click();

  const prompt = page.getByText(/payable now/i).first();
  await prompt.waitFor({ state: 'visible', timeout: 20_000 });
  const card = prompt.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  console.log(`  PROMPT SAYS: ${(await card.innerText()).replace(/\s+/g, ' ').slice(0, 220)}`);

  // The sentence must be the approval's, not the dropdown's.
  const text = await card.innerText();
  console.log(`  says "approved the design"? ${/approved the design/i.test(text) ? 'YES' : 'NO — BAD'}`);
  console.log(`  says "you moved"?           ${/you moved/i.test(text) ? 'YES — BAD' : 'NO'}`);
  await shot(card, 'payment-2-prompted-on-approval');

  /* ------------------------------------------------------------------ */
  console.log('\nUX/UI — the panel with the network pulled out');
  // Only the design-review POST dies; everything else on the page keeps
  // working, which is what made the silence so easy to miss.
  const page2 = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await page2.context().addCookies(await page.context().cookies());
  await page2.route('**/design-review', (route) =>
    route.request().method() === 'POST' ? route.abort('failed') : route.continue()
  );
  await openProject(page2, process.env.BOTHMADE_SECOND_PROJECT_ID ?? PROJECT_ID);

  const present = page2.getByRole('button', { name: /send .* for review/i }).first();
  if (await present.count()) {
    await present.scrollIntoViewIfNeeded();
    await present.click();

    /*
     * Presenting really does email the client, so SendGuard holds it behind a
     * dialog first. The abort above only bites once that is confirmed — which
     * is the point: the failure being tested is the request dying after
     * somebody deliberately said send it.
     */
    const dialog = page2.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 20_000 });
    const names = (await dialog.getByRole('button').allInnerTexts()).map((n) => n.trim()).filter(Boolean);
    console.log(`  guard asks first, buttons: ${JSON.stringify(names)}`);
    await dialog.getByRole('button', { name: /^(send it|send|confirm)$/i }).first().click();

    const said = page2.getByText(/could not reach the server/i).first();
    await said.waitFor({ state: 'visible', timeout: 20_000 });
    console.log(`  FAILURE SAYS: ${(await said.innerText()).replace(/\s+/g, ' ').trim()}`);
    console.log(`  button usable again? ${(await present.isEnabled()) ? 'YES' : 'NO — BAD'}`);
    await shot(present.locator('xpath=ancestor::*[2]'), 'present-failed-and-said-so');
  } else {
    console.log('  (no Present control on this project — already presented)');
  }

  /* ------------------------------------------------------------------ */
  console.log('\nOn a phone, 393×852');
  const phone = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await phone.context().addCookies(await page.context().cookies());
  await phone.route('**/design-review', (route) =>
    route.request().method() === 'PATCH' ? route.abort('failed') : route.continue()
  );
  await openProject(phone, PROJECT_ID);
  const phoneApprove = phone.getByRole('button', { name: /approved/i }).first();
  if (await phoneApprove.count()) {
    await phoneApprove.scrollIntoViewIfNeeded();
    await phoneApprove.click();
    const said = phone.getByText(/could not reach the server/i).first();
    await said.waitFor({ state: 'visible', timeout: 20_000 });
    console.log(`  FAILURE SAYS (phone): ${(await said.innerText()).replace(/\s+/g, ' ').trim()}`);
  }
  console.log(
    `  horizontal overflow: ${await phone.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )}px`
  );
  await shot(phone, 'approval-failed-phone');

  await browser.close();
  console.log(`\nAll shots in ${OUT}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
