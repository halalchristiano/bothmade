/**
 * Two inline-HTML sinks, demonstrated rather than asserted.
 *
 * Both controls already existed in this codebase and both were applied
 * unevenly — three of four JSON-LD sites used the escaping helper, one of
 * three preview iframes carried a sandbox. That is the characteristic way a
 * control like this fails: whoever wrote the first one knew exactly why, and
 * the later call sites were written by somebody copying a neighbour.
 *
 * Reading the diff tells you an attribute was added. It does not tell you the
 * attribute does anything. So this runs the hostile input through a real
 * browser, in both configurations, and reports which one executed.
 *
 * ## Running it
 *
 *   npm i -D playwright        # not a project dependency; see billing.mjs
 *   node scripts/screenshots/inline-html-sinks.mjs
 *
 * No server and no database — both sinks are browser-side behaviour, so a
 * blank page with the same markup is a faithful test of them.
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
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/*
 * Comments come off before anything is read out of a source file.
 *
 * This file has now been caught by its own subject matter twice: the sweep
 * test first fired on the comment written above one of the iframes it was
 * checking, and the CSP row below first printed a bare "script-src" because
 * next.config.ts explains the policy in prose above the policy, and the prose
 * quotes it. Explaining a control near the control is correct; a reader that
 * cannot tell the explanation from the thing is the part that is wrong.
 */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});

// --- 1. Does the sandbox attribute actually stop the script? ---------------

/*
 * The payload reaches out of the frame and writes on the parent document,
 * which is the property that matters: srcDoc inherits the embedding origin, so
 * a script inside it is not walled off from the page hosting it. Succeeding at
 * `window.parent.__executed` is the same access that would reach a same-origin
 * fetch carrying the admin's session cookie — it is just countable.
 *
 * Under sandbox="" the frame gets a unique opaque origin instead, so both the
 * script and the reach across are gone.
 */
const PAYLOAD = `<p>Hi Sarah, following up on the quote &mdash;</p>
<script>window.parent.__executed = (window.parent.__executed || 0) + 1;</script>`;

async function frameExecutes({ sandboxed }) {
  const page = await browser.newPage({ viewport: { width: 900, height: 300 } });
  await page.setContent(
    `<body style="margin:0;background:#fff">
       <iframe ${sandboxed ? 'sandbox=""' : ''} style="width:100%;height:120px;border:0"
               srcdoc="${PAYLOAD.replace(/"/g, '&quot;')}"></iframe>
     </body>`,
    { waitUntil: 'load' }
  );
  await page.waitForTimeout(400);
  const executed = await page.evaluate(() => Boolean(window.__executed));
  await page.close();
  return executed;
}

const unsandboxedRan = await frameExecutes({ sandboxed: false });
const sandboxedRan = await frameExecutes({ sandboxed: true });

// --- 2. Does jsonLdScript actually close the tag-breakout? ------------------

/*
 * `</script` is found by the HTML parser before any JSON parser sees a
 * character, so a string value containing it ends the tag early and the
 * remainder is parsed as markup. Checked by counting the elements the browser
 * actually built from each page.
 */

// lib/json-ld.ts is TypeScript; re-implement the one expression rather than
// add a build step, and assert below that it still matches the source.
const escapeJsonLd = (data) =>
  JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

const HOSTILE_POST = {
  '@type': 'BlogPosting',
  headline: 'One team, every surface',
  articleBody: 'A paragraph that happens to contain </script><img src=x onerror="window.__xss=1">',
};

async function breakout(serialise) {
  const page = await browser.newPage();
  await page.setContent(
    `<body><script type="application/ld+json">${serialise(HOSTILE_POST)}</script></body>`,
    { waitUntil: 'load' }
  );
  await page.waitForTimeout(300);
  const result = await page.evaluate(() => ({
    injected: document.querySelectorAll('img').length,
    // Did the JSON survive intact for a crawler?
    parses: (() => {
      const el = document.querySelector('script[type="application/ld+json"]');
      try {
        return JSON.parse(el.textContent).articleBody.includes('</script>');
      } catch {
        return false;
      }
    })(),
  }));
  await page.close();
  return result;
}

const rawStringify = await breakout(JSON.stringify);
const escaped = await breakout(escapeJsonLd);

// The re-implementation above must not drift from the module it stands in for.
const helperSource = read('lib/json-ld.ts');
const helperMatches = ['\\\\u003c', '\\\\u003e', '\\\\u0026', '\\\\u2028', '\\\\u2029'].every((e) =>
  helperSource.includes(e.replace(/\\\\/g, '\\'))
);

// --- 3. The sweep, actually run --------------------------------------------

let sweep = { line: 'could not run', ok: false, passed: 0 };
try {
  const { stdout } = await run('npx', ['vitest', 'run', 'tests/lib/inline-html-sinks.test.ts', '--reporter=json'], {
    cwd: root,
    maxBuffer: 1024 * 1024 * 32,
  });
  const json = JSON.parse(stdout.slice(stdout.indexOf('{')));
  sweep = {
    ok: (json.numFailedTests ?? 1) === 0,
    passed: json.numPassedTests ?? 0,
    line: `${json.numPassedTests} passing, ${json.numFailedTests} failing`,
  };
} catch (error) {
  sweep = { ok: false, passed: 0, line: String(error).slice(0, 90) };
}

// Every call site in the tree, counted from source.
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry)) files.push(full);
  }
})(path.join(root, 'app'));
['components', 'lib'].forEach((d) => {
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) files.push(full);
    }
  })(path.join(root, d));
});

