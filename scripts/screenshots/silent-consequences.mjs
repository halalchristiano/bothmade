import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Two admin actions that used to happen without saying so, photographed
 * doing the opposite.
 *
 * They are not related by feature — one is a paste box on the sales screen,
 * the other is the Gmail panel in settings — but they are the same defect
 * twice, and it is the defect a still image is worst at showing: an action
 * whose consequence is invisible on the screen that caused it.
 *
 *   - **Pasting more companies than one paste holds.** The route caps a
 *     paste at 200 and used to apply that with a bare `.slice(0, 200)`. The
 *     modal printed "Added 200 companies" in green and closed. Fifty
 *     companies were not added, not refused, and not recoverable: the list
 *     had been pasted, not saved, and the same click cleared the box that
 *     held it. This drives the whole loop — 250 in, 200 added, 50 handed
 *     back, second press, 250 leads on the board — because every step of it
 *     was passing in isolation while the modal unmounted the textarea it
 *     had just refilled. That was found here, by a browser, after the unit
 *     tests were green.
 *
 *   - **Disconnecting the account every client email goes out as.** One
 *     unlabelled text link, one click, no confirmation, no undo. And the
 *     handler dropped the response, so a failed disconnect redrew the panel
 *     as connected — identical to a successful one, and to the button doing
 *     nothing.
 *
 * It fails the run rather than only taking pictures. What it asserts is
 * outcomes, not renders: that the FIRST press of Disconnect sends no DELETE,
 * that a forced 500 leaves the account connected, that the box holds
 * Company 201 through Company 250 and not merely "fifty lines", and that the
 * database ends up with all 250.
 *
 * Needs a dev server and a database with one owner account:
 *
 *   npx tsx scripts/screenshots/seed-delivery.ts     # or any owner + password
 *   npm run dev -- -p 3100
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *     SHOT_EMAIL=... SHOT_PASSWORD=... node scripts/screenshots/silent-consequences.mjs
 *
 * The Gmail half needs that account to have a connection on it —
 * `gmailAddress` plus `googleRefreshToken` — and skips itself, loudly, if
 * there is nothing connected to disconnect.
 *
 * Imports playwright-core, not playwright: it is the one in package.json, so
 * this runs after a plain `npm ci`.
 */

const BASE = process.env.BOTHMADE_BASE ?? 'http://localhost:3100';
const OUT = process.env.BOTHMADE_SHOT_DIR ?? '/tmp/silent-consequences-shots';
const EMAIL = process.env.SHOT_EMAIL ?? 'kiana@bothmade.studio';
const PASSWORD = process.env.SHOT_PASSWORD ?? 'screenshot-only';
const CHROMIUM = process.env.CHROMIUM_PATH;

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const problems = [];
let step = 0;
const shot = async (name) => {
  step += 1;
  const file = path.join(OUT, `${String(step).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  → ${path.basename(file)}`);
};
/** Print what is being photographed. A shot taken mid-"Saving…" proves nothing. */
const read = (label, text) =>
  console.log(`\n  ${label}\n${text.split('\n').filter(Boolean).map((l) => `    ${l}`).join('\n')}`);

console.log(`\nSilent-consequence screenshots → ${OUT}\n`);

await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30_000 });

/* ===== 1. Disconnecting the account every email goes out as ============== */

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle' });
const connected = page.locator('text=Connected as');
const hasConnection = await connected.count().catch(() => 0);

