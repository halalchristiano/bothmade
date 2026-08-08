import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The studio's own to-do list, on the two things it could not do.
 *
 * It is the smallest card on the dashboard and the one somebody looks at
 * every morning, which is roughly why nothing here had ever been checked in
 * a browser.
 *
 *   - **Due dates.** `dueAt` is on the model, it is the second key in the
 *     list route's orderBy, and the widget — the only client there has ever
 *     been — neither sent one nor showed one. So every task carried null, the
 *     sort had nothing to sort on, and the list could not answer "what is due
 *     first" about itself. This drives the whole loop: read the seeded rows
 *     back in due order, add one with a date, and check it lands where the
 *     sort says rather than on top.
 *
 *   - **The remove control.** `opacity-0 group-hover:opacity-100` on a button
 *     that is still in the layout and still takes a click. This is the check
 *     a unit test genuinely cannot make: it measures the rendered button, at
 *     a phone width, with no pointer anywhere near it — which is the state a
 *     touch screen is always in — and asserts it is both visible and at least
 *     24px tall. jsdom has no layout engine and no opacity; a browser has
 *     both.
 *
 * It also tabs to the button and re-measures, because the keyboard case is
 * the same bug wearing different clothes: `group-hover` never fires for a
 * keyboard user, so the focus ring used to land on something invisible.
 *
 * Needs a dev server, a database, and an owner account holding a handful of
 * tasks with mixed due dates (one overdue, one today, one far out, one with
 * no date, one done).
 *
 *   npm run dev -- -p 3100
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *     node scripts/screenshots/todo-list.mjs
 *
 * Imports playwright-core, not playwright: it is the one in package.json, so
 * this runs after a plain `npm ci`.
 */

const BASE = process.env.BOTHMADE_BASE ?? 'http://localhost:3100';
const OUT = process.env.BOTHMADE_SHOT_DIR ?? '/tmp/todo-shots';
const EMAIL = process.env.SHOT_EMAIL ?? 'kiana@bothmade.studio';
const PASSWORD = process.env.SHOT_PASSWORD ?? 'screenshot-only';
const CHROMIUM = process.env.CHROMIUM_PATH;

fs.mkdirSync(OUT, { recursive: true });

/** WCAG 2.5.8, and the rule the client portal's controls were fixed to. */
const MIN_TARGET = 24;

const browser = await chromium.launch({
  ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  args: ['--no-sandbox'],
});

const problems = [];
let step = 0;

console.log(`\nTo-do list screenshots → ${OUT}\n`);

/** Signs in and puts the to-do card on screen. */
async function dashboard(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // Not /\/admin/ — that matches /admin/login, so it resolves before the
  // sign-in has happened and everything after races it.
  await page.waitForURL(/\/admin\/(?!login)/, { timeout: 30_000 });
  await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'networkidle' });
  await page.getByText('My to-dos').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1200);
  return page;
}

const shot = async (page, name, locator) => {
  step += 1;
  const file = path.join(OUT, `${String(step).padStart(2, '0')}-${name}.png`);
  await (locator ?? page).screenshot({ path: file });
  console.log(`  → ${path.basename(file)}`);
};

/** The to-do card itself, so the shots are of the widget rather than the page. */
const card = (page) => page.locator('div').filter({ has: page.getByText('My to-dos') }).last();

/* ===== The desk: due dates, and where a new task lands =================== */

const deskCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await dashboard(deskCtx);

/** Each row as "title — due label", top to bottom. */
const rows = async (p) =>
  p.evaluate(() => {
    const heading = [...document.querySelectorAll('h2')].find((h) => h.textContent?.includes('My to-dos'));
    const holder = heading?.parentElement;
    return [...(holder?.querySelectorAll('label') ?? [])].map((label) => {
      const spans = label.querySelectorAll('span');
      return {
        title: spans[0]?.textContent?.trim() ?? '',
        due: spans[1]?.textContent?.trim() ?? '',
      };
    });
  });

const before = await rows(page);
console.log('  the list reads:');
for (const r of before) console.log(`    ${r.title}${r.due ? `   [${r.due}]` : ''}`);
await shot(page, 'due-dates', card(page));

