import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The onboarding form, from both ends: the studio writing it and the client
 * filling it in.
 *
 * It is the first thing a paying client is asked to do, and for a long time
 * nobody looked at it from their side. Three things this photographs, each of
 * which it also fails the run over:
 *
 *   - **The questions come back in the order somebody wrote them.** Both list
 *     routes sorted on `order`, and nothing ever set it — every question on
 *     every project carried a 0, so the sort had one distinct value and
 *     Postgres was free to return ties however it liked. The seed below
 *     deliberately writes four questions all at position 0, which is exactly
 *     what the old create route produced, and the tiebreak on createdAt is
 *     what has to hold them in sequence. Checked on BOTH screens, because a
 *     client answering in one order while the studio reads the answers back
 *     in another is its own confusion.
 *
 *   - **The bin asks before it destroys an answer.** OnboardingResponse
 *     cascades from the question, so removing an answered one takes the
 *     client's text with it — and the text is on the same card, two lines
 *     below the button. This asserts the first press deletes nothing, that
 *     the confirmation says the answer goes too, and that the answer is still
 *     legible while it asks (an inline confirmation rather than a modal
 *     covering the thing in question).
 *
 *   - **A delete that fails says so.** Forced with a 500, because it is the
 *     state nobody can produce on demand and the one that used to be
 *     invisible: the list redrew with the question still in it, which reads
 *     exactly like the button not working.
 *
 * Needs a dev server, a database, an owner account, and a project with four
 * questions written at position 0 with the third answered. Pass the project
 * with SHOT_PROJECT_ID.
 *
 *   npm run dev -- -p 3100
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *     SHOT_PROJECT_ID=... node scripts/screenshots/onboarding-form.mjs
 *
 * Imports playwright-core, not playwright: it is the one in package.json, so
 * this runs after a plain `npm ci`.
 */

const BASE = process.env.BOTHMADE_BASE ?? 'http://localhost:3100';
const OUT = process.env.BOTHMADE_SHOT_DIR ?? '/tmp/onboarding-shots';
const EMAIL = process.env.SHOT_EMAIL ?? 'kiana@bothmade.studio';
const PASSWORD = process.env.SHOT_PASSWORD ?? 'screenshot-only';
const CLIENT_EMAIL = process.env.SHOT_CLIENT_EMAIL ?? 'ruth@havisham.co.uk';
const PROJECT_ID = process.env.SHOT_PROJECT_ID;
const CHROMIUM = process.env.CHROMIUM_PATH;

if (!PROJECT_ID) {
  console.error('SHOT_PROJECT_ID is not set — point this at the seeded project.');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

/** The order they were written in, which is the order they must be asked in. */
const EXPECTED = [
  'What is the company called',
  'Who are your three main competitors',
  'What is your brand palette',
  'Which pages do you need at launch',
];
const ANSWER = 'Forest green and bone';

const browser = await chromium.launch({
  ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  args: ['--no-sandbox'],
});

const problems = [];
let step = 0;
const shot = async (page, name) => {
  step += 1;
  const file = path.join(OUT, `${String(step).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  → ${path.basename(file)}`);
};

/**
 * Which of the expected questions appear, in the order the DOM has them.
 * Matched on a distinctive fragment rather than the whole sentence, so
 * wrapping and punctuation cannot turn an ordering check into a string check.
 */
const orderOnScreen = (text) =>
  EXPECTED.map((q) => ({ q, at: text.indexOf(q) }))
    .filter((e) => e.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((e) => e.q);

const checkOrder = (where, text) => {
  const seen = orderOnScreen(text);
  console.log(`\n  ${where} asks, top to bottom:`);
  seen.forEach((q, i) => console.log(`    ${i + 1}. ${q}…`));
  if (seen.length !== EXPECTED.length) {
    problems.push(`${where}: found ${seen.length} of the ${EXPECTED.length} questions.`);
    return;
  }
  if (seen.join('|') !== EXPECTED.join('|')) {
    problems.push(`${where}: the questions are not in the order they were written.`);
  }
};

/* ===== The studio's side ================================================= */

const staff = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await staff.newPage();

await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30_000 });

await page.goto(`${BASE}/admin/projects/${PROJECT_ID}`, { waitUntil: 'networkidle' });
await page.getByText('Onboarding form').first().scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
await shot(page, 'builder');