if (!hasConnection) {
  console.log(
    '\n  SKIPPED: no Gmail connection on this account, so there is nothing to disconnect.\n' +
      '  Seed one with gmailAddress + googleRefreshToken to cover this half.'
  );
} else {
  await page.locator('text=Email sending').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot('gmail-connected');

  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  const confirm = page.getByRole('group', { name: /confirm disconnecting/i });
  await confirm.waitFor({ timeout: 5000 });
  read('the first press asks, rather than acts:', await confirm.innerText());
  await shot('gmail-confirm');

  // The assertion that matters most, and the one a picture cannot make: the
  // press that opened this dialogue must not itself have severed anything.
  if (!(await page.locator('text=Connected as').count())) {
    problems.push('pressing Disconnect once already severed the connection.');
  }

  // Now the failure path, forced, because it is the one nobody can produce
  // on demand and the one that used to be invisible.
  await page.route('**/api/admin/settings/gmail', (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Internal server error"}' })
      : route.continue()
  );
  await page.getByRole('button', { name: /yes, disconnect/i }).click();
  const alert = page.getByRole('alert').filter({ hasText: /could not/i }).first();
  await alert.waitFor({ timeout: 8000 });
  read('and a disconnect that fails says which side of it you are on:', await alert.innerText());
  await shot('gmail-disconnect-failed');

  if (!(await page.locator('text=Connected as').count())) {
    problems.push('a FAILED disconnect redrew the panel as though it had worked.');
  }
  if (!/still connected/i.test(await alert.innerText())) {
    problems.push('the failure does not say the account is still connected.');
  }
  await page.unroute('**/api/admin/settings/gmail');

  await page.getByRole('button', { name: /keep it connected/i }).click();
  await page.waitForTimeout(300);
  if (await page.getByRole('group', { name: /confirm disconnecting/i }).count()) {
    problems.push('"Keep it connected" did not dismiss the confirmation.');
  }
  await shot('gmail-kept');
}

/* ===== 2. A paste bigger than one paste holds ============================ */

const PASTED = 250;
const CAP = 200;

await page.goto(`${BASE}/admin/sales`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /add compan|add lead|quick add/i }).first().click();
await page.getByRole('button', { name: 'Bulk Add' }).click();

const box = page.getByLabel('Companies to add, one per line');
await box.waitFor();
const lines = Array.from({ length: PASTED }, (_, i) => `Company ${i + 1}`);
await box.fill(lines.join('\n'));
await shot('paste-250');

const before = await leadCount(page);

await page.getByRole('button', { name: 'Add All' }).click();
const status = page.getByRole('status').first();
await status.waitFor({ timeout: 30_000 });
await page.waitForTimeout(400);
const said = await status.innerText();
read(`after pasting ${PASTED} companies:`, said);
await shot('paste-truncated');

if (!/still in the box/.test(said)) {
  problems.push('the message does not say the turned-away lines are still there.');
}

/*
 * The exact fifty, in order. "Fifty lines survived" is not the claim — a box
 * holding the WRONG fifty is worse than an empty one, because it looks like
 * the work is safe.
 */
const left = (await box.inputValue()).split('\n').filter(Boolean);
console.log(`    the box still holds ${left.length}: ${left[0]} … ${left.at(-1)}`);
if (left.length !== PASTED - CAP) {
  problems.push(`the box kept ${left.length} lines, not the ${PASTED - CAP} that were turned away.`);
}
if (left[0] !== `Company ${CAP + 1}` || left.at(-1) !== `Company ${PASTED}`) {
  problems.push(`the box kept the wrong lines (${left[0]} … ${left.at(-1)}).`);
}

await page.getByRole('button', { name: 'Add All' }).click();
await page.waitForFunction(
  (n) => document.querySelector('[role="status"]')?.textContent?.includes(`Added ${n} companies.`),
  PASTED - CAP,
  { timeout: 30_000 }
);
read('after pressing Add All again:', await status.innerText());
await shot('paste-finished');

if ((await box.inputValue()) !== '') {
  problems.push('the box was not emptied once everything had gone in.');
}

/*
 * And the database, which is the only witness that cannot be argued with.
 * Counted as a delta so this can be run twice against the same dev database
 * without the second run failing on the first run's rows.
 */
const after = await leadCount(page);
console.log(`\n  leads before: ${before}, after: ${after} (added ${after - before})`);
if (after - before !== PASTED) {
  problems.push(`${after - before} leads were created, not the ${PASTED} that were pasted.`);
}
await page.goto(`${BASE}/admin/sales`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await shot('board-after');

async function leadCount(p) {
  return p.evaluate(async () => {
    const res = await fetch('/api/admin/leads?limit=1');
    const json = await res.json();
    return json.total ?? json.leads?.length ?? 0;
  });
}

await browser.close();

if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`  !! ${p}`);
  console.log('');
  process.exit(1);
}
console.log('\nDone — nothing was dropped in silence, and nothing was disconnected in silence.\n');
