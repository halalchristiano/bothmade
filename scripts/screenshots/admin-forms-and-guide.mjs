/**
 * Two things from one pass, both of which read correctly in the source and
 * were wrong in the browser.
 *
 * The new-project form has seven visible labels with nothing attached to them,
 * which is invisible by construction: the markup renders identically whether
 * htmlFor is there or not. And lib/notification-guide.ts described four of the
 * six jobs in vercel.json while its own header claimed the two could not drift.
 *
 * So this resolves accessible names the way a browser does — aria-label first,
 * then aria-labelledby, then label[for], then a wrapping label, which is the
 * real precedence order — and screenshots the guide as staff actually see it on
 * the dashboard.
 *
 * ## Running it
 *
 *   npm i -D playwright        # not a project dependency; see billing.mjs
 *   npx prisma generate && npx next build && npx next start
 *   JWT_SECRET=<the value the server is running with> \
 *     node scripts/screenshots/admin-forms-and-guide.mjs
 *
 * The cookie is minted here because proxy.ts redirects an unauthenticated
 * /admin/* to the login page. No database needed: the form is client-rendered
 * and the guide is a constant.
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

const token = jwt.sign(
  { userId: 'shot', email: 'evan@bothmade.studio', role: 'owner', type: 'user' },
  SECRET,
  { expiresIn: '1h' }
);

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
await ctx.addCookies([
  { name: process.env.AUTH_COOKIE_NAME || 'auth_token', value: token, url: BASE },
]);

// --- The form --------------------------------------------------------------

const form = await ctx.newPage();
await form.goto(`${BASE}/admin/projects/new`, { waitUntil: 'networkidle' });
await form.waitForTimeout(700);

const fields = await form.evaluate(() => {
  // Browser precedence, not getByLabelText's: aria-label beats a label[for],
  // which is how the phone field ended up named after its own placeholder.
  const nameOf = (el) => {
    if (el.getAttribute('aria-label')) return { name: el.getAttribute('aria-label'), via: 'aria-label' };
    const by = el.getAttribute('aria-labelledby');
    if (by) return { name: document.getElementById(by)?.textContent?.trim() || '', via: 'aria-labelledby' };
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return { name: l.textContent.trim(), via: `label[for=${el.id}]` };
    }
    const wrap = el.closest('label');
    if (wrap) return { name: wrap.textContent.trim(), via: 'wrapping label' };
    return { name: '', via: `only placeholder="${el.placeholder || ''}"` };
  };

  return [...document.querySelectorAll('input,select,textarea')]
    .filter((el) => el.type !== 'hidden')
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    })
    .map((el) => {
      const { name, via } = nameOf(el);
      return { kind: `${el.tagName.toLowerCase()}${el.type ? `[${el.type}]` : ''}`, name, via };
    });
});

const unnamed = fields.filter((f) => !f.name);
await form.screenshot({ path: path.join(OUT, 'new-project-form.png') });

// --- The guide, as staff see it -------------------------------------------

const dash = await ctx.newPage();
await dash.goto(`${BASE}/admin/dashboard`, { waitUntil: 'networkidle' });
await dash.waitForTimeout(1200);

/*
 * The guide is a collapsed disclosure — `{open && ...}`, so its rules are not
 * in the document until somebody expands it. Reading innerText without this
 * click reports both new rules as missing, which is what the first run of this
 * script did.
 */
await dash
  .getByRole('button', { name: /tell you, and when/i })
  .first()
  .click({ timeout: 5000 })
  .catch(() => {});
await dash.waitForTimeout(500);

const guide = await dash.evaluate(() => {
  const text = document.body.innerText || '';
  return {
    rendered: /what the system will tell you|Getting paid|notification/i.test(text),
    mentionsAutoFollowUp: /your own Gmail/i.test(text),
    mentionsNudge: /nudged once a day/i.test(text),
  };
});

// Scroll the guide into view for the shot, if it rendered.
await dash
  .evaluate(() => {
    const el = [...document.querySelectorAll('*')].find((n) =>
      /Getting paid/i.test(n.textContent || '') && n.children.length < 12
    );
    el?.scrollIntoView({ block: 'center' });
  })
  .catch(() => {});
await dash.waitForTimeout(400);
await dash.screenshot({ path: path.join(OUT, 'notification-guide.png') });

// --- The coupling test ----------------------------------------------------

async function vitestSummary(file) {
  try {
    const { stdout } = await run('npx', ['vitest', 'run', file, '--reporter=json'], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 32,
    });
    const json = JSON.parse(stdout.slice(stdout.indexOf('{')));
    return { passed: json.numPassedTests ?? 0, failed: json.numFailedTests ?? 0 };
  } catch {
    return { passed: 0, failed: -1 };
  }
}

