/**
 * Walk every screen and report the defects that are invisible by construction.
 *
 * This is the tool, rather than a picture of one result. Four of the last few
 * accessibility fixes in this repo were found by running some version of it
 * from a scratch directory, and every one of them had passed typecheck, passed
 * the unit tests, and looked correct in the source:
 *
 *   - /admin/projects/new had seven visible <label>s attached to nothing.
 *     Announced as "edit text, blank", with no placeholder either.
 *   - The blog index numbered its posts h1 -> h3, implying a section that did
 *     not exist.
 *   - The /start form had the same detached-label bug, on the page an enquiry
 *     converts on.
 *   - PhoneField was named after its own example number, because an
 *     `aria-label` was quietly beating the <label> above it.
 *
 * None of those is visible in a browser — a label with `htmlFor` renders
 * identically to one without — and none is reachable by reading, because the
 * markup reads correctly in every case. The only way to see them is to ask the
 * document what it actually exposes.
 *
 * ## Running it
 *
 *   npm i -D playwright        # not a project dependency; see billing.mjs
 *   npx prisma generate && npx next build && npx next start
 *   JWT_SECRET=<the value the server is running with> \
 *     node scripts/screenshots/a11y-sweep.mjs
 *
 * Exits non-zero when it finds something, so it can be wired into CI later
 * without changing anything here. It is not wired in today: it needs a running
 * production server and a browser, which is a heavier job than the current
 * workflow does, and that is a decision to take deliberately rather than by
 * side effect.
 *
 * Two cookies are minted, staff and client, because proxy.ts redirects both
 * /admin/* and /client/* to their login pages. Without them this would sweep
 * two login forms and report everything as fine.
 *
 * ## What it checks, and why each one earns its place
 *
 *   unnamed control    a form field with no accessible name. The single most
 *                      common defect here, found on three separate forms.
 *   nameless control   a link or button that is an icon and nothing else.
 *   duplicate id       breaks every label[for] and aria-controls pointing at
 *                      it, silently, including ones that were correct.
 *   heading skip       h1 -> h3 tells a screen reader user there is a section
 *                      they missed.
 *   h1 count           zero means no page title in the outline; more than one
 *                      means no single answer to "what is this page".
 *   horizontal scroll  measured by actually trying to scroll, not by comparing
 *                      scrollWidth — a transform can inflate scrollWidth
 *                      without the page ever being draggable, and an earlier
 *                      version of this reported a bug that did not exist.
 */

import { chromium } from 'playwright';
import jwt from 'jsonwebtoken';

const BASE = process.env.SHOT_BASE_URL || 'http://localhost:3000';
const CHROMIUM = process.env.CHROMIUM_PATH;
const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  console.error('JWT_SECRET is not set. Use the same value the server is running with.');
  process.exit(1);
}

const TOKEN = 'a'.repeat(64);

/** Everything reachable without a database record behind it. */
const ROUTES = {
  public: [
    '/', '/start', '/about', '/work', '/web', '/ios', '/visionpro',
    '/blog', '/terms', '/privacy',
  ],
  // Capability links. They render their "expired" state without a database,
  // which is a real screen somebody sees and worth sweeping.
  token: [
    `/f/${TOKEN}`, `/m/${TOKEN}`, `/change/${TOKEN}`, `/stop/${TOKEN}`,
    `/care/${TOKEN}`, `/b/${TOKEN}`, `/sign/${TOKEN}`, `/status/${TOKEN}`,
  ],
  staff: [
    '/admin/dashboard', '/admin/sales', '/admin/billing', '/admin/projects',
    '/admin/clients', '/admin/design', '/admin/deployment', '/admin/priorities',
    '/admin/analytics', '/admin/team-chat', '/admin/team', '/admin/settings',
    '/admin/mockup-queue', '/admin/call', '/admin/projects/new',
    '/admin/no-such-page',
  ],
  client: ['/client/login', '/client/projects'],
};

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

const staffCookie = jwt.sign(
  { userId: 'sweep', email: 'evan@bothmade.studio', role: 'owner', type: 'user' },
  SECRET,
  { expiresIn: '1h' }
);
const clientCookie = jwt.sign(
  { clientId: 'sweep', email: 'dana@northgate.test', type: 'client' },
  SECRET,
  { expiresIn: '1h' }
);

