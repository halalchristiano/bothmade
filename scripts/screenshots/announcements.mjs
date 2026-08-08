/**
 * Does a failed sign-in actually say anything?
 *
 * The failure this covers is silence, which is the hardest kind to notice: the
 * error appears on screen exactly as intended, so the page looks right to
 * everyone who can see it. Both login pages and the enquiry form put their
 * error in a plain `<div>` inserted after the request came back, which no
 * assistive technology announces.
 *
 * This drives a real failed login in a real browser and reports what the
 * accessibility layer ends up holding — the live region, before and after.
 *
 * ## Running it
 *
 *   npm i -D playwright        # not a project dependency; see billing.mjs
 *   npx prisma generate && npx next build && npx next start
 *   node scripts/screenshots/announcements.mjs
 *
 * No database needed. /api/auth/login cannot reach one with placeholder
 * credentials, the request fails, and the page's own catch sets "Login
 * failed" — which is exactly the path being demonstrated. A real rejection
 * looks the same from here.
 *
 * ## What is real and what is not
 *
 * Every value on the sheet is read from the live DOM at run time: whether a
 * region exists on first paint, whether it is empty then, and what it holds
 * after a genuine submit. The two fixes from the same pass that have no
 * appearance — session-length validation and the Stripe reuse-or-mint
 * decision — are run through vitest and reported with the counts that came
 * back, rather than described.
 */

import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const run = promisify(execFile);

const BASE = process.env.SHOT_BASE_URL || 'http://localhost:3000';
const OUT = process.env.SHOT_OUT || path.join(process.cwd(), '.screenshots');
const CHROMIUM = process.env.CHROMIUM_PATH;

fs.mkdirSync(OUT, { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});

const LIVE = '[role="alert"], [role="status"], [aria-live]';

/** Loads a page, submits it, and reports the live region either side. */
async function probe({ url, fill, submit }) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(BASE + url, { waitUntil: 'networkidle' });

  const before = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return {
      exists: !!el,
      empty: (el?.textContent || '').trim() === '',
      role: el?.getAttribute('role') || '',
      live: el?.getAttribute('aria-live') || '',
      atomic: el?.getAttribute('aria-atomic') || '',
    };
  }, LIVE);

  for (const [selector, value] of fill) {
    await page.fill(selector, value).catch(() => {});
  }
  await page.click(submit).catch(() => {});
  // The request has to fail and the state has to settle.
  await page.waitForTimeout(2500);

  const after = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return { text: (el?.textContent || '').trim() };
  }, LIVE);

  await page.close();
  return { before, after };
}

const clientLogin = await probe({
  url: '/client/login',
  fill: [['#login-email', 'dana@northgate.test'], ['#login-password', 'wrong-password']],
  submit: 'button[type="submit"]',
});

const adminLogin = await probe({
  url: '/admin/login',
  fill: [['input[type="email"]', 'evan@bothmade.studio'], ['input[type="password"]', 'wrong-password']],
  submit: 'button[type="submit"]',
});

// --- The two that have no appearance ---------------------------------------

async function vitestSummary(file) {
  try {
    const { stdout } = await run('npx', ['vitest', 'run', file, '--reporter=json'], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 32,
    });
    const json = JSON.parse(stdout.slice(stdout.indexOf('{')));
    const tests = json.testResults?.[0]?.assertionResults ?? [];
    return {
      passed: json.numPassedTests ?? 0,
      failed: json.numFailedTests ?? 0,
      names: tests.filter((t) => t.status === 'passed').map((t) => t.title).slice(0, 6),
    };
  } catch (error) {
    return { passed: 0, failed: -1, names: [`could not run: ${String(error).slice(0, 80)}`] };
  }
}

const cookie = await vitestSummary('tests/lib/auth-cookie-max-age.test.ts');
const checkout = await vitestSummary('tests/lib/instalment-checkout.test.ts');

// --- Sheet -----------------------------------------------------------------

const row = (ok, label, value) => `
  <tr><td class="mark ${ok ? 'ok' : 'bad'}">${ok ? '&#10003;' : '&#10007;'}</td>
      <td class="label">${esc(label)}</td>
      <td class="value">${esc(value)}</td></tr>`;