const coupling = await vitestSummary('tests/lib/notification-guide-crons.test.ts');
const labels = await vitestSummary('tests/components/new-project-form-labels.test.tsx');

const crons = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')).crons ?? [];

// --- Sheet ---------------------------------------------------------------

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
  .label { width:390px; color:#b9b4cd; }
  .value { font-family:ui-monospace, Menlo, monospace; font-size:11.5px; color:#7fd1ff; }
  .note { color:#6f6a8a; font-size:11.5px; margin-top:10px; font-style:italic; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
</style>

<h1>New-project form &amp; the notification guide &mdash; live evidence</h1>
<div class="sub">Signed in with a minted cookie against a <b>production</b> build at
<b>${esc(BASE)}</b>. Accessible names resolved in the browser's own precedence order.</div>

<section>
  <h2>/admin/projects/new &mdash; every control has a name</h2>
  <table>
    ${(() => {
      /*
       * The seven fixed here are the ones with a separate <label>. The rest are
       * the add-on checkboxes, which wrap their own label and were already
       * correct — forty-odd rows of them buried the point, so they are counted
       * rather than listed.
       */
      const named = fields.filter((f) => f.via.startsWith('label[for='));
      const wrapped = fields.filter((f) => f.via === 'wrapping label');
      const other = fields.filter((f) => !f.via.startsWith('label[for=') && f.via !== 'wrapping label');
      return [
        ...named.map((f) => row(Boolean(f.name), `${f.kind} — "${f.name}"`, f.via)),
        row(
          wrapped.every((f) => f.name),
          `${wrapped.length} add-on checkboxes — already correct`,
          'each wraps its own label'
        ),
        ...other.map((f) => row(Boolean(f.name), `${f.kind} — "${f.name || 'NO ACCESSIBLE NAME'}"`, f.via)),
      ].join('');
    })()}
  </table>
  <table style="margin-top:12px">
    ${row(unnamed.length === 0, 'controls announced as "edit text, blank"', unnamed.length === 0 ? 'none' : `${unnamed.length} of ${fields.length}`)}
  </table>
  <div class="note">
    Seven of these had a visible &lt;label&gt; and no htmlFor, and unlike /start they had no
    placeholder either &mdash; so there was nothing at all to announce.
  </div>
</section>

<div class="cols">
  <section>
    <h2>The guide, on the dashboard staff open</h2>
    <table>
      ${row(guide.rendered, 'guide renders', guide.rendered ? 'on /admin/dashboard' : 'not found')}
      ${row(guide.mentionsAutoFollowUp, 'auto-follow-up described, and that it sends as you', guide.mentionsAutoFollowUp ? '"your own Gmail" on screen' : 'MISSING')}
      ${row(guide.mentionsNudge, 'enquiry nudge described, with its 14-day brake', guide.mentionsNudge ? '"nudged once a day" on screen' : 'MISSING')}
    </table>
    <div class="note">Both were absent, while ${crons.length} jobs run on a schedule.</div>
  </section>

  <section>
    <h2>Enforced, not asserted in a comment</h2>
    <table>
      ${row(coupling.failed === 0 && coupling.passed > 0, 'notification-guide-crons.test.ts', `${coupling.passed} passing, ${coupling.failed} failing`)}
      ${row(labels.failed === 0 && labels.passed > 0, 'new-project-form-labels.test.tsx', `${labels.passed} passing, ${labels.failed} failing`)}
    </table>
    <div class="note">
      The guide's header claimed it "cannot drift" from vercel.json. The test reads vercel.json and
      fails on any scheduled hour nothing describes.
    </div>
  </section>
</div>
`;

const sheet = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await sheet.setContent(html, { waitUntil: 'load' });
await sheet.screenshot({ path: path.join(OUT, 'admin-forms-evidence.png'), fullPage: true });
await browser.close();

console.log(`admin-forms-evidence.png, new-project-form.png, notification-guide.png -> ${OUT}`);
console.log(`form controls: ${fields.length}, unnamed: ${unnamed.length}`);
for (const f of fields) console.log(`  ${f.kind.padEnd(18)} "${f.name}"  (${f.via})`);
console.log(`guide rendered=${guide.rendered} autoFollowUp=${guide.mentionsAutoFollowUp} nudge=${guide.mentionsNudge}`);
console.log(`coupling tests: ${coupling.passed} passing, ${coupling.failed} failing`);