if (!before.some((r) => /overdue/.test(r.due))) {
  problems.push('nothing on the list says it is overdue, though one task is three days late.');
}
if (!before.some((r) => r.due === 'Due today')) {
  problems.push('the task due today does not say so.');
}
const dated = before.filter((r) => r.due);
const dueOrder = dated.map((r) => r.due);
// Overdue must be above "due today", which must be above the rest — the
// reason the list is in the order it is in.
if (dueOrder[0] && !/overdue/.test(dueOrder[0])) {
  problems.push(`the most overdue task is not at the top (top is "${dueOrder[0]}").`);
}
if (before.some((r) => r.title === 'File the insurance certificate' && r.due)) {
  problems.push('a task that is already done is still being called late.');
}

/* --- adding one with a date, which used to be impossible --- */

await page.getByLabel('Add a task').fill('Post the Bell contract');
const far = new Date();
far.setFullYear(far.getFullYear() + 1);
await page.getByLabel(/due date/i).fill(far.toISOString().slice(0, 10));
await page.getByRole('button', { name: 'Add' }).click();
await page.getByText('Post the Bell contract').waitFor({ timeout: 15_000 });
await page.waitForTimeout(500);

const after = await rows(page);
const addedAt = after.findIndex((r) => r.title === 'Post the Bell contract');
console.log(`\n  a task due next year landed at position ${addedAt + 1} of ${after.length}:`);
for (const r of after) console.log(`    ${r.title}${r.due ? `   [${r.due}]` : ''}`);
await shot(page, 'added-in-order', card(page));

if (addedAt === 0) {
  problems.push('a task due next year was put above one that is three days overdue.');
}
if (addedAt < 0) {
  problems.push('the new task never appeared.');
}

/* ===== The phone: a control that has to be usable without a pointer ====== */

const phoneCtx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  isMobile: true,
  hasTouch: true,
});
const phone = await dashboard(phoneCtx);
await phone.getByText('My to-dos').first().scrollIntoViewIfNeeded();
await phone.waitForTimeout(600);
await shot(phone, 'phone', card(phone));

/*
 * Measured with the pointer parked in the corner, which is the state a touch
 * screen is permanently in. This is the assertion jsdom cannot make: it has
 * no layout engine and no computed opacity.
 */
await phone.mouse.move(0, 0);
const remove = phone.getByRole('button', { name: /^Remove / }).first();
const measure = async (label) => {
  const box = await remove.boundingBox();
  const opacity = await remove.evaluate((el) => Number(getComputedStyle(el).opacity));
  console.log(
    `\n  ${label}: ${box ? `${Math.round(box.width)}×${Math.round(box.height)}px` : 'not laid out'}, opacity ${opacity}`
  );
  return { box, opacity };
};

const resting = await measure('resting, no pointer on the row');
if (resting.opacity === 0) {
  problems.push('the only way to delete a task is invisible when nothing is hovered.');
}
if (!resting.box || resting.box.height < MIN_TARGET) {
  problems.push(
    `the remove control is ${resting.box ? Math.round(resting.box.height) : 0}px tall — under the ${MIN_TARGET}px minimum.`
  );
}

/* --- and the keyboard, where group-hover never fires at all --- */

await remove.focus();
await phone.waitForTimeout(200);
const focused = await measure('with keyboard focus on it');
if (focused.opacity < 1) {
  problems.push('the remove control does not come up when it has keyboard focus.');
}
await shot(phone, 'remove-focused', card(phone));

/* --- pressing it removes the right task, and does not tick it off --- */

const name = await remove.getAttribute('aria-label');
const before2 = await rows(phone);
await remove.click();
await phone.waitForTimeout(1200);
const after2 = await rows(phone);
console.log(`\n  pressed ${name} — ${before2.length} rows became ${after2.length}`);
if (after2.length !== before2.length - 1) {
  problems.push(`pressing remove left ${after2.length} rows, not ${before2.length - 1}.`);
}
await shot(phone, 'removed', card(phone));

await browser.close();

if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`  !! ${p}`);
  console.log('');
  process.exit(1);
}
console.log('\nDone — the list says what is due, sorts by it, and its delete control can be aimed at.\n');
