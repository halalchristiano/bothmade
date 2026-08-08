/**
 * Does the site actually behave differently for someone who asked for less
 * motion?
 *
 * `prefers-reduced-motion` is a setting nobody developing the site has turned
 * on, which is exactly why things drift out of compliance with it silently.
 * LuxuryCursor is the case in point: it hid the system cursor and ran a
 * requestAnimationFrame trail regardless, and the reduced-motion block in
 * globals.css could not reach it, because that block flattens
 * animation-duration and transition-duration while the trail writes
 * `style.transform` every frame.
 *
 * This loads the same page twice in two browser contexts — one ordinary, one
 * with `reducedMotion: 'reduce'`, which sets the real media feature rather
 * than mocking it — and reports what each one gets.
 *
 * ## Running it
 *
 *   npm i -D playwright        # not a project dependency; see billing.mjs
 *   npx prisma generate && npx next build && npx next start
 *   node scripts/screenshots/reduced-motion.mjs
 *
 * ## What is real and what is not
 *
 * Everything on the sheet is measured in the browser at run time. The
 * non-visual work from the same pass — the plaintext part on the App Password
 * mail transport, and the deletion guards — cannot be photographed, so the
 * script runs those two test files with vitest's JSON reporter and prints the
 * result it actually got rather than a claim about it.
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
const PAGE = '/blog'; // renders LuxuryCursor and a column of FocusRow reveals

fs.mkdirSync(OUT, { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// --- Browser measurements --------------------------------------------------

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});

async function measure(reduce) {
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 800 },
    // The real media feature, not a stubbed matchMedia.
    reducedMotion: reduce ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  await page.goto(BASE + PAGE, { waitUntil: 'networkidle' });
  await page.mouse.move(600, 400);
  await page.waitForTimeout(400);

  const result = await page.evaluate(() => ({
    mediaMatches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    cursorHidden: document.documentElement.classList.contains('has-lux-cursor'),
    bodyCursor: getComputedStyle(document.body).cursor,
    dotsVisible: [...document.querySelectorAll('.lux-cursor')].filter(
      (el) => el.style.opacity === '1'
    ).length,
    dotsInDom: document.querySelectorAll('.lux-cursor').length,
  }));

  await ctx.close();
  return result;
}

const normal = await measure(false);
const reduced = await measure(true);

// --- Test results for the parts a picture cannot show ----------------------

async function vitestSummary(file) {
  try {
    const { stdout } = await run(
      'npx',
      ['vitest', 'run', file, '--reporter=json'],
      { cwd: process.cwd(), maxBuffer: 1024 * 1024 * 32 }
    );
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

const mailer = await vitestSummary('tests/lib/mailer-plaintext.test.ts');
const guards = await vitestSummary('tests/lib/deletion-guards.test.ts');

// --- Sheet -----------------------------------------------------------------

const row = (ok, label, value) => `
  <tr><td class="mark ${ok ? 'ok' : 'bad'}">${ok ? '&#10003;' : '&#10007;'}</td>
      <td class="label">${esc(label)}</td>
      <td class="value">${esc(value)}</td></tr>`;

const suite = (title, r, file) => `
<section>
  <h2>${esc(title)}</h2>
  <table>
    ${row(r.failed === 0 && r.passed > 0, `${file}`, `${r.passed} passing, ${r.failed} failing`)}
  </table>
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
  .label { width:340px; color:#b9b4cd; }
  .value { font-family:ui-monospace, Menlo, monospace; font-size:11.5px; color:#7fd1ff; }
  .note { color:#6f6a8a; font-size:11.5px; margin-top:10px; font-style:italic; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  ul { margin:10px 0 0; padding-left:18px; color:#8f8aa8; font-size:11.5px; }
  li { margin:2px 0; }
</style>

<h1>prefers-reduced-motion &mdash; live evidence</h1>
<div class="sub">Same page (<b>${esc(PAGE)}</b>) loaded in two browser contexts against a
<b>production</b> build. The right-hand column sets the real media feature via Playwright's
<code>reducedMotion: 'reduce'</code>, not a stubbed matchMedia.</div>

<div class="cols">
  <section>
    <h2>Ordinary visitor</h2>
    <table>
      ${row(!normal.mediaMatches, 'prefers-reduced-motion matches', String(normal.mediaMatches))}
      ${row(normal.cursorHidden, 'custom cursor takes over', normal.cursorHidden ? 'has-lux-cursor applied' : 'not applied')}
      ${row(normal.bodyCursor === 'none', 'system cursor replaced', `cursor: ${normal.bodyCursor}`)}
      ${row(normal.dotsVisible > 0, 'cursor dots revealed on move', `${normal.dotsVisible} of ${normal.dotsInDom}`)}
    </table>
    <div class="note">The feature still works. A "fix" that switched it off for everyone would be worse than the bug.</div>
  </section>

  <section>
    <h2>Visitor who asked for less motion</h2>
    <table>
      ${row(reduced.mediaMatches, 'prefers-reduced-motion matches', String(reduced.mediaMatches))}
      ${row(!reduced.cursorHidden, 'custom cursor stands down', reduced.cursorHidden ? 'has-lux-cursor APPLIED' : 'not applied')}
      ${row(reduced.bodyCursor !== 'none', 'system cursor left alone', `cursor: ${reduced.bodyCursor}`)}
      ${row(reduced.dotsVisible === 0, 'no trail chasing the pointer', `${reduced.dotsVisible} of ${reduced.dotsInDom} revealed`)}
    </table>
    <div class="note">Before this change both columns were identical: cursor: none, trail running.</div>
  </section>
</div>

${suite('Plaintext part on the App Password mail transport', mailer, 'tests/lib/mailer-plaintext.test.ts')}
${suite('Guards against irreversible deletion', guards, 'tests/lib/deletion-guards.test.ts')}

<section>
  <h2>Why these two are listed rather than photographed</h2>
  <div class="note" style="font-style:normal; color:#8f8aa8;">
    A MIME part and a delete guard have no appearance. Rather than assert them in prose, the
    script runs both test files with vitest's JSON reporter and prints the counts and titles it
    actually got back &mdash; so this panel goes red if they stop passing.
  </div>
</section>
`;

const sheet = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await sheet.setContent(html, { waitUntil: 'load' });
await sheet.screenshot({ path: path.join(OUT, 'reduced-motion-evidence.png'), fullPage: true });
await browser.close();

console.log(`reduced-motion-evidence.png -> ${OUT}`);
console.log(`normal : cursorHidden=${normal.cursorHidden} bodyCursor=${normal.bodyCursor} dotsVisible=${normal.dotsVisible}`);
console.log(`reduced: cursorHidden=${reduced.cursorHidden} bodyCursor=${reduced.bodyCursor} dotsVisible=${reduced.dotsVisible}`);
console.log(`mailer tests: ${mailer.passed} passing, ${mailer.failed} failing`);
console.log(`guard tests : ${guards.passed} passing, ${guards.failed} failing`);
