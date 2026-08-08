import { chromium } from 'playwright';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The client's own dashboard, on the invoice states that involve their money.
 *
 * There is a companion to this — scripts/screenshots/billing.mjs — for the
 * studio's side of the same invoices. This is the other half, and it is the
 * half where being wrong costs the client rather than the studio: every
 * change to how an invoice reads has to be checked against the screen the
 * person paying is looking at, and until now that was a throwaway script that
 * did not survive the session it was written in.
 *
 * Two defects have already been found by rendering this page rather than by
 * reasoning about it — a space lost to a JSX line break, and a row promising
 * two different things about the same money — and neither is visible in a
 * test that asserts on strings.
 *
 * It also checks three things a picture cannot, and fails the run if any of
 * them is wrong:
 *
 *   - a part-paid invoice must not offer a pay button. The link is a
 *     fixed-amount Payment Link for the WHOLE invoice; there is no partial
 *     version of one, so offering it to somebody who has sent half is
 *     offering to take the other half plus the half they sent.
 *   - a refunded invoice must not offer one either, and must not promise a
 *     payment link is coming. A refund leaves an open invoice open, so this
 *     is a client being invited to pay in full for work we just refunded.
 *   - an invoice that took MORE than it asked for says so. "Paid" is true
 *     there and is not the whole truth, and the client is the one out of
 *     pocket.
 *   - the page must never grow wider than the viewport. A horizontal
 *     scrollbar is the one layout failure a still image hides completely,
 *     because the screenshot is taken at the page's own width.
 *
 * Run it against a dev server:
 *   JWT_SECRET=<the dev server's> node scripts/screenshots/client-invoices.mjs
 */

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

/*
 * Four invoices, chosen so that every rule about pay links is on one screen
 * at once and can be compared against its neighbours rather than trusted on
 * its own.
 */
const INVOICES = [
  /*
   * Part paid by transfer. `receivedCents` is what the API sends; the pay
   * link is withheld there rather than here, which is why it is null.
   */
  {
    id: 'inv_1', number: 'BM-2026-0027', description: 'Brand photography day',
    lineItems: [{ label: 'Photography day', priceCents: 140000 }, { label: 'Retouching', priceCents: 40000 }],
    amountCents: 180000, status: 'open', pdfUrl: 'https://blob.test/a.pdf', paymentUrl: null,
    createdAt: day(22), paidAt: null, refundedCents: 0, refundMethod: null, refundedAt: null,
    refundReason: null, voidReason: null, receivedCents: 90000,
  },
  /*
   * Refunded, and still open — a refund moves `refundedCents`, not `status`.
   * It also writes a negative row into the same ledger the payments live in,
   * so `receivedCents` nets back to zero: the same number as "nothing ever
   * arrived", and the opposite situation.
   */
  {
    id: 'inv_2', number: 'BM-2026-0026', description: 'Product photography — cancelled shoot',
    lineItems: [{ label: 'Shoot day', priceCents: 110000 }, { label: 'Location', priceCents: 30000 }],
    amountCents: 140000, status: 'open', pdfUrl: 'https://blob.test/b.pdf',
    paymentUrl: 'https://pay.test/b',
    createdAt: day(29), paidAt: null, refundedCents: 60000, refundMethod: 'manual',
    // Deliberately NOT null, unlike what the route now sends. The page has to
    // suppress this on its own — it is the button that actually charges
    // somebody, and it should not be one payload away from charging a client
    // for work we have just refunded them for.
    refundedAt: day(3), refundReason: 'Shoot cancelled — the deposit went back by transfer',
    voidReason: null, receivedCents: 0,
  },
  /* The control: nothing has arrived, so the link is real and offered. */
  {
    id: 'inv_3', number: 'BM-2026-0029', description: 'Extra landing page',
    lineItems: [{ label: 'Landing page', priceCents: 90000 }],
    amountCents: 90000, status: 'open', pdfUrl: 'https://blob.test/c.pdf',
    paymentUrl: 'https://pay.test/c', createdAt: day(6), paidAt: null, refundedCents: 0,
    refundMethod: null, refundedAt: null, refundReason: null, voidReason: null, receivedCents: 0,
  },
  /*
   * More money than the invoice was for. A transfer arrived, then the
   * original pay link — fixed-amount, for the whole invoice — took it again.
   * The studio's ledger says "$900 overpaid"; the client's copy said "Paid",
   * which is true and leaves the person actually out of pocket as the only
   * one not told.
   */
  {
    id: 'inv_6', number: 'BM-2026-0022', description: 'Brand photography day — paid twice',
    lineItems: [{ label: 'Photography day', priceCents: 180000 }],
    amountCents: 180000, status: 'paid', pdfUrl: 'https://blob.test/f.pdf', paymentUrl: null,
    createdAt: day(41), paidAt: day(38), refundedCents: 0, refundMethod: null, refundedAt: null,
    refundReason: null, voidReason: null, receivedCents: 270000,
  },
  /* Settled, and cancelled — both carry their reason, which is written for
     the client rather than for our books. */
  {
    id: 'inv_4', number: 'BM-2026-0024', description: 'Additional retouching',
    lineItems: [{ label: 'Retouching', priceCents: 48000 }],
    amountCents: 48000, status: 'paid', pdfUrl: 'https://blob.test/d.pdf', paymentUrl: null,
    createdAt: day(48), paidAt: day(44), refundedCents: 0, refundMethod: null, refundedAt: null,
    refundReason: null, voidReason: null, receivedCents: 48000,
  },
  {
    id: 'inv_5', number: 'BM-2026-0023', description: 'SEO audit add-on',
    lineItems: [{ label: 'SEO audit', priceCents: 75000 }],
    amountCents: 75000, status: 'void', pdfUrl: 'https://blob.test/e.pdf', paymentUrl: null,
    createdAt: day(53), paidAt: null, refundedCents: 0, refundMethod: null, refundedAt: null,
    refundReason: null, voidReason: 'Raised against the wrong project', receivedCents: 0,
  },
];

