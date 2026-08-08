/**
 * Look at sending a scheduled payment, rather than reading assertions about it.
 *
 * tests/lib/instalment-send-route.test.ts is what CI runs and what catches a
 * regression. This is the other half: PNGs of the panel that bills clients on
 * a schedule, for the times the question is "does this look right" rather than
 * "is this correct".
 *
 * The three states worth having in front of you are the ones that are only a
 * sentence apart in the code and completely different to be on the receiving
 * end of: the send that worked, the send whose email failed, and the payment
 * whose gate has not been reached yet. The middle one is the reason the copy
 * fix exists — ops is told the email did not go, and the client used to be
 * told on their own dashboard that it was in their inbox.
 *
 * ## Running it
 *
 *   npm i -D playwright --no-save   # not a project dependency; see below
 *   npm run dev                     # a real dev server, no database needed
 *   node scripts/screenshots/instalment-send.mjs
 *
 * Captured at 1500px and at an iPhone's 393px, exiting non-zero if either
 * width makes the page scroll sideways.
 *
 * Playwright is deliberately NOT in package.json, for the reason
 * scripts/screenshots/billing.mjs gives.
 *
 * ## What is real and what is not
 *
 * The page is real — same components, same lib functions, same CSS. Only the
 * API responses are invented, because this runs against no database. So it is
 * honest about rendering and layout and says nothing about whether a query is
 * right; that is what the route tests are for.
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

const CHROMIUM = process.env.CHROMIUM_PATH;

fs.mkdirSync(OUT, { recursive: true });

const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const PROJECT_ID = 'p_northgate';

/** Deposit paid, Payment 2 waiting, Payment 3 behind its launch gate. */
const INSTALMENTS = [
  { id: 'i_0', index: 0, label: 'Deposit', amountCents: 483_333, percent: 33, trigger: 'signing',
    status: 'paid', dueAt: day(40), invoicedAt: day(41), paidAt: day(40), invoiceNumber: 'BM-2026-0021',
    stripeSessionId: null, paymentUrl: null, emailSentAt: day(41), payUrl: `${BASE}/pay/i_0` },
  { id: 'i_1', index: 1, label: 'Payment 2 of 3', amountCents: 483_333, percent: 33,
    trigger: 'design-approval', status: 'scheduled', dueAt: null, invoicedAt: null, paidAt: null,
    invoiceNumber: null, stripeSessionId: null, paymentUrl: null, emailSentAt: null,
    payUrl: `${BASE}/pay/i_1` },
  { id: 'i_2', index: 2, label: 'Final payment', amountCents: 483_334, percent: 34,
    trigger: 'ready-for-launch', status: 'scheduled', dueAt: null, invoicedAt: null, paidAt: null,
    invoiceNumber: null, stripeSessionId: null, paymentUrl: null, emailSentAt: null,
    payUrl: `${BASE}/pay/i_2` },
];

const PROJECT = {
  id: PROJECT_ID,
  name: 'Northgate — Website',
  shareToken: 'tok_northgate',
  status: 'build',
  statusStage: 2,
  baseService: 'website',
  addOns: ['seo'],
  customItems: [],
  timeline: '8 weeks',
  basePrice: 1_350_000,
  totalPrice: 1_450_000,
  estimatedCompletionDate: null,
  liveUrl: null,
  amountPaid: 483_333,
  balanceDue: 966_667,
  payments: [{ id: 'pay_1', amount: 483_333, type: 'deposit', createdAt: day(40) }],
  invoices: [],
  /*
   * Files and a signed agreement, because an empty right rail is not what
   * this page looks like in use — and a layout judged against empty mock
   * data gets rebuilt to fix a void that real data fills.
   */
  deliverables: [
    { id: 'd_1', name: 'Homepage — final.fig', url: 'https://files.test/home.fig', size: '4.2 MB', createdAt: day(6) },
    { id: 'd_2', name: 'Brand assets.zip', url: 'https://files.test/brand.zip', size: '18 MB', createdAt: day(9) },
    { id: 'd_3', name: 'Copy deck v3.docx', url: 'https://files.test/copy.docx', size: '240 KB', createdAt: day(11) },
  ],
  createdAt: day(48),
  client: { id: 'c_1', email: 'dana@northgatedental.test', company: 'Northgate Dental', contactName: 'Dana' },
  messages: [],
  updates: [],
  sourcedLead: null,
  handoffAcknowledgedAt: day(45),
  designReview: { presentedAt: day(12), reviewEndsAt: day(-2), approvedAt: day(6), deemed: false, round: 1 },
  contractUrl: 'https://files.test/northgate-agreement.pdf',
};

/*
 * The two outcomes of pressing Send that differ only in whether the email
 * went. `emailSent: false` is the one the panel has to be loud about, because
 * nothing else will tell the studio the client never got it.
 */
const SENT_OK = {
  success: true,
  instalment: { ...INSTALMENTS[1], status: 'due', invoiceNumber: 'BM-2026-0031', paymentUrl: 'https://pay.test/cs_1' },
  emailSent: true,
  emailReason: null,
};
const SEND_EMAIL_FAILED = {
  ...SENT_OK,
  emailSent: false,
  emailReason: 'domain not verified',
};