const panel = (title, r) => `
<section>
  <h2>${esc(title)}</h2>
  <table>
    ${row(r.before.exists, 'live region present on first paint', r.before.exists ? `role="${r.before.role}"` : 'MISSING')}
    ${row(r.before.empty, 'and silent until something happens', r.before.empty ? 'empty' : 'ships with content')}
    ${row(r.before.live === 'assertive', 'assertive — a refused sign-in is not an aside', r.before.live || 'not set')}
    ${row(r.before.atomic === 'true', 'atomic, so it is not re-read in fragments', r.before.atomic || 'not set')}
    ${row(Boolean(r.after.text), 'announces the failure after a real submit', r.after.text || 'NOTHING ANNOUNCED')}
  </table>
</section>`;

const suite = (title, r, file) => `
<section>
  <h2>${esc(title)}</h2>
  <table>${row(r.failed === 0 && r.passed > 0, file, `${r.passed} passing, ${r.failed} failing`)}</table>
  <ul>${r.names.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
</section>`;

const html = `
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; padding:40px; background:#05030a; color:#e8e6f0;
         font:14px/1.55 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  h1 { font-size:27px; margin:0 0 4px; letter-spacing:-0.02em; }
  .sub { color:#8a86a0; font-size:13px; margin-bottom:26px; }
  .sub b { color:#c9c5da; font-weight:600; }
  section { border:1px solid #221d33; border-radius:12px; padding:18px 20px;
            margin-bottom:16px; background:#0b0814; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:0.16em;
       color:#7d78a0; margin:0 0 14px; font-weight:600; }
  table { width:100%; border-collapse:collapse; }
  td { padding:5px 8px 5px 0; vertical-align:top; border-bottom:1px solid #17132480; }
  tr:last-child td { border-bottom:0; }
  .mark { width:22px; font-weight:700; }
  .ok { color:#4ade80; } .bad { color:#f87171; }
  .label { width:360px; color:#b9b4cd; }
  .value { font-family:ui-monospace, Menlo, monospace; font-size:11.5px; color:#7fd1ff; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  ul { margin:10px 0 0; padding-left:18px; color:#8f8aa8; font-size:11.5px; }
  li { margin:2px 0; }
  .note { color:#6f6a8a; font-size:11.5px; margin-top:10px; font-style:italic; }
</style>

<h1>Form errors &mdash; live evidence</h1>
<div class="sub">A real failed sign-in driven in Chromium against a <b>production</b> build at
<b>${esc(BASE)}</b>. Every value is read from the live DOM &mdash; before the submit and after it.</div>

<div class="cols">
  ${panel('Client login', clientLogin)}
  ${panel('Admin login', adminLogin)}
</div>

<section>
  <h2>What this replaces</h2>
  <div class="note" style="font-style:normal; color:#8f8aa8;">
    Each error was a plain <code>&lt;div className="text-red-400"&gt;</code> inserted after the
    request returned. It looked identical on screen and announced nothing: press Login, the button
    stops spinning, silence. Both login pages have <b>two</b> of these &mdash; sign-in and
    forgot-password &mdash; and the first attempt wrapped only the one that does not render by
    default. That is what the "present on first paint" row above is for.
  </div>
</section>

${suite('Session length is validated, not parsed', cookie, 'tests/lib/auth-cookie-max-age.test.ts')}
${suite('Reuse-or-mint on a Stripe payment link', checkout, 'tests/lib/instalment-checkout.test.ts')}
`;

const sheet = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await sheet.setContent(html, { waitUntil: 'load' });
await sheet.screenshot({ path: path.join(OUT, 'announcements-evidence.png'), fullPage: true });
await browser.close();

console.log(`announcements-evidence.png -> ${OUT}`);
for (const [name, r] of [['client', clientLogin], ['admin', adminLogin]]) {
  console.log(
    `${name}: region=${r.before.exists} empty=${r.before.empty} role=${r.before.role} ` +
      `live=${r.before.live} announced=${JSON.stringify(r.after.text.slice(0, 40))}`
  );
}
console.log(`cookie tests: ${cookie.passed} passing, ${cookie.failed} failing`);
console.log(`checkout tests: ${checkout.passed} passing, ${checkout.failed} failing`);
