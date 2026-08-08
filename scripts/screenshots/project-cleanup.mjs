/**
 * Look at clearing test projects out, rather than reading assertions about it.
 *
 * tests/lib/project-bulk-delete-route.test.ts and
 * tests/components/bulk-delete-projects.test.tsx are what CI runs and what
 * catch a regression. This is the other half: PNGs of the same screens, for
 * the times the question is "does this look right" rather than "is this
 * correct". Whether a destructive panel says enough before somebody presses
 * the button, whether a ticked row reads as ticked, and whether the handoff
 * queue those test projects were cluttering survives a phone — none of those
 * fail a test, and all of them are worth seeing.
 *
 * ## Running it
 *
 *   npm i -D playwright --no-save   # not a project dependency; see below
 *   npm run dev                     # a real dev server, no database needed
 *   node scripts/screenshots/project-cleanup.mjs
 *
 * It captures every screen twice — at 1500px and at an iPhone's 393px — and
 * exits non-zero if either width makes the page scroll sideways.
 *
 * Playwright is deliberately NOT in package.json, for the reason
 * scripts/screenshots/billing.mjs gives: it is a large install that every
 * build and every other agent working in this repo would pay for, to produce
 * images nothing automated reads. Install it when you want to look.
 *
 * ## What is real and what is not
 *
 * The pages are real: the same components, the same lib functions, the same
 * CSS that ships. Only the API responses are invented, because this runs
 * against no database — including the bulk delete's own response, so the
 * "left alone" panel can be photographed without a project that has actually
 * taken money. So it is honest about rendering and layout and says nothing
 * about whether a query is right; that is what the route tests are for.
 */

import { chromium } from 'playwright';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.SHOT_BASE_URL || 'http://localhost:3000';
const OUT = process.env.SHOT_OUT || path.join(process.cwd(), '.screenshots');
const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  console.error('JWT_SECRET is not set. Use the same value the dev server is running with.');
  process.exit(1);
}

const CHROMIUM = process.env.CHROMIUM_PATH; // set when Playwright's own download was skipped

fs.mkdirSync(OUT, { recursive: true });

const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

/**
 * The state that motivated all of this: five test projects nobody deleted
 * because deleting them one at a time was six page loads, and one real
 * engagement sitting in the middle of them with money against it.
 */
const project = (id, company, name, extra = {}) => ({
  id,
  name,
  status: 'discovery',
  statusStage: 0,
  timeline: '4 weeks',
  createdAt: day(3),
  updatedAt: day(3),
  totalPrice: 0,
  client: { company, email: `hello@${id}.test` },
  messages: [],
  payments: [],
  instalments: [],
  ...extra,
});

const PROJECTS = [
  project('p1', 'Everything 4 Kiana', 'Everything 4 Kiana — macOS App'),
  project('p2', 'Launch Check Ltd', 'Launch Check Ltd — Website'),
  project('p3', 'testing_company', 'testing_company — Web App'),
  project('p4', 'Finale test', 'Finale test — Website'),
  project('p5', 'A1 cleaning', 'A1 cleaning — Website', { createdAt: day(1), updatedAt: day(1) }),
  // The real one. Three instalments, first paid — so the row carries a
  // balance badge and the delete will refuse it.
  project('p6', 'Northgate Dental', 'Northgate — Website', {
    status: 'build',
    statusStage: 2,
    timeline: '8 weeks',
    createdAt: day(48),
    updatedAt: day(2),
    totalPrice: 1_450_000,
    payments: [{ amount: 483_333, type: 'deposit' }],
    instalments: [
      { index: 0, label: 'Deposit', amountCents: 483_333, status: 'paid', dueAt: day(40), trigger: 'signature' },
      { index: 1, label: 'Payment 2 of 3', amountCents: 483_333, status: 'due', dueAt: day(4), trigger: 'design' },
      { index: 2, label: 'Final payment', amountCents: 483_334, status: 'scheduled', dueAt: null, trigger: 'launch' },
    ],
  }),
];

/** What the route returns when one of the selected projects holds money. */
const BULK_RESULT = {
  success: true,
  count: 5,
  deleted: PROJECTS.slice(0, 5).map((p) => ({ id: p.id, company: p.client.company, name: p.name })),
  blocked: [
    {
      id: 'p6',
      company: 'Northgate Dental',
      name: 'Northgate — Website',
      reason: '1 payment and 2 invoices',
    },
  ],
};