/** Runs in the page. Returns raw facts; the judging happens outside. */
function audit() {
  const out = { evaluated: true };

  // Try to scroll rather than comparing scrollWidth: a decorative transform
  // inflates scrollWidth on a page that can never actually be dragged.
  window.scrollTo(600, 0);
  out.hScroll = window.scrollX;
  window.scrollTo(0, 0);

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };

  out.unnamed = [...document.querySelectorAll('input,select,textarea')]
    .filter((el) => el.type !== 'hidden' && visible(el))
    .filter((el) => {
      const id = el.getAttribute('id');
      return !(
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        el.getAttribute('title') ||
        el.closest('label') ||
        (id && document.querySelector(`label[for="${CSS.escape(id)}"]`))
      );
    })
    .map((el) => `${el.tagName.toLowerCase()}[${el.type || ''}] ph="${(el.placeholder || '').slice(0, 24)}"`)
    .slice(0, 6);

  out.nameless = [...document.querySelectorAll('a,button')]
    .filter(visible)
    .filter((el) => {
      const name = (el.getAttribute('aria-label') || el.textContent || '').trim();
      return !name && !el.querySelector('img[alt]:not([alt=""])');
    })
    .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(/\s+/)[0]}`)
    .slice(0, 6);

  const ids = {};
  for (const el of document.querySelectorAll('[id]')) ids[el.id] = (ids[el.id] || 0) + 1;
  out.duplicateIds = Object.entries(ids)
    .filter(([, n]) => n > 1)
    .map(([id, n]) => `${id} x${n}`)
    .slice(0, 6);

  const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => +h.tagName[1]);
  out.h1 = levels.filter((n) => n === 1).length;
  out.headingSkip = null;
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] - levels[i - 1] > 1) {
      out.headingSkip = `h${levels[i - 1]} -> h${levels[i]}`;
      break;
    }
  }

  return out;
}

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
const findings = [];
let visited = 0;
let evaluated = 0;

for (const viewport of VIEWPORTS) {
  for (const [group, routes] of Object.entries(ROUTES)) {
    const ctx = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    if (group === 'staff') {
      await ctx.addCookies([{ name: 'auth_token', value: staffCookie, url: BASE }]);
    } else if (group === 'client') {
      await ctx.addCookies([{ name: 'auth_token', value: clientCookie, url: BASE }]);
    }

    for (const route of routes) {
      const page = await ctx.newPage();
      visited += 1;
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(500);

      const a = await page.evaluate(audit).catch((e) => ({ error: String(e).slice(0, 90) }));
      if (a.evaluated) evaluated += 1;

      const issues = [];
      // A page that never evaluated is not a clean page. Reported loudly,
      // because a sweep that silently skips everything reports zero findings
      // and looks like success.
      if (!a.evaluated) issues.push(`did not evaluate: ${a.error ?? 'unknown'}`);
      if (a.hScroll > 0) issues.push(`page scrolls sideways by ${a.hScroll}px`);
      if (a.unnamed?.length) issues.push(`${a.unnamed.length} control(s) with no accessible name: ${a.unnamed.join(', ')}`);
      if (a.nameless?.length) issues.push(`${a.nameless.length} link/button with no name: ${a.nameless.join(', ')}`);
      if (a.duplicateIds?.length) issues.push(`duplicate id(s): ${a.duplicateIds.join(', ')}`);
      if (a.h1 !== undefined && a.h1 !== 1) issues.push(`${a.h1} <h1> on the page`);
      if (a.headingSkip) issues.push(`heading level skipped: ${a.headingSkip}`);

      if (issues.length) findings.push({ viewport: viewport.name, route, issues });
      await page.close();
    }
    await ctx.close();
  }
}

await browser.close();

console.log(`swept ${visited} page loads, ${evaluated} evaluated`);

if (visited !== evaluated) {
  console.error(`\n${visited - evaluated} page(s) did not evaluate — treat this run as inconclusive.`);
}

if (findings.length === 0) {
  console.log('no findings');
} else {
  console.log(`\n${findings.length} page(s) with findings:\n`);
  for (const f of findings) {
    console.log(`  [${f.viewport}] ${f.route}`);
    for (const issue of f.issues) console.log(`      ! ${issue}`);
  }
}

// Non-zero on a finding, or on a run that could not see the pages.
process.exit(findings.length > 0 || visited !== evaluated ? 1 : 0);
