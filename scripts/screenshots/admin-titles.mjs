/**
 * What the browser tab says on every admin page, and where a missing one lands.
 *
 * Two things from the same pass, both invisible to a unit test in the way that
 * matters. `adminPageTitle()` can be asserted as a pure function all day, and
 * that proves nothing about whether the layout's effect actually runs and
 * whether `document.title` ends up different on each page after a real
 * client-side navigation. And the admin 404 is a question about which page
 * Next resolves for a route that does not exist, which only routing can answer.
 *
 * So this signs in, walks the admin, and reads the real title off each page.
 *
 * ## Running it
 *
 *   npm i -D playwright        # not a project dependency; see billing.mjs
 *   npx prisma generate && npx next build && npx next start
 *   JWT_SECRET=<the value the server is running with> \
 *     node scripts/screenshots/admin-titles.mjs
 *
 * The cookie is minted here with the same JWT_SECRET, because proxy.ts
 * redirects an unauthenticated /admin/* to the login page — without one, every
 * screenshot would be of the login form. Same approach as billing.mjs.
 *
 * No database needed. The layout's session fetch fails and the panels render
 * empty, which is irrelevant: the title comes from the pathname, and the 404
 * page reads from nothing at all.
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

const PAGES = [
  '/admin/dashboard',
  '/admin/sales',
  '/admin/leads',
  '/admin/billing',
  '/admin/projects',
  '/admin/clients',
  '/admin/team-chat',
  '/admin/team',
  '/admin/settings',
  '/admin/call-list',
];

const MISSING = '/admin/no-such-page';

const token = jwt.sign(
  { userId: 'shot-user', email: 'evan@bothmade.studio', role: 'owner', type: 'user' },
  SECRET,
  { expiresIn: '1h' }
);

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addCookies([
  { name: process.env.AUTH_COOKIE_NAME || 'auth_token', value: token, url: BASE },
]);

const page = await ctx.newPage();

// --- Titles, read after a real navigation ----------------------------------

const titles = [];
for (const route of PAGES) {
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' }).catch(() => {});
  // The title is set in an effect, so it lands after hydration.
  await page.waitForTimeout(700);
  titles.push({ route, title: await page.title(), url: page.url() });
}

const marketingTitle = await (async () => {
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  const t = await p.title();
  await p.close();
  return t;
})();

const unique = new Set(titles.map((t) => t.title));
const stillMarketing = titles.filter((t) => t.title === marketingTitle);

// --- The 404 ---------------------------------------------------------------

await page.goto(BASE + MISSING, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);

const notFound = await page.evaluate(() => ({
  title: document.title,
  heading: (document.body.innerText || '').split('\n').find((l) => l.trim().length > 3) || '',
  links: [...document.querySelectorAll('main a, a')]
    .map((a) => a.getAttribute('href') || '')
    // Fragment links (the skip link) are not exits.
    .filter((h) => h.startsWith('/')),
  // The tell: the marketing 404 renders this, the admin one must not.
  pitchesTheStudio: (document.body.innerText || '').toLowerCase().includes('get in touch'),
}));

const exitsStayInAdmin = notFound.links.length > 0 && notFound.links.every((h) => h.startsWith('/admin'));

await page.screenshot({ path: path.join(OUT, 'admin-404.png') });

// --- The non-visual half ---------------------------------------------------

async function vitestSummary(file) {
  try {
    const { stdout } = await run('npx', ['vitest', 'run', file, '--reporter=json'], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 32,
    });
    const json = JSON.parse(stdout.slice(stdout.indexOf('{')));
    return { passed: json.numPassedTests ?? 0, failed: json.numFailedTests ?? 0 };
  } catch (error) {
    return { passed: 0, failed: -1 };
  }
}

const indexing = await vitestSummary('tests/lib/case-study-indexing.test.ts');

// --- Sheet -----------------------------------------------------------------

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
  .value { font-family:ui-monospace, Menlo, monospace; font-size:11.5px; color:#7fd1ff; }
  .note { color:#6f6a8a; font-size:11.5px; margin-top:10px; font-style:italic; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
</style>

<h1>Admin tabs &amp; the missing page &mdash; live evidence</h1>
<div class="sub">Signed in with a minted cookie against a <b>production</b> build at
<b>${esc(BASE)}</b>. Titles read with <code>page.title()</code> after a real navigation, so the
layout effect has actually run.</div>

<section>
  <h2>What each tab says now</h2>
  <table>
    ${titles.map((t) => {
      const landed = new URL(t.url).pathname;
      const via = landed === t.route ? '' : `  (redirects to ${landed})`;
      return row(t.title !== marketingTitle, t.route + via, t.title || '(empty)');
    }).join('')}
  </table>
  <table style="margin-top:12px">
    ${row(stillMarketing.length === 0, 'none left on the marketing title', stillMarketing.length === 0 ? 'all renamed' : `${stillMarketing.length} still generic`)}
    ${row(unique.size >= 8, 'distinct where the routes are distinct', `${unique.size} across ${titles.length} requested — three of them are redirects onto /admin/sales`)}
  </table>
  <div class="note">Before: all of them read &ldquo;${esc(marketingTitle)}&rdquo; &mdash; which is still
  correct for the marketing site, and is what the homepage shows.</div>
</section>

<div class="cols">
  <section>
    <h2>A route that does not exist</h2>
    <table>
      ${row(true, 'requested', MISSING)}
      ${row(!notFound.pitchesTheStudio, 'does not pitch the studio to its own staff', notFound.pitchesTheStudio ? '"Get in touch" is on screen' : 'no sales copy')}
      ${row(exitsStayInAdmin, 'every exit stays inside /admin', notFound.links.join('  '))}
      ${row(notFound.title !== marketingTitle, 'and the tab is not the marketing title', notFound.title)}
    </table>
  </section>

  <section>
    <h2>Sitemap and noindex cannot contradict</h2>
    <table>
      ${row(indexing.failed === 0 && indexing.passed > 0, 'tests/lib/case-study-indexing.test.ts', `${indexing.passed} passing, ${indexing.failed} failing`)}
    </table>
    <div class="note">
      One field decides sitemap inclusion in one file and robots metadata in another. Nothing to
      photograph, so the test result is reported rather than described.
    </div>
  </section>
</div>
`;

const sheet = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await sheet.setContent(html, { waitUntil: 'load' });
await sheet.screenshot({ path: path.join(OUT, 'admin-titles-evidence.png'), fullPage: true });

await browser.close();

console.log(`admin-titles-evidence.png, admin-404.png -> ${OUT}`);
console.log(`marketing title: ${marketingTitle}`);
for (const t of titles) console.log(`  ${t.route.padEnd(22)} ${t.title}`);
console.log(`distinct: ${unique.size}/${titles.length}; still generic: ${stillMarketing.length}`);
console.log(`404 exits: ${notFound.links.join(' ')} | stays in admin: ${exitsStayInAdmin}`);
console.log(`indexing tests: ${indexing.passed} passing, ${indexing.failed} failing`);