/** The same six, as the dashboard's handoff queue sees them. */
const HANDOFFS = [
  { id: 'p1', name: 'Everything 4 Kiana — macOS App', company: 'Everything 4 Kiana', contactName: 'Kiana',
    createdAt: day(3), onboardingTotal: 0, onboardingAnswered: 0, handoffAcknowledgedAt: null, daysWaiting: 3,
    shareToken: 'tok1' },
  { id: 'p2', name: 'Launch Check Ltd — Website', company: 'Launch Check Ltd', contactName: 'Sam',
    createdAt: day(3), onboardingTotal: 1, onboardingAnswered: 0, handoffAcknowledgedAt: null, daysWaiting: 3,
    shareToken: 'tok2' },
  { id: 'p3', name: 'testing_company — Web App', company: 'testing_company', contactName: null,
    createdAt: day(3), onboardingTotal: 0, onboardingAnswered: 0, handoffAcknowledgedAt: null, daysWaiting: 3,
    shareToken: 'tok3' },
  { id: 'p4', name: 'Finale test — Website', company: 'Finale test', contactName: null,
    createdAt: day(3), onboardingTotal: 0, onboardingAnswered: 0, handoffAcknowledgedAt: null, daysWaiting: 3,
    shareToken: 'tok4' },
  { id: 'p5', name: 'A1 cleaning — Website', company: 'A1 cleaning', contactName: 'Ray',
    createdAt: day(1), onboardingTotal: 0, onboardingAnswered: 0, handoffAcknowledgedAt: null, daysWaiting: 1,
    shareToken: 'tok5' },
  { id: 'p6', name: 'Posh LTD — iOS App', company: 'Posh LTD', contactName: 'Ana',
    createdAt: day(6), onboardingTotal: 0, onboardingAnswered: 0, handoffAcknowledgedAt: day(1), daysWaiting: 6,
    shareToken: 'tok6' },
];

const OPS_STATS = {
  range: 'month',
  periodLabel: 'this month',
  activeProjectCount: 6,
  revenueThisMonth: 483_333,
  newClientsThisWeek: 6,
  awaitingSignatureCount: 1,
  revenueHistory: [
    { label: 'Mar', total: 0 }, { label: 'Apr', total: 240_000 }, { label: 'May', total: 0 },
    { label: 'Jun', total: 900_000 }, { label: 'Jul', total: 120_000 }, { label: 'Aug', total: 483_333 },
  ],
  newHandoffs: HANDOFFS,
  atRiskProjects: [],
  waitingOnClient: [],
  overdueBalances: [],
  unbilledInstalments: [],
  projectsAwaitingReply: [],
  unreadDesignFeedback: [],
  pendingMockups: [],
  activityFeed: [],
};

/**
 * The card that sits above the handoff queue. Empty in every lane — this
 * studio's whole to-do list is the six unpicked-up handoffs below it — but
 * present, which is the part that matters: the card reads three lanes off
 * this payload unguarded, and the dashboard used to go down with it when one
 * was missing. See tests/components/today-payload-guard.test.tsx.
 */
const TODAY = {
  success: true,
  sell: {
    overdueFollowUps: [], overdueFollowUpCount: 0, unsignedProposalCount: 0, approvedMockupCount: 0,
    openedMockupCount: 0, repliedCount: 0, neverContactedCount: 0, openedMockups: [],
    approvedMockups: [], unsignedProposals: [], callsToday: 0, team: [],
  },
  money: {
    dueInstalments: [], uninvoiced: [], uninvoicedCount: 0, uninvoicedTotalCents: 0,
    unpaidInvoices: [], unpaidInvoiceCount: 0, dueInstalmentCount: 0, dueInstalmentTotalCents: 0,
    collectedThisMonthCents: 483_333,
  },
  deliver: {
    activeProjects: 6, stalledProjects: [], mockupRequests: 0, designsOwed: [], designsOwedCount: 0,
    mockupsBuiltNotSent: [], mockupsBuiltNotSentCount: 0, stalledProjectCount: 0,
    unreadDesignFeedback: [], unreadDesignFeedbackCount: 0,
  },
};

const SALES_STATS = {
  range: 'month',
  periodLabel: 'this month',
  pipelineValue: 0,
  leadsByStatus: {},
  followUpsToday: [],
  hotLeads: [],
  recentLeads: [],
  contractsOut: [],
  conversionRate: 0,
  wonThisPeriod: 0,
  activityFeed: [],
};

const token = jwt.sign(
  { userId: 'user_screenshot', email: 'kiana@bothmadestudio.com', role: 'owner', type: 'user' },
  SECRET,
  { algorithm: 'HS256', expiresIn: '1h' }
);

/*
 * Both widths, every time — the reason billing.mjs gives. A page wider than
 * the viewport photographs perfectly, because the screenshot is taken at the
 * page's own width; on a phone it is a sideways scrollbar over every screen.
 */
const DEVICES = [
  { key: 'desk', viewport: { width: 1500, height: 1400 }, scale: 2, mobile: false },
  { key: 'phone', viewport: { width: 393, height: 852 }, scale: 3, mobile: true },
];

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});

