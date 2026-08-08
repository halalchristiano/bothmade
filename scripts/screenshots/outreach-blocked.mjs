/**
 * What the bell now says when the follow-up cron cannot run.
 *
 * The cron has been refusing correctly and reporting into Vercel's log, which
 * nobody opens — so the sequence stopped advancing and the only symptom was
 * leads who were spoken to on the phone never hearing back. The check that
 * fixes that is a pure function, and a pure function is exactly what you can
 * get right while the sentence never reaches a human.
 *
 * This renders the three states it can be in, alongside the address the cron
 * actually demands, read out of lib/auto-follow-up.ts rather than typed here.
 *
 * ## Running it
 *
 *   npm i -D playwright        # not a project dependency; see billing.mjs
 *   node scripts/screenshots/outreach-blocked.mjs
 *
 * No server and no database. The blocker is decided from a user row the caller
 * already fetched, so the three states can be produced directly — which is
 * also the reason this could be written at all from an environment with no
 * production database in reach.
 */

import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const run = promisify(execFile);

const OUT = process.env.SHOT_OUT || path.join(process.cwd(), '.screenshots');
const CHROMIUM = process.env.CHROMIUM_PATH;

fs.mkdirSync(OUT, { recursive: true });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const root = process.cwd();

/** The mailbox the cron demands, from the source rather than from memory. */
const senderSource = fs.readFileSync(path.join(root, 'lib/auto-follow-up.ts'), 'utf8');
const sender =
  /AUTO_FOLLOW_UP_FROM \|\| '([^']+)'/.exec(senderSource)?.[1] ?? '(could not read)';

/** The three sentences, from the module itself. */
const blockerSource = fs.readFileSync(path.join(root, 'lib/outreach-health.ts'), 'utf8');
const noAccount = /reason: 'no-account'[\s\S]*?detail: `([^`]+)`/.exec(blockerSource)?.[1] ?? '';
const noGmail = /reason: 'no-gmail'[\s\S]*?detail: `([^`]+)`/.exec(blockerSource)?.[1] ?? '';
const fill = (t) => t.replace(/\$\{senderEmail\}/g, sender);

/** Is the warning actually wired into the bell? */
const bellSource = fs.readFileSync(path.join(root, 'app/api/admin/notifications/route.ts'), 'utf8');
const wiredIntoBell = /autoFollowUpBlocker/.test(bellSource);

/** The domain the rest of the studio uses, for the contrast that matters. */
const primaryDomain = /STUDIO_INBOX="[^"]*?@([a-z.]+)/.exec(
  fs.readFileSync(path.join(root, '.env.example'), 'utf8')
)?.[1] ?? 'bothmade.studio';

async function vitestSummary(file) {
  try {
    const { stdout } = await run('npx', ['vitest', 'run', file, '--reporter=json'], {
      cwd: root,
      maxBuffer: 1024 * 1024 * 32,
    });
    const json = JSON.parse(stdout.slice(stdout.indexOf('{')));
    return { passed: json.numPassedTests ?? 0, failed: json.numFailedTests ?? 0 };
  } catch {
    return { passed: 0, failed: -1 };
  }
}

const health = await vitestSummary('tests/lib/outreach-health.test.ts');
const bell = await vitestSummary('tests/lib/notifications-bell.test.ts');

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
  .label { width:300px; color:#b9b4cd; }
  .value { font-family:ui-monospace, Menlo, monospace; font-size:11.5px; color:#7fd1ff; word-break:break-word; }
  .note { color:#6f6a8a; font-size:11.5px; margin-top:10px; font-style:italic; }
  .bell { border:1px solid #3b2f10; background:#191203; border-radius:10px;
          padding:12px 14px; margin-bottom:8px; }
  .bell .l { font-weight:600; color:#fbbf24; font-size:13px; }
  .bell .d { color:#c9c5da; font-size:12px; margin-top:3px; }
  .bell .h { font-family:ui-monospace, Menlo, monospace; font-size:11px; color:#7fd1ff; margin-top:5px; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  code { color:#7fd1ff; }
</style>

<h1>The follow-up cron, and why it will not start</h1>
<div class="sub">Values read from <b>lib/auto-follow-up.ts</b>, <b>lib/outreach-health.ts</b> and
<b>.env.example</b>; test counts from real runs. Nothing here is typed in.</div>

<section>
  <h2>The mailbox the cron demands</h2>
  <table>
    ${row(true, 'AUTO_FOLLOW_UP_FROM default', sender)}
    ${row(true, 'domain the rest of the studio uses', primaryDomain)}
    ${row(true, 'these differ on purpose', 'secondary sending domain — no history to protect')}
  </table>
  <div class="note">
    Not a typo. lib/auto-follow-up.ts: these are automated, cold-ish emails and must not go out
    from a mailbox whose reputation the invoices depend on. So the account to create is the
    one on the <b>first</b> line above, not the address it looks like.
  </div>
</section>

<section>
  <h2>What the bell says now, in each state</h2>
  <div class="bell">
    <div class="l">Automated follow-ups are not sending</div>
    <div class="d">${esc(fill(noAccount))}</div>
    <div class="h">&rarr; /admin/team</div>
  </div>
  <div class="bell">
    <div class="l">Automated follow-ups are not sending</div>
    <div class="d">${esc(fill(noGmail))}</div>
    <div class="h">&rarr; /admin/settings</div>
  </div>
  <table style="margin-top:12px">
    ${row(wiredIntoBell, 'wired into /api/admin/notifications', wiredIntoBell ? 'yes — reaches the bell on every admin page' : 'NOT WIRED')}
    ${row(health.failed === 0 && health.passed > 0, 'tests/lib/outreach-health.test.ts', `${health.passed} passing, ${health.failed} failing`)}
    ${row(bell.failed === 0 && bell.passed > 0, 'tests/lib/notifications-bell.test.ts', `${bell.passed} passing, ${bell.failed} failing`)}
  </table>
  <div class="note">
    Two states, two sentences, two destinations — sending somebody to Team to create an account
    that already exists is how a setup task gets abandoned. Before this, both produced silence.
  </div>
</section>

<section>
  <h2>What this does not do</h2>
  <table>
    ${row(false, 'create the account', 'needs the production database — unreachable from here')}
    ${row(false, 'connect the Gmail', 'Google OAuth consent — only the mailbox owner can grant it')}
  </table>
  <div class="note">
    Both are deliberate limits rather than gaps. Refresh tokens are encrypted at rest precisely
    so that nothing but the signed-in owner can establish them; an agent that could connect a
    mailbox on somebody's behalf would make that encryption pointless.
  </div>
</section>
`;

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
const sheet = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await sheet.setContent(html, { waitUntil: 'load' });
await sheet.screenshot({ path: path.join(OUT, 'outreach-blocked.png'), fullPage: true });
await browser.close();

console.log(`outreach-blocked.png -> ${OUT}`);
console.log(`sender: ${sender}  (studio domain: ${primaryDomain})`);
console.log(`wired into bell: ${wiredIntoBell}`);
console.log(`outreach-health: ${health.passed} passing, ${health.failed} failing`);
console.log(`notifications-bell: ${bell.passed} passing, ${bell.failed} failing`);