const PROJECT = {
  id: 'p1',
  name: 'Vellum — Website',
  description: 'Brand site and booking flow',
  status: 'build',
  statusStage: 2,
  baseService: 'website',
  addOns: [],
  customItems: [],
  timeline: '8 weeks',
  basePrice: 1450000,
  totalPrice: 1450000,
  estimatedCompletionDate: null,
  liveUrl: null,
  amountPaid: 580000,
  balanceDue: 870000,
  payments: [],
  messages: [],
  updates: [],
  deliverables: [],
  onboardingQuestions: [],
  designFeedback: [],
  designDirection: null,
  createdAt: day(60),
  client: { id: 'c1', email: 'hi@vellum.test', company: 'Vellum Studio', contactName: 'Rae' },
  instalments: [],
  invoices: INVOICES,
  designReview: { presentedAt: null, reviewEndsAt: null, approvedAt: null, deemed: false },
  contractUrl: null,
};

const token = jwt.sign({ clientId: 'c1', email: 'hi@vellum.test', type: 'client' }, SECRET, {
  algorithm: 'HS256',
  expiresIn: '1h',
});

/*
 * A phone first, because that is where a client reads this. The desk pass is
 * for the studio looking at what the client sees.
 */
const DEVICES = [
  { key: 'phone', viewport: { width: 393, height: 852 }, scale: 3, mobile: true },
  { key: 'desk', viewport: { width: 1400, height: 1200 }, scale: 2, mobile: false },
];

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});

console.log(`\nClient invoice screenshots → ${OUT}\n`);

const problems = [];

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

  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/onboarding')) return json({ success: true, questions: [] });
    if (url.includes('/api/projects/')) return json({ success: true, project: PROJECT });
    if (url.includes('/api/auth/me')) return json({ client: { id: 'c1', company: 'Vellum Studio' } });
    return json({ success: true });
  });

  await page.goto(`${BASE}/client/p1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const invoices = page.locator('h2:has-text("Invoices")');
  if (await invoices.count()) await invoices.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const file = path.join(OUT, `${device.key}-client-invoices.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ${path.relative(process.cwd(), file)}  — every invoice state on the client's own screen`);

  /*
   * The row-level checks. Scoped to one invoice each rather than to the page,
   * because "the page has a Pay button on it" is true and correct here — the
   * control invoice has one, and it should.
   */
  /*
   * The invoice card, not the smallest div the number happens to sit in.
   *
   * A bare `div` filter with .last() lands on the header block — the two
   * lines holding the description and the number — which contains neither the
   * pay button nor the line about what has arrived. Every assertion below
   * then passes or fails on text that was never in scope. Scoped to the card's
   * own class instead, which is the element the row is drawn as.
   */
  const row = (number) => page.locator('div.rounded-xl').filter({ hasText: number }).last();

  const partPaid = await row('BM-2026-0027').innerText();
  if (/Pay \$/.test(partPaid)) {
    problems.push(`${device.key}: the part-paid invoice is offering a pay button for the whole amount.`);
  }
  // Whole dollars render without the cents — see formatCentsExact. Asserted
  // as it actually reads, including the em dash between the two figures,
  // because the space around it has been lost to a JSX line break before.
  if (!/\$900 received — \$900 left/.test(partPaid)) {
    problems.push(`${device.key}: the part-paid invoice does not say what came in and what is left.`);
  }

  const refunded = await row('BM-2026-0026').innerText();
  if (/Pay \$/.test(refunded)) {
    problems.push(`${device.key}: the refunded invoice is offering to charge them again.`);
  }
  if (/payment link for this shortly/.test(refunded)) {
    problems.push(`${device.key}: the refunded invoice is promising a payment link is coming.`);
  }

  const overpaid = await row('BM-2026-0022').innerText();
  if (!/\$900 more than this invoice was for/.test(overpaid)) {
    problems.push(`${device.key}: the overpaid invoice does not tell the client their money is here.`);
  }
  if (/Pay \$/.test(overpaid)) {
    problems.push(`${device.key}: the overpaid invoice is offering to take more.`);
  }

  /* And the control, so a rule that hides everything reads as a failure too. */
  const untouched = await row('BM-2026-0029').innerText();
  if (!/Pay \$900\b/.test(untouched)) {
    problems.push(`${device.key}: the untouched invoice has lost its pay button.`);
  }

  const width = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  if (width.page > width.viewport) {
    problems.push(
      `${device.key}: the page is ${width.page}px wide in a ${width.viewport}px viewport — something overflows.`
    );
  }

  await context.close();
}

await browser.close();

if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`  !! ${p}`);
  console.log('');
  process.exit(1);
}
console.log('\nDone — every rule about pay links held.\n');