console.log(`\nProject cleanup screenshots → ${OUT}\n`);

let overflowed = false;

for (const device of DEVICES) {
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.scale,
    isMobile: device.mobile,
    hasTouch: device.mobile,
  });
  await context.addCookies([
    { name: 'auth_token', value: token, domain: new URL(BASE).hostname, path: '/' },
  ]);
  const page = await context.newPage();

  let breakProjects = false;

  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/api/auth/me')) {
      return json({ user: { id: 'u1', name: 'Kiana', role: 'owner', email: 'kiana@bothmadestudio.com' } });
    }
    if (url.includes('/api/admin/projects/bulk-delete')) return json(BULK_RESULT);
    if (url.includes('/api/admin/projects')) {
      // The last screen deliberately breaks this, to photograph the boundary.
      return json(breakProjects ? { success: true, projects: [{ id: 'x', name: 'x' }] } : { success: true, projects: PROJECTS });
    }
    if (url.includes('/api/admin/today')) return json(TODAY);
    if (url.includes('/api/admin/ops-stats')) return json({ success: true, stats: OPS_STATS });
    if (url.includes('/api/admin/sales-stats')) return json({ success: true, stats: SALES_STATS });
    if (url.includes('/api/admin/users')) return json({ success: true, users: [] });
    return json({ success: true });
  });

  let n = 0;
  async function shot(name, note) {
    const file = path.join(OUT, `${device.key}-${String(++n).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  ${path.relative(process.cwd(), file)}  — ${note}`);
  }

  /** The page must never be wider than the viewport. Checked per screen. */
  async function checkWidth(where) {
    const width = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    if (width.page > width.viewport) {
      overflowed = true;
      console.log(
        `  !! ${device.key} ${where}: the page is ${width.page}px wide in a ${width.viewport}px viewport.`
      );
    }
  }

  // ── The handoff queue the test projects were cluttering ──────────────────
  await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot('handoffs', 'six handoffs, one already picked up — the mess this starts from');
  await checkWidth('dashboard');

  // ── The projects list, before anything is selected ───────────────────────
  await page.goto(`${BASE}/admin/projects`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot('list', 'rows are links, no checkboxes — the mode is off by default');
  await checkWidth('projects list');

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.waitForTimeout(300);
  await shot('select-mode', 'checkboxes appear, and a way to take every row shown');

  // Everything except the real project, which is deliberately left unticked
  // so the panel shows what a normal tidy-up actually looks like.
  for (const company of ['Everything 4 Kiana', 'Launch Check Ltd', 'testing_company', 'Finale test', 'A1 cleaning']) {
    await page.getByRole('checkbox', { name: new RegExp(`^Select ${company} `) }).check();
  }
  await page.waitForTimeout(300);
  await shot('selected', 'five ticked, and the bar that appears with them');
  await checkWidth('selection bar');

  await page.getByRole('button', { name: 'Delete selected' }).click();
  await page.waitForTimeout(400);
  await shot('confirm', 'what will go, named — and the phrase that has to be typed');

  await page.getByPlaceholder('delete 5 projects').fill('delete 4 projects');
  await page.waitForTimeout(200);
  await shot('wrong-phrase', 'the phrase for a different count leaves the button disarmed');

  /*
   * The point of putting the count in the phrase: tick a sixth row with
   * "delete 5 projects" already typed and the confirmation must not carry
   * over to a selection it was never written for.
   */
  await page.getByPlaceholder('delete 5 projects').fill('delete 5 projects');
  await page.waitForTimeout(200);
  await shot('armed', 'phrase matches, button lit');

  await page.getByRole('checkbox', { name: /^Select Northgate Dental / }).check();
  await page.waitForTimeout(300);
  await shot('disarmed', 'a sixth row ticked — the field cleared and the button went back out');

  await page.getByPlaceholder('delete 6 projects').fill('delete 6 projects');
  await page.getByRole('button', { name: /Delete them permanently/ }).click();
  await page.waitForTimeout(900);
  await shot('left-alone', 'the paid project survived, and says which record held it');
  await checkWidth('after delete');

  /*
   * The boundary, photographed on purpose.
   *
   * A row with no `client` is enough to throw during render, which is what
   * the real crash looked like: some response came back a shape the page did
   * not expect. Before app/admin/error.tsx this landed on the marketing error
   * page — public nav, "Back home", a pitch to start a project — shown to
   * somebody who was already signed in and halfway through a job.
   */
  breakProjects = true;
  await page.goto(`${BASE}/admin/projects`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot('crashed', 'one screen down, still inside the admin, nav intact');
  await checkWidth('error boundary');

  await context.close();
}

await browser.close();
console.log(`\n${overflowed ? 'Done, with an overflow above.' : 'Done — nothing overflowed.'}\n`);
process.exit(overflowed ? 1 : 0);
