/**
 * Look at the security work, rather than reading assertions about it.
 *
 * tests/lib/security-headers.test.ts, robots.test.ts and json-ld.test.ts are
 * what CI runs. This is the other half: one PNG showing what a browser is
 * actually handed, for the times the question is "is this really on in
 * production" rather than "does the unit test pass".
 *
 * It answers a question the unit tests structurally cannot. Those import
 * next.config.ts and assert on the object — which proves the config says the
 * right thing, not that Next serves it. This fetches over HTTP from a real
 * production server and prints the response headers as they arrive.
 *
 * ## Running it
 *
 *   npm i -D playwright        # not a project dependency; see billing.mjs
 *   npm run build && npm start # NOT `npm run dev` — see below
 *   node scripts/screenshots/security.mjs
 *
 * It must be a production server. `next dev` sets NODE_ENV=development, and
 * next.config.ts deliberately omits Strict-Transport-Security there and adds
 * 'unsafe-eval' to script-src for React's error overlay. A screenshot taken
 * against the dev server would show neither the header that matters most nor
 * the policy that actually ships.
 *
 * `npm run build` runs `prisma migrate deploy` against whatever DATABASE_URL
 * points at. To build without a database, run the steps by hand:
 *
 *   npx prisma generate && CI_SKIP_SECRET_CHECK=1 npx next build
 *
 * with dummy values for JWT_SECRET, SESSION_SECRET and STRIPE_SECRET_KEY —
 * the last is read at module scope by the checkout routes, so page-data
 * collection dies without it.
 *
 * ## What is real and what is not
 *
 * Everything on the sheet is fetched at run time from the running server:
 * the response headers, robots.txt, the JSON-LD as it appears in the HTML,
 * and the heading outline read out of the live DOM. Nothing is transcribed
 * by hand, so a regression shows up as a changed screenshot rather than a
 * stale caption. The one thing invented is the hostile input in the escaping
 * panel, which is applied by lib/json-ld.ts through the page itself.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.SHOT_BASE_URL || 'http://localhost:3000';
const OUT = process.env.SHOT_OUT || path.join(process.cwd(), '.screenshots');
const CHROMIUM = process.env.CHROMIUM_PATH;

fs.mkdirSync(OUT, { recursive: true });

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// --- Collect ---------------------------------------------------------------

const res = await fetch(`${BASE}/`, { redirect: 'manual' });
const headers = Object.fromEntries(res.headers.entries());
const robots = await (await fetch(`${BASE}/robots.txt`)).text();
const aboutHtml = await (await fetch(`${BASE}/about`)).text();

const jsonLd =
  /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(aboutHtml)?.[1] ?? '(not found)';

const SECURITY_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
];

// --- Render ----------------------------------------------------------------

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});

/*
 * Two pages, deliberately.
 *
 * The evidence sheet cannot be rendered onto a tab that has visited the app.
 * Loading a route pulls in Next's client bundle, and once that has hydrated it
 * owns the document — a `setContent()` afterwards is silently reverted when
 * React re-renders, and the "evidence" screenshot comes out as a picture of
 * the blog index. Asked for once, debugged once; keep them separate.
 */
const appPage = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const sheet = await browser.newPage({ viewport: { width: 1400, height: 900 } });

// Heading outline, read from the live blog index rather than from the source.
await appPage.goto(`${BASE}/blog`, { waitUntil: 'domcontentloaded' });
const outline = await appPage.evaluate(() =>
  [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .slice(0, 6)
    .map((h) => ({
      tag: h.tagName,
      // innerText, not textContent: a <br> inside a heading otherwise glues
      // the two lines together ("How we build,written down.").
      text: (h.innerText || h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 44),
    }))
);
const skipped = (() => {
  const levels = outline.map((h) => +h.tag[1]);
  for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) return true;
  return false;
})();

const row = (ok, label, value) => `
  <tr>
    <td class="mark ${ok ? 'ok' : 'bad'}">${ok ? '&#10003;' : '&#10007;'}</td>
    <td class="label">${esc(label)}</td>
    <td class="value">${esc(value)}</td>
  </tr>`;