/** What the route returns when the gate for this payment has not happened. */
const GATE_NOT_REACHED = {
  error:
    'Final payment falls due when the project is ready to launch, and that has not happened yet — this project is still at Build.',
  gateNotReached: true,
};

const token = jwt.sign(
  { userId: 'user_screenshot', email: 'kiana@bothmadestudio.com', role: 'owner', type: 'user' },
  SECRET,
  { algorithm: 'HS256', expiresIn: '1h' }
);

const DEVICES = [
  { key: 'desk', viewport: { width: 1500, height: 1400 }, scale: 2, mobile: false },
  { key: 'phone', viewport: { width: 393, height: 852 }, scale: 3, mobile: true },
];

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});

console.log(`\nInstalment send screenshots → ${OUT}\n`);

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

  // Flipped between screens to photograph each outcome of the same press.
  let sendResult = SENT_OK;

  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/api/auth/me')) {
      return json({ user: { id: 'u1', name: 'Kiana', role: 'owner', email: 'kiana@bothmadestudio.com' } });
    }
    if (url.includes('/instalments')) {
      if (method === 'POST') {
        if (sendResult === GATE_NOT_REACHED) return json(GATE_NOT_REACHED, 409);
        return json(sendResult);
      }
      return json({ success: true, instalments: INSTALMENTS });
    }
    if (url.includes(`/api/projects/${PROJECT_ID}`)) return json({ success: true, project: PROJECT });
    if (url.includes('/notes')) return json({ success: true, notes: [] });
    if (url.includes('/onboarding')) return json({ success: true, questions: [] });
    if (url.includes('/change-orders')) return json({ success: true, changeOrders: [] });
    /*
     * The care panel reads `offers` and `defaults` off this. Getting the shape
     * right here matters: a payload missing either used to throw during render
     * and take the whole project page with it — see
     * tests/components/recurring-panel-payload.test.tsx.
     */
    if (url.includes('/recurring')) {
      return json({
        success: true,
        alreadyInScope: [],
        catalogue: [],
        defaults: { addOns: [], discountMonths: 3, freeMonths: 0, maxPercent: 30 },
        offers: [],
      });
    }
    if (url.includes('/deployment')) return json({ success: true, deployment: null });
    if (url.includes('/design-review')) return json({ success: true, review: null });
    return json({ success: true });
  });

  let n = 0;
  async function shot(name, note) {
    const file = path.join(OUT, `${device.key}-${String(++n).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    // Height is the thing to watch on this page: it is a long scroll, and a
    // layout change that looks tidier while adding a thousand pixels of it
    // has not helped anybody.
    const tall = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(`  ${path.relative(process.cwd(), file)}  ${String(tall).padStart(5)}px  — ${note}`);
  }

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

  const panel = () => page.locator('text=Payment schedule').first();

  /*
   * Every outbound email in the admin goes through the studio-wide send
   * guard, which asks once before anything leaves. It is part of what
   * pressing Send actually looks like, so it is walked rather than skipped.
   */
  async function pressSend() {
    await page.getByRole('button', { name: /^Send Payment 2 of 3$|^Send$/ }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
    if (await dialog.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Send it' }).click();
      // Wait it out rather than racing it — a screenshot taken while the
      // guard is still on screen photographs the guard, not the result.
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => null);
    }
  }

  await page.goto(`${BASE}/admin/projects/${PROJECT_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await panel().scrollIntoViewIfNeeded();
  await shot('schedule', 'deposit paid, Payment 2 next, Final behind its gate');
  await checkWidth('project page');

  await page.getByRole('button', { name: /^Send Payment 2 of 3$|^Send$/ }).first().click();
  await page.waitForTimeout(500);
  await shot('send-guard', 'the studio-wide confirmation that fronts every outbound email');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();  // not the ✕, which is 'Close'
  await page.waitForTimeout(300);

  // The ordinary send.
  await pressSend();
  await page.waitForTimeout(900);
  await panel().scrollIntoViewIfNeeded();
  await shot('sent', 'the send that worked — invoice number and inbox, truthfully');

  /*
   * The same press, with the email failing. Ops is told plainly; the client's
   * own update no longer says it is in an inbox it never reached.
   */
  sendResult = SEND_EMAIL_FAILED;
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await pressSend();
  await page.waitForTimeout(900);
  await panel().scrollIntoViewIfNeeded();
  await shot('email-failed', 'link is live, email is not — and it says which');
  await checkWidth('failed-send notice');

  // The gate, refused and named in the client's own words.
  sendResult = GATE_NOT_REACHED;
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await pressSend();
  await page.waitForTimeout(900);
  await panel().scrollIntoViewIfNeeded();
  await shot('gate', 'a payment whose milestone has not happened, asked about rather than sent');
  await checkWidth('gate prompt');

  await context.close();
}

await browser.close();
console.log(`\n${overflowed ? 'Done, with an overflow above.' : 'Done — nothing overflowed.'}\n`);
process.exit(overflowed ? 1 : 0);