const frames = files.flatMap((f) => {
  const text = stripComments(fs.readFileSync(f, 'utf8'));
  return [...text.matchAll(/<iframe\b[^>]*?srcDoc[^>]*?>/g)].map((m) => ({
    path: f.slice(root.length + 1),
    sandboxed: /\bsandbox\s*=/.test(m[0]),
  }));
});
const ldSites = files
  .map((f) => ({ path: f.slice(root.length + 1), text: stripComments(fs.readFileSync(f, 'utf8')) }))
  .filter((f) => f.text.includes('dangerouslySetInnerHTML'))
  .map((f) => ({
    path: f.path,
    safe: !/dangerouslySetInnerHTML\s*=\s*\{\{[^}]*JSON\.stringify/.test(f.text),
  }));

// The directive lives in a template literal, so it runs to the closing
// backtick — stopping at the first quote would clip it after "script-src" and
// hide the very token this panel exists to show.
const cspLine =
  /`(script-src[^`]*)`/.exec(stripComments(read('next.config.ts')))?.[1]
    ?.replace(/\$\{[^}]*\}/g, '')
    .trim() ?? '(not found)';

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
  .label { width:340px; color:#b9b4cd; }
  .value { font-family:ui-monospace, Menlo, monospace; font-size:11.5px; color:#7fd1ff; word-break:break-word; }
  .note { color:#6f6a8a; font-size:11.5px; margin-top:10px; font-style:italic; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .cols section { margin-bottom:0; }
  .csp { font-family:ui-monospace, Menlo, monospace; font-size:11.5px; color:#fbbf24;
         background:#191203; border:1px solid #3b2f10; border-radius:8px; padding:9px 12px; }
</style>

<h1>Two inline-HTML sinks &mdash; run, not asserted</h1>
<div class="sub">Both payloads were executed in <b>Chromium</b>. The rows below report what the
browser actually did; the call-site counts are swept from source.</div>

<section>
  <h2>Why this matters more here than in most apps</h2>
  <div class="csp">next.config.ts &nbsp;&rarr;&nbsp; ${esc(cspLine)}</div>
  <div class="note">
    'unsafe-inline' is deliberate and documented &mdash; Next streams its RSC payload through inline
    script tags, so a nonce would make every page dynamic. The argument that makes it acceptable is
    that the app has no HTML injection sink. These two controls are what keeps that sentence true
    rather than merely believed.
  </div>
</section>

<div class="cols">
  <section>
    <h2>1. iframe srcDoc &mdash; does sandbox stop it?</h2>
    <table>
      ${row(unsandboxedRan, 'without sandbox: script ran', unsandboxedRan ? 'YES — executes in the parent origin' : 'did not run')}
      ${row(!sandboxedRan, 'with sandbox="": script ran', sandboxedRan ? 'YES — sandbox ineffective' : 'no — blocked')}
    </table>
    <div class="note">
      srcDoc inherits the embedding origin: unsandboxed, email HTML runs <i>as the admin app</i>,
      with the session cookie reachable by same-origin fetch.
    </div>
  </section>

  <section>
    <h2>2. JSON-LD &mdash; does the helper stop the breakout?</h2>
    <table>
      ${row(rawStringify.injected > 0, 'JSON.stringify: tag broken out of', rawStringify.injected > 0 ? `YES — ${rawStringify.injected} <img> injected into the DOM` : 'no')}
      ${row(escaped.injected === 0, 'jsonLdScript: tag broken out of', escaped.injected === 0 ? 'no — 0 elements injected' : `YES — ${escaped.injected} injected`)}
      ${row(escaped.parses, 'escaped JSON still decodes identically', escaped.parses ? 'yes — crawlers see the same data' : 'no')}
      ${row(helperMatches, 'escapes match lib/json-ld.ts', helperMatches ? 'all five, verified against source' : 'DRIFTED')}
    </table>
    <div class="note">
      The parser finds <code>&lt;/script</code> before any JSON parser sees a character.
      Escaping to \\uXXXX is transparent to consumers.
    </div>
  </section>
</div>

<section>
  <h2>Every call site in the tree</h2>
  <table>
    ${frames.map((f) => row(f.sandboxed, `iframe srcDoc — ${f.path}`, f.sandboxed ? 'sandbox=""' : 'NO SANDBOX')).join('')}
    ${ldSites.map((f) => row(f.safe, `dangerouslySetInnerHTML — ${f.path}`, f.safe ? 'jsonLdScript()' : 'RAW JSON.stringify')).join('')}
    ${row(sweep.ok, 'tests/lib/inline-html-sinks.test.ts', sweep.line)}
  </table>
  <div class="note">
    Two of these were fixed in this change: BulkEmailComposer and EmailComposer had no sandbox
    (SendGuard already did, with a comment explaining why), and the blog post page was the one
    JSON-LD site of four still on raw JSON.stringify &mdash; the one whose input is prose that gets
    edited. The sweep is the point: it fails on the next call site that forgets, which is how both
    of these came to exist.
  </div>
</section>
`;

const sheet = await browser.newPage({ viewport: { width: 1240, height: 900 } });
await sheet.setContent(html, { waitUntil: 'load' });
await sheet.screenshot({ path: path.join(OUT, 'inline-html-sinks.png'), fullPage: true });
await browser.close();

console.log(`inline-html-sinks.png -> ${OUT}`);
console.log(`srcDoc unsandboxed executed: ${unsandboxedRan}   sandboxed executed: ${sandboxedRan}`);
console.log(`JSON.stringify injected ${rawStringify.injected} element(s); jsonLdScript injected ${escaped.injected}`);
console.log(`frames: ${frames.filter((f) => f.sandboxed).length}/${frames.length} sandboxed`);
console.log(`json-ld sites: ${ldSites.filter((f) => f.safe).length}/${ldSites.length} escaped`);
console.log(`sweep: ${sweep.line}`);
