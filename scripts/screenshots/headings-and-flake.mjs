/**
 * The two headings that were missing, and the sweep that found them.
 *
 * A missing h1 is the definition of a defect you cannot see: the page looks
 * finished, the copy is on screen at the right size, and nothing anywhere says
 * the document has no title. /ios even has an h1 in its source — it just sits
 * inside the launched-app state of the hero, so it does not exist until
 * somebody clicks an app icon.
 *
 * So this reads the real heading outline off the live pages, and runs the sweep
 * that found them across the whole app.
 *
 * ## Running it
 *
 *   npm i -D playwright        # not a project dependency; see billing.mjs
 *   npx prisma generate && npx next build && npx next start
 *   JWT_SECRET=<the value the server is running with> \
 *     node scripts/screenshots/headings-and-flake.mjs
 *
 * ## What is real and what is not
 *
 * The outlines and the h1 text are read from the running server. The sweep line
 * is a real invocation of scripts/screenshots/a11y-sweep.mjs, reporting the
 * count it actually returned. The timeout figure is read out of
 * vitest.config.mts rather than typed in.
 */

import { chromium } from 'playwright';
import jwt from 'jsonwebtoken';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const run = promisify(execFile);

const BASE = process.env.SHOT_BASE_URL || 'http://localhost:3000';
const OUT = process.env.SHOT_OUT || path.join(process.cwd(), '.screenshots');
const CHROMIUM = process.env.CHROMIUM_PATH;
const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  console.error('JWT_SECRET is not set. Use the same value the server is running with.');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const staff = jwt.sign(
  { userId: 'shot', email: 'evan@bothmade.studio', role: 'owner', type: 'user' },
  SECRET,
  { expiresIn: '1h' }
);

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addCookies([
  { name: process.env.AUTH_COOKIE_NAME || 'auth_token', value: staff, url: BASE },
]);

/** The first few headings, as the document actually exposes them. */
async function outline(route) {
  const page = await ctx.newPage();
  await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600);
  const result = await page.evaluate(() => {
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    return {
      h1Count: hs.filter((h) => h.tagName === 'H1').length,
      h1Text: hs.find((h) => h.tagName === 'H1')?.textContent?.trim().slice(0, 78) || '',
      first: hs.slice(0, 4).map((h) => `${h.tagName} ${(h.textContent || '').trim().slice(0, 40)}`),
    };
  }).catch(() => ({ h1Count: -1, h1Text: '', first: [] }));
  await page.close();
  return result;
}

const ios = await outline('/ios');
const web = await outline('/web');
const vision = await outline('/visionpro');
const admin404 = await outline('/admin/no-such-page');

// --- The sweep, actually run ----------------------------------------------

let sweep = { line: 'could not run', ok: false };
try {
  const { stdout } = await run('node', ['scripts/screenshots/a11y-sweep.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, JWT_SECRET: SECRET },
    maxBuffer: 1024 * 1024 * 16,
  });
  sweep = { line: stdout.trim().split('\n').slice(0, 2).join(' — '), ok: /no findings/.test(stdout) };
} catch (error) {
  // Non-zero exit means it found something; that output is the interesting part.
  const stdout = String(error.stdout || '').trim();
  sweep = { line: stdout.split('\n').slice(0, 3).join(' — ') || String(error).slice(0, 90), ok: false };
}

const timeout = /testTimeout:\s*([\d_]+)/.exec(
  fs.readFileSync(path.join(process.cwd(), 'vitest.config.mts'), 'utf8')
)?.[1]?.replace(/_/g, '') ?? 'not set';

// --- Sheet ----------------------------------------------------------------

const row = (ok, label, value) => `
  <tr><td class="mark ${ok ? 'ok' : 'bad'}">${ok ? '&#10003;' : '&#10007;'}</td>
      <td class="label">${esc(label)}</td>
      <td class="value">${esc(value)}</td></tr>`;

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
  .label { width:330px; color:#b9b4cd; }
  .value { font-family:ui-monospace, Menlo, monospace; font-size:11.5px; color:#7fd1ff; word-break:break-word; }
  .note { color:#6f6a8a; font-size:11.5px; margin-top:10px; font-style:italic; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
</style>

<h1>Missing headings &amp; a red build &mdash; live evidence</h1>
<div class="sub">Outlines read from a <b>production</b> build at <b>${esc(BASE)}</b>; the sweep
line is a real run of a11y-sweep.mjs; the timeout is read out of vitest.config.mts.</div>

<section>
  <h2>Exactly one h1 on every service page</h2>
  <table>
    ${row(ios.h1Count === 1, '/ios', `${ios.h1Count} — "${ios.h1Text}"`)}
    ${row(web.h1Count === 1, '/web', `${web.h1Count} — "${web.h1Text}"`)}
    ${row(vision.h1Count === 1, '/visionpro', `${vision.h1Count} — "${vision.h1Text}"`)}
  </table>
  <div class="note">
    /ios had zero. Its headline sits inside the launched-app state of the hero, so it did not
    exist until somebody clicked an app icon &mdash; and the h1 <i>is</i> in the source, which is
    why reading the file does not show this.
  </div>
</section>

<div class="cols">
  <section>
    <h2>The admin 404 has a heading to land on</h2>
    <table>
      ${row(admin404.h1Count === 1, '/admin/no-such-page', `${admin404.h1Count} h1 — "${admin404.h1Text}"`)}
      ${admin404.first.map((h) => row(true, 'outline', h)).join('')}
    </table>
    <div class="note">It was a &lt;p&gt;, so the page had no outline at all. My own, from earlier today.</div>
  </section>

  <section>
    <h2>The sweep that found both</h2>
    <table>
      ${row(sweep.ok, 'scripts/screenshots/a11y-sweep.mjs', sweep.line)}
      ${row(Number(timeout) >= 15000, 'components testTimeout', `${timeout}ms (was Vitest's 5000 default)`)}
    </table>
    <div class="note">
      main was red from a test that only fails when the runner is busy &mdash; reproduced with two
      competing vitest processes, three files timing out at 5000ms.
    </div>
  </section>
</div>
`;

const sheet = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await sheet.setContent(html, { waitUntil: 'load' });
await sheet.screenshot({ path: path.join(OUT, 'headings-evidence.png'), fullPage: true });
await browser.close();

console.log(`headings-evidence.png -> ${OUT}`);
console.log(`/ios h1=${ios.h1Count} "${ios.h1Text}"`);
console.log(`/web h1=${web.h1Count}  /visionpro h1=${vision.h1Count}  /admin/no-such-page h1=${admin404.h1Count}`);
console.log(`sweep: ${sweep.line}`);
console.log(`testTimeout: ${timeout}`);
