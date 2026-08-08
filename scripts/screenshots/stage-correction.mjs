/**
 * Photographs what the project page does when you pick a stage the project
 * has already passed.
 *
 * The interesting evidence is not a picture. It is the request body: a
 * correction and an update leave the page looking almost identical, and the
 * difference between them is whether a client got an email saying their build
 * had gone back to design. So this prints every status PATCH it sends, and
 * whether the client email actually went, read out of the dev server log.
 *
 *   BOTHMADE_PROJECT_ID=... BOTHMADE_SHOT_DIR=... node scripts/screenshots/stage-correction.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BOTHMADE_BASE ?? 'http://localhost:3100';
const OUT = process.env.BOTHMADE_SHOT_DIR ?? '/tmp/stage-shots';
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

const main = async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BOTHMADE_CHROMIUM ?? undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });

  const statusPatches = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && r.url().includes('/status')) statusPatches.push(r.postData());
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

  /*
   * domcontentloaded, not networkidle: this page polls, so the network never
   * goes idle and the wait simply times out after thirty seconds.
   */
  await page.goto(`${BASE}/admin/projects/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  const picker = page.getByRole('combobox').first();
  await picker.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(1500);
  const box = page.getByPlaceholder(/Describe this update for the client/i);
  await picker.scrollIntoViewIfNeeded();
  console.log(`  project is at: ${await picker.inputValue()}`);

  /* ------------------------------------------------------------------ */
  console.log('\nFORWARD — the feature, unchanged');
  await picker.selectOption('launch');
  await page.waitForTimeout(500);
  const forwardText = (await box.inputValue()).replace(/\s+/g, ' ').slice(0, 90);
  console.log(`  box fills in: "${forwardText}…"`);
  console.log(`  button says: "${await page.getByRole('button', { name: /send status update|correct the stage/i }).innerText()}"`);
  await shot(picker.locator('xpath=ancestor::*[2]'), 'forward-fills-in-the-stage-copy');

  /* ------------------------------------------------------------------ */
  console.log('\nBACKWARD — the bug');
  await picker.selectOption('design');
  await page.waitForTimeout(600);
  const backText = await box.inputValue();
  console.log(`  box fills in: ${backText === '' ? '(nothing — correct)' : `"${backText.slice(0, 90)}…" — BAD`}`);
  console.log(`  button says: "${await page.getByRole('button', { name: /send status update|correct the stage/i }).innerText()}"`);
  const note = page.getByText(/a correction/i).first();
  await note.waitFor({ state: 'visible', timeout: 10_000 });
  console.log(`  NOTE SAYS: ${(await note.innerText()).replace(/\s+/g, ' ').trim()}`);
  await shot(picker.locator('xpath=ancestor::*[2]'), 'backward-is-a-correction');

  console.log('\n  …and pressing it');
  page.on('console', (m) => { if (m.type() === 'error') console.log(`  PAGE ERROR: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => console.log(`  PAGE THREW: ${String(e).slice(0, 200)}`));
  const btn = page.getByRole('button', { name: /correct the stage/i });
  await btn.click();

  /*
   * Nothing leaves this app on one press. SendGuard patches window.fetch and
   * holds every request that could reach an inbox behind a dialog — so the
   * click opens that, and the PATCH only goes when it is confirmed.
   *
   * Worth photographing rather than skipping past: this dialog used to say
   * "Post the update, and email the client?" over a press that emails nobody.
   */
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  console.log(`  GUARD ASKS: ${(await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 150)}`);
  await shot(dialog, 'the-send-guard-on-a-correction');

  // Named exactly, not by a loose regex: "Cancel" and "Send it" both match
  // /send|confirm|yes/i badly enough to press the wrong one, and pressing the
  // wrong one is a run that silently proves nothing.
  const names = await dialog.getByRole('button').allInnerTexts();
  console.log(`  guard buttons: ${JSON.stringify(names.map((n) => n.trim()).filter(Boolean))}`);
  await dialog.getByRole('button', { name: /^(send it|send|post it|confirm)$/i }).first().click();
  await page.waitForTimeout(3500);
  console.log(`  status PATCH bodies: ${JSON.stringify(statusPatches)}`);
  const after = page.getByText(/was not emailed/i).first();
  if (await after.count()) {
    console.log(`  RESULT SAYS: ${(await after.innerText()).replace(/\s+/g, ' ').trim()}`);
  }
  console.log(`  project now at: ${await page.getByRole('combobox').first().inputValue()}`);
  await shot(page.getByRole('combobox').first().locator('xpath=ancestor::*[2]'), 'correction-told-nobody');

  /* ------------------------------------------------------------------ */
  console.log('\nBACKWARD WITH A MESSAGE — still a send, on purpose');
  await page.reload({ waitUntil: 'domcontentloaded' });
  const picker2 = page.getByRole('combobox').first();
  await picker2.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(1500);
  const box2 = page.getByPlaceholder(/Describe this update for the client/i);
  await picker2.scrollIntoViewIfNeeded();
  await picker2.selectOption('discovery');
  await page.waitForTimeout(500);
  await box2.fill('We are reopening discovery — the new brand guidelines change the homepage.');
  await page.waitForTimeout(400);
  console.log(`  button says: "${await page.getByRole('button', { name: /send status update|correct the stage/i }).innerText()}"`);
  const note2 = page.getByText(/they will be emailed it/i).first();
  if (await note2.count()) {
    console.log(`  NOTE SAYS: ${(await note2.innerText()).replace(/\s+/g, ' ').trim()}`);
  }
  await shot(picker2.locator('xpath=ancestor::*[2]'), 'backward-with-a-message-still-sends');

  /* ------------------------------------------------------------------ */
  console.log('\nOn a phone, 393×852');
  const phone = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await phone.context().addCookies(await page.context().cookies());
  await phone.goto(`${BASE}/admin/projects/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  const phonePicker = phone.getByRole('combobox').first();
  await phonePicker.waitFor({ state: 'visible', timeout: 30_000 });
  await phone.waitForTimeout(1500);
  await phonePicker.scrollIntoViewIfNeeded();
  await phonePicker.selectOption('design');
  await phone.waitForTimeout(600);
  const phoneNote = phone.getByText(/a correction/i).first();
  await phoneNote.waitFor({ state: 'visible', timeout: 10_000 });
  console.log(`  NOTE SAYS (phone): ${(await phoneNote.innerText()).replace(/\s+/g, ' ').trim()}`);
  console.log(
    `  horizontal overflow: ${await phone.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )}px`
  );
  await shot(phone, 'backward-is-a-correction-phone');

  await browser.close();
  console.log(`\nAll shots in ${OUT}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
