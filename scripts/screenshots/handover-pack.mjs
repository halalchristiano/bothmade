/**
 * The handover pack: the concurrency fix, and the two failures the page used
 * to swallow.
 *
 * The interesting part cannot be photographed at all. "Two people added a
 * file and both survived" is a count, so this fires ten adds at once against
 * the real server and counts what came back — which under the old
 * read-modify-write would be some number smaller than ten, with no error
 * anywhere to say which ones went missing.
 *
 *   BOTHMADE_PROJECT_ID=... BOTHMADE_SHOT_DIR=... node scripts/screenshots/handover-pack.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BOTHMADE_BASE ?? 'http://localhost:3100';
const OUT = process.env.BOTHMADE_SHOT_DIR ?? '/tmp/handover-pack-shots';
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

const speaking = (page) => page.locator('[role="alert"]:not(:empty)');

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
  console.log('\nFUNCTIONALITY — ten people adding a file at the same moment');
  // Fired from inside the page so they share the session cookie, and all at
  // once so they genuinely overlap on the server.
  const result = await page.evaluate(async (projectId) => {
    const add = (n) =>
      fetch(`/api/admin/projects/${projectId}/deliverables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Pack file ${n}.pdf`,
          url: `https://files.test/pack-${n}.pdf`,
          size: '1.1 MB',
        }),
      }).then((r) => r.status);

    const statuses = await Promise.all(Array.from({ length: 10 }, (_, i) => add(i + 1)));
    const list = await fetch(`/api/projects/${projectId}`).then((r) => r.json());
    return { statuses, names: (list.project?.deliverables ?? []).map((d) => d.name) };
  }, PROJECT_ID);

  const added = result.names.filter((n) => /^Pack file /.test(n));
  console.log(`  ten requests, statuses: ${JSON.stringify([...new Set(result.statuses)])}`);
  console.log(`  files that survived: ${added.length} of 10`);
  console.log(`  none lost? ${added.length === 10 ? 'YES' : `NO — ${10 - added.length} vanished`}`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Pack file 1.pdf').first().waitFor({ state: 'visible', timeout: 30_000 });
  const list = page.getByText('Pack file 1.pdf').locator('xpath=ancestor::*[3]');
  await list.scrollIntoViewIfNeeded();
  await shot(list, 'ten-concurrent-adds-all-survived');

  /* ------------------------------------------------------------------ */
  console.log('\n  …and a file name pasted into the link box');
  const refused = await page.evaluate(async (projectId) => {
    const res = await fetch(`/api/admin/projects/${projectId}/deliverables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Source.zip', url: 'Source.zip' }),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }, PROJECT_ID);
  console.log(`  HTTP ${refused.status}: ${refused.body?.error ?? '(no error)'}`);

  /* ------------------------------------------------------------------ */
  console.log('\nUX/UI — removing a file when the request is refused');
  await page.route('**/deliverables**', (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'That file is not on this project — it may already have been removed.',
          }),
        })
      : route.continue()
  );

  const removeBtn = page.getByRole('button', { name: /remove|delete/i }).first();
  await removeBtn.scrollIntoViewIfNeeded();
  await removeBtn.click();
  const alert = speaking(page).first();
  await alert.waitFor({ state: 'visible', timeout: 20_000 });
  await alert.scrollIntoViewIfNeeded();
  console.log(`  REFUSAL SAYS: ${(await alert.innerText()).replace(/\s+/g, ' ').trim()}`);
  console.log(`  file still listed? ${(await page.getByText('Pack file 1.pdf').count()) > 0 ? 'YES' : 'NO — BAD'}`);
  await shot(alert.locator('xpath=ancestor::*[2]'), 'delete-refused-and-said-so');

  console.log('\n  …and when the request never lands');
  await page.unroute('**/deliverables**');
  await page.route('**/deliverables**', (route) =>
    route.request().method() === 'DELETE' ? route.abort('failed') : route.continue()
  );
  await page.getByRole('button', { name: /remove|delete/i }).first().click();
  const alert2 = speaking(page).first();
  await alert2.waitFor({ state: 'visible', timeout: 20_000 });
  console.log(`  FAILURE SAYS: ${(await alert2.innerText()).replace(/\s+/g, ' ').trim()}`);
  await shot(alert2.locator('xpath=ancestor::*[2]'), 'delete-network-gone');

  /* ------------------------------------------------------------------ */
  console.log('\nOn a phone, 393×852');
  const phone = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await phone.context().addCookies(await page.context().cookies());
  await phone.route('**/deliverables**', (route) =>
    route.request().method() === 'DELETE' ? route.abort('failed') : route.continue()
  );
  await openProject(phone, PROJECT_ID);
  const phoneRemove = phone.getByRole('button', { name: /remove|delete/i }).first();
  if (await phoneRemove.count()) {
    await phoneRemove.scrollIntoViewIfNeeded();
    await phoneRemove.click();
    const said = speaking(phone).first();
    await said.waitFor({ state: 'visible', timeout: 20_000 });
    console.log(`  FAILURE SAYS (phone): ${(await said.innerText()).replace(/\s+/g, ' ').trim()}`);
  }
  console.log(
    `  horizontal overflow: ${await phone.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )}px`
  );
  await shot(phone, 'delete-failed-phone');

  await browser.close();
  console.log(`\nAll shots in ${OUT}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