/*
 * Read off the whole page rather than a container matched by its heading.
 * A `div` filter lands on whichever nesting level happens to match, which
 * was an empty one — and an ordering check over text it never found passes
 * or fails on nothing. The four questions appear once each on this page.
 */
checkOrder('the studio', await page.locator('body').innerText());

/* --- the bin, which can destroy the client's answer --- */

const bin = page.getByRole('button', { name: /Remove the question .*brand palette/ });
await bin.click();
const confirm = page.getByRole('group', { name: /confirm removing/i });
await confirm.waitFor({ timeout: 5000 });
await page.waitForTimeout(300);
console.log(`\n  the bin asks:\n    ${(await confirm.innerText()).split('\n').filter(Boolean).join('\n    ')}`);
await shot(page, 'bin-asks');

// The assertion a picture cannot make: the press that opened this destroyed
// nothing.
if (!(await page.getByText(ANSWER).count())) {
  problems.push('pressing the bin once already deleted the answer.');
}
if (!/answer goes with it/i.test(await confirm.innerText())) {
  problems.push('the confirmation does not say the client’s answer goes too.');
}

/* --- and a delete that fails --- */

await page.route(`**/api/admin/projects/${PROJECT_ID}/onboarding/*`, (route) =>
  route.request().method() === 'DELETE'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Internal server error"}' })
    : route.continue()
);
await page.getByRole('button', { name: /remove it and the answer/i }).click();
const alert = page.getByRole('alert').filter({ hasText: /could not remove/i }).first();
await alert.waitFor({ timeout: 8000 });
console.log(`\n  when the delete fails:\n    ${await alert.innerText()}`);
await shot(page, 'delete-failed');

if (!(await page.getByText(ANSWER).count())) {
  problems.push('a FAILED delete redrew the list as though the answer had gone.');
}
await page.unroute(`**/api/admin/projects/${PROJECT_ID}/onboarding/*`);

/* ===== The client's side ================================================= */

const clientCtx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
const clientPage = await clientCtx.newPage();

await clientPage.goto(`${BASE}/client/login`, { waitUntil: 'networkidle' });
await clientPage.fill('input[type="email"]', CLIENT_EMAIL);
await clientPage.fill('input[type="password"]', PASSWORD);
await clientPage.click('button[type="submit"]');
/*
 * Not /\/client/ — that matches /client/login, so it resolved the instant
 * the form was submitted and the next `goto` raced the sign-in. The run then
 * photographed the login page, called it the client's form, and read an
 * ordering check over text that was never there: a check that cannot fail.
 * The negative lookahead waits for a page that is not the login.
 */
await clientPage.waitForURL(/\/client\/(?!login)/, { timeout: 30_000 });
await clientPage.goto(`${BASE}/client/${PROJECT_ID}`, { waitUntil: 'networkidle' });
await clientPage.waitForTimeout(1500);

/*
 * "Answer now" is the prompt on the overview; the tab itself is a row of
 * icon buttons whose names are not the word "onboarding". Either route gets
 * to the same panel, and taking the prompt is the one a client would take.
 */
for (const name of [/answer now/i, /onboarding/i]) {
  const tab = clientPage.getByRole('button', { name }).first();
  if (await tab.count()) {
    await tab.click();
    break;
  }
}
/*
 * Wait for the panel to actually hold a question rather than for a duration.
 * A fixed pause caught this mid-render and read an ordering check over an
 * empty string, which is a check that cannot fail — the worst kind to have.
 */
await clientPage
  .getByText(EXPECTED[0], { exact: false })
  .first()
  .waitFor({ timeout: 15_000 })
  .catch(() => {});
await clientPage.waitForTimeout(600);
await shot(clientPage, 'client-form');

const clientText = await clientPage.locator('body').innerText();
// Stated separately from the ordering check, so "signed out" and "asked in
// the wrong order" cannot be reported as the same thing.
if (/Client Login/i.test(clientText)) {
  problems.push('the client half never signed in — this is the login page.');
}
checkOrder('the client', clientText);

await browser.close();

if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`  !! ${p}`);
  console.log('');
  process.exit(1);
}
console.log('\nDone — asked in the order they were written, and nothing destroyed without being asked.\n');
