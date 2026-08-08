import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The bell, on the one thing it used to get wrong about who said what.
 *
 * It is polled on every admin page for every staff session, and its whole
 * job is to interrupt somebody — which makes it the surface where a wrong
 * sentence costs the most. It had no tests at all until the round this
 * script was written in, and what the first test found was this: it read a
 * system row's `fromUserId` as though it were a sender.
 *
 * A system row is the app narrating — a client approved their mockup, a
 * payment landed, a cold email was opened. It carries an author only because
 * the schema wants one and postSystemMessage fills it with the related
 * lead's owner or, failing that, whichever staff account findFirst returned.
 * The chat page knows this and draws those rows centred, as timeline entries
 * rather than speech. The bell drew them as people:
 *
 *     🚩 Kiana needs a response
 *     🎉 Vellum Studio approved their mockup. Send the proposal.
 *
 * Kiana wrote nothing, is waiting for nothing, and the thing actually
 * outstanding is a proposal. This photographs the same three rows — one real
 * message, one casual system row, one flagged system row — from a colleague's
 * session, and fails the run if any of them is attributed to a person who
 * did not type it. The real message is in there on purpose: a fix that
 * anonymises everything would be its own bug and passes nothing here.
 *
 * Needs a dev server, a database, two staff accounts and three chat rows.
 * The seed below is what it expects; run it against a scratch database.
 *
 *   npm run dev -- -p 3100
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *     node scripts/screenshots/notification-bell.mjs
 *
 * Imports playwright-core, not playwright: it is the one in package.json, so
 * this runs after a plain `npm ci`.
 */

const BASE = process.env.BOTHMADE_BASE ?? 'http://localhost:3100';
const OUT = process.env.BOTHMADE_SHOT_DIR ?? '/tmp/notification-bell-shots';
/** The colleague looking at the bell — deliberately NOT the attributed author. */
const EMAIL = process.env.SHOT_EMAIL ?? 'evan@bothmade.studio';
const PASSWORD = process.env.SHOT_PASSWORD ?? 'screenshot-only';
/** Who postSystemMessage happened to hang the system rows off. */
const ATTRIBUTED = process.env.SHOT_ATTRIBUTED_NAME ?? 'Kiana';
const CHROMIUM = process.env.CHROMIUM_PATH;

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();

await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30_000 });
// The bell polls; the first payload arrives after the page settles.
await page.waitForTimeout(2500);

const bell = page.getByRole('button', { name: /^Notifications/ });
console.log(`\n  the bell's own label: ${await bell.getAttribute('aria-label')}`);

await bell.click();
const menu = page.getByRole('menu', { name: 'Notifications' });
await menu.waitFor({ timeout: 8000 });
await page.waitForTimeout(500);

const text = await menu.innerText();
console.log(
  '\n  it reads:\n' +
    text.split('\n').filter(Boolean).map((l) => `    ${l}`).join('\n')
);

const file = path.join(OUT, 'bell.png');
await page.screenshot({ path: file });
console.log(`\n  → ${path.relative(process.cwd(), file)}`);

const problems = [];

/*
 * The defect, stated as the sentence it produced. Scoped to the label rather
 * than the menu, because the name may legitimately appear in the body of a
 * message somebody wrote about them.
 */
if (new RegExp(`${ATTRIBUTED} needs a response`).test(text)) {
  problems.push(`the bell says ${ATTRIBUTED} needs a response about a message they never wrote.`);
}
if (!/🚩 Flagged in team chat/.test(text)) {
  problems.push('the flagged system row is not labelled as the app talking.');
}
if (!/New in team chat/.test(text)) {
  problems.push('the casual system row is not labelled as the app talking.');
}
/* And the control: a fix that anonymised everything would be a worse bug. */
if (!new RegExp(`${ATTRIBUTED} messaged you`).test(text)) {
  problems.push(`a real message from ${ATTRIBUTED} has lost their name.`);
}

await browser.close();

if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`  !! ${p}`);
  console.log('');
  process.exit(1);
}
console.log('\nDone — the app announces its own news, and nobody else’s name is on it.\n');