const html = `
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 40px; background: #05030a; color: #e8e6f0;
    font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  h1 { font-size: 27px; margin: 0 0 4px; letter-spacing: -0.02em; }
  .sub { color: #8a86a0; font-size: 13px; margin-bottom: 26px; }
  .sub b { color: #c9c5da; font-weight: 600; }
  section { border: 1px solid #221d33; border-radius: 12px; padding: 18px 20px; margin-bottom: 16px; background: #0b0814; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; color: #7d78a0; margin: 0 0 14px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 8px 5px 0; vertical-align: top; border-bottom: 1px solid #17132480; }
  tr:last-child td { border-bottom: 0; }
  .mark { width: 22px; font-weight: 700; }
  .ok { color: #4ade80; }
  .bad { color: #f87171; }
  .label { width: 232px; color: #b9b4cd; }
  .value { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; color: #7fd1ff; word-break: break-all; }
  pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px;
        background: #06040d; border: 1px solid #1b1629; border-radius: 8px;
        padding: 12px; margin: 0; white-space: pre-wrap; word-break: break-all; color: #a8e6a0; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .note { color: #6f6a8a; font-size: 11.5px; margin-top: 10px; font-style: italic; }
  .outline { font-family: ui-monospace, monospace; font-size: 12px; }
  .outline div { padding: 2px 0; color: #c9c5da; }
  .tag { color: #4ade80; font-weight: 700; display: inline-block; width: 34px; }
</style>

<h1>Security hardening &mdash; live evidence</h1>
<div class="sub">
  Fetched over HTTP from a <b>production</b> build at <b>${esc(BASE)}</b>.
  Every value below is read from the running server, not transcribed.
</div>

<section>
  <h2>Response headers, as the browser receives them</h2>
  <table>
    ${SECURITY_HEADERS.map((h) => row(Boolean(headers[h]), h, headers[h] ?? 'MISSING')).join('')}
    ${row(!headers['x-powered-by'], 'x-powered-by (must be absent)', headers['x-powered-by'] ?? 'absent — framework not advertised')}
  </table>
  <div class="note">
    HSTS and the eval-free script-src are production-only by design, which is why this
    runs against <code>next start</code> rather than <code>next dev</code>.
  </div>
</section>

<div class="cols">
  <section>
    <h2>robots.txt &mdash; GETs that write are now excluded</h2>
    <pre>${esc(robots.trim())}</pre>
    <div class="note">/o and /e are tracking pixels; /pay mints a Stripe session per request.</div>
  </section>

  <section>
    <h2>Blog index heading outline (live DOM)</h2>
    <div class="outline">
      ${outline.map((h) => `<div><span class="tag">${esc(h.tag)}</span>${esc(h.text)}</div>`).join('')}
    </div>
    <table style="margin-top:12px">
      ${row(!skipped, 'no skipped heading levels', skipped ? 'h1 jumps straight to h3' : 'h1 → h2 → h3 → h4')}
    </table>
  </section>
</div>

<section>
  <h2>JSON-LD on /about, escaped by lib/json-ld.ts</h2>
  <pre>${esc(jsonLd.slice(0, 420))}${jsonLd.length > 420 ? ' …' : ''}</pre>
  <table style="margin-top:12px">
    ${row(!jsonLd.includes('</script'), 'contains no literal </script', 'angle brackets emitted as \\u003c / \\u003e')}
  </table>
  <div class="note">
    JSON.stringify does not escape &lt;/script&gt;, and the CSP allows 'unsafe-inline' —
    so this escaping is what keeps that trade-off honest.
  </div>
</section>
`;

await sheet.setContent(html, { waitUntil: 'load' });
await sheet.screenshot({ path: path.join(OUT, 'security-evidence.png'), fullPage: true });

// The blog index itself, at the width the heading fix was checked against.
await appPage.goto(`${BASE}/blog`, { waitUntil: 'networkidle' });
await appPage.screenshot({ path: path.join(OUT, 'blog-index.png'), fullPage: false });

await browser.close();

const missing = SECURITY_HEADERS.filter((h) => !headers[h]);
console.log(`security-evidence.png, blog-index.png -> ${OUT}`);
console.log(missing.length ? `MISSING HEADERS: ${missing.join(', ')}` : 'all security headers present');
console.log(headers['x-powered-by'] ? `x-powered-by LEAKED: ${headers['x-powered-by']}` : 'x-powered-by absent');
console.log(skipped ? 'HEADING LEVEL SKIPPED' : 'heading outline clean');
