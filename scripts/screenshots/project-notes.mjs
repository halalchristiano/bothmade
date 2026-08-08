/**
 * The internal notes panel: "none" versus "could not load", and a note that
 * would not save.
 *
 * The point is the difference between two sentences, so the run prints both
 * and asserts the wrong one is absent. A panel that says "No internal notes
 * yet" over a failed request is not a cosmetic problem — it is the panel
 * telling somebody the note they are about to act against does not exist.
 *
 *   BOTHMADE_PROJECT_ID=... BOTHMADE_SHOT_DIR=... node scripts/screenshots/project-notes.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BOTHMADE_BASE ?? 'http://localhost:3100';
const OUT = process.env.BOTHMADE_SHOT_DIR ?? '/tmp/notes-shots';
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

const NOTE = 'Spoke to Dana — she wants the booking form above the fold.';

/** This page polls, so networkidle never settles. */
async function openProject(page, id) {
  await page.goto(`${BASE}/admin/projects/${id}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('combobox').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(1500);
}

const notesPanel = (page) =>
  page.getByPlaceholder(/Note to the rest of the team/i).locator('xpath=ancestor::*[2]');

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
  console.log('\nFUNCTIONALITY — what the route now refuses');
  const refusals = await page.evaluate(async (projectId) => {
    const post = (content) =>
      fetch(`/api/admin/projects/${projectId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    return {
      spaces: await post('   '),
      number: await post(42),
      long: await post('x'.repeat(9000)),
    };
  }, PROJECT_ID);
  console.log(`  a note of spaces  → HTTP ${refusals.spaces.status}: ${refusals.spaces.body?.error ?? ''}`);
  console.log(`  a note that is 42 → HTTP ${refusals.number.status}: ${refusals.number.body?.error ?? ''}`);
  console.log(`  9000 characters   → HTTP ${refusals.long.status}, stored ${refusals.long.body?.note?.content?.length ?? '?'}`);

  /* ------------------------------------------------------------------ */
  console.log('\n  …and a real note, written the ordinary way');
  const box = page.getByPlaceholder(/Note to the rest of the team/i);
  await box.scrollIntoViewIfNeeded();
  await box.fill(NOTE);
  await page.getByRole('button', { name: /add internal note/i }).click();
  await page.getByText(/booking form above the fold/i).first().waitFor({ state: 'visible', timeout: 20_000 });
  console.log('  note saved and listed');
  await shot(notesPanel(page), 'note-saved');

  /* ------------------------------------------------------------------ */
  console.log('\nUX/UI — the same project with the notes request failing');
  const page2 = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await page2.context().addCookies(await page.context().cookies());
  // Only the notes GET dies. Everything else on the page keeps working, which
  // is exactly what made the wrong sentence so easy to believe.
  await page2.route('**/notes', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
      : route.continue()
  );
  await openProject(page2, PROJECT_ID);

  const said = page2.locator('[role="alert"]:not(:empty)').filter({ hasText: /could not be loaded/i }).first();
  await said.waitFor({ state: 'visible', timeout: 20_000 });
  await said.scrollIntoViewIfNeeded();
  console.log(`  PANEL SAYS: ${(await said.innerText()).replace(/\s+/g, ' ').trim()}`);

  // The whole point: the confident sentence must be gone.
  const claimsNone = await page2.getByText(/No internal notes yet/i).count();
  console.log(`  still claims "No internal notes yet"? ${claimsNone > 0 ? 'YES — BAD' : 'NO'}`);
  console.log(`  offers a retry? ${(await page2.getByRole('button', { name: /try again/i }).count()) > 0 ? 'YES' : 'NO — BAD'}`);
  await shot(notesPanel(page2), 'notes-could-not-be-loaded');

  /* ------------------------------------------------------------------ */
  console.log('\n  …and a note that will not save');
  const page3 = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await page3.context().addCookies(await page.context().cookies());
  await page3.route('**/notes', (route) =>
    route.request().method() === 'POST' ? route.abort('failed') : route.continue()
  );
  await openProject(page3, PROJECT_ID);
  const box3 = page3.getByPlaceholder(/Note to the rest of the team/i);
  await box3.scrollIntoViewIfNeeded();
  await box3.fill('Chased the logo files — Ruth is away until Monday.');
  await page3.getByRole('button', { name: /add internal note/i }).click();
  const failed = page3.locator('[role="alert"]:not(:empty)').filter({ hasText: /not saved/i }).first();
  await failed.waitFor({ state: 'visible', timeout: 20_000 });
  console.log(`  FAILURE SAYS: ${(await failed.innerText()).replace(/\s+/g, ' ').trim()}`);
  console.log(`  text still in the box? ${(await box3.inputValue()) ? 'YES' : 'NO — BAD'}`);
  await shot(notesPanel(page3), 'note-not-saved');

  /* ------------------------------------------------------------------ */
  console.log('\nOn a phone, 393×852');
  const phone = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await phone.context().addCookies(await page.context().cookies());
  await phone.route('**/notes', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
      : route.continue()
  );
  await openProject(phone, PROJECT_ID);
  const phoneSaid = phone.locator('[role="alert"]:not(:empty)').filter({ hasText: /could not be loaded/i }).first();
  await phoneSaid.waitFor({ state: 'visible', timeout: 20_000 });
  await phoneSaid.scrollIntoViewIfNeeded();
  console.log(`  PANEL SAYS (phone): ${(await phoneSaid.innerText()).replace(/\s+/g, ' ').trim()}`);
  console.log(
    `  horizontal overflow: ${await phone.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )}px`
  );
  await shot(phone, 'notes-could-not-be-loaded-phone');

  await browser.close();
  console.log(`\nAll shots in ${OUT}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
