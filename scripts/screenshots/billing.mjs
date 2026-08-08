/**
 * Look at the billing page, rather than reading assertions about it.
 *
 * tests/components/billing-ledger.test.tsx is what CI runs and what catches a
 * regression. This is the other half: a set of PNGs of the same screens, for
 * the times the question is "does this look right" rather than "is this
 * correct". Layout, contrast, whether the ageing colours read as urgent, and
 * whether a modal says enough before somebody presses the button — none of
 * those fail a test, and all of them are worth seeing.
 *
 * ## Running it
 *
 *   npm i -D playwright              # not a project dependency; see below
 *   npm run dev                      # a real dev server, no database needed
 *   node scripts/screenshots/billing.mjs
 *
 * It captures every screen twice — at 1500px and at an iPhone's 393px — and
 * exits non-zero if either width makes the page scroll sideways.
 *
 * Playwright is deliberately NOT in package.json. It is a large install that
 * every build and every other agent working in this repo would pay for, to
 * produce images nothing automated reads. Install it when you want to look.
 *
 * ## What is real and what is not
 *
 * The page is real: the same components, the same lib functions, the same CSS
 * that ships. Only the API responses are invented, because this runs against
 * no database. So it is honest about rendering and layout and says nothing
 * about whether a query is right — that is what the route tests are for.
 *
 * The auth cookie is minted here with the dev JWT_SECRET. proxy.ts redirects
 * an unauthenticated /admin/* to the login page, so without one every
 * screenshot would be of the login form.
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

const INVOICES = [
  { id: 'inv_1', number: 'BM-2026-0031', description: 'Second round of homepage design',
    amountCents: 120000, status: 'open', pdfUrl: 'https://blob.test/a.pdf', paymentUrl: 'https://pay.test/a',
    sentToEmail: 'dana@northgatedental.test', sendCount: 3, lastSentAt: day(4), refundedCents: 0,
    refundMethod: null, refundReason: null, voidReason: null, createdAt: day(31),
    lineItems: [{ label: 'Design round', priceCents: 90000 }, { label: 'Copywriting', priceCents: 30000 }],
    client: { id: 'c1', company: 'Northgate Dental', email: 'dana@northgatedental.test' },
    project: { id: 'p1', name: 'Northgate — Website' }, issuedBy: { name: 'Evan', email: 'evan@bothmade.studio' } },
  { id: 'inv_2', number: 'BM-2026-0030', description: 'Extra landing page + copywriting',
    amountCents: 265000, status: 'open', pdfUrl: 'https://blob.test/b.pdf', paymentUrl: 'https://pay.test/b',
    sentToEmail: 'ops@harbourline.test', sendCount: 1, lastSentAt: day(16), refundedCents: 0,
    refundMethod: null, refundReason: null, voidReason: null, createdAt: day(17),
    lineItems: [{ label: 'Landing page', priceCents: 195000 }, { label: 'Copywriting', priceCents: 70000 }],
    client: { id: 'c2', company: 'Harbourline Marine', email: 'ops@harbourline.test' },
    project: { id: 'p2', name: 'Harbourline — Web app' }, issuedBy: { name: 'Kiana', email: 'k@b.studio' } },
  /*
   * Part paid by transfer. An invoice used to be all-or-nothing, so this is
   * the state worth having in front of you: the row says what has arrived and
   * what is left, and the outstanding figure above is net of it.
   */
  { id: 'inv_4', number: 'BM-2026-0027', description: 'Brand photography day',
    amountCents: 180000, status: 'open', pdfUrl: 'https://blob.test/e.pdf', paymentUrl: 'https://pay.test/e',
    sentToEmail: 'hi@vellum.test', sendCount: 2, lastSentAt: day(11), refundedCents: 0,
    refundMethod: null, refundReason: null, voidReason: null, createdAt: day(22),
    lineItems: [{ label: 'Photography day', priceCents: 140000 }, { label: 'Retouching', priceCents: 40000 }],
    client: { id: 'c4', company: 'Vellum Studio', email: 'hi@vellum.test' },
    project: { id: 'p4', name: 'Vellum — Website' }, issuedBy: { name: 'Kiana', email: 'k@b.studio' },
    receivedCents: 90000 },
  { id: 'inv_3', number: 'BM-2026-0029', description: 'Retainer — March', amountCents: 90000,
    status: 'open', pdfUrl: null, paymentUrl: null, sentToEmail: null, sendCount: 0, lastSentAt: null,
    refundedCents: 0, refundMethod: null, refundReason: null, voidReason: null, createdAt: day(6),
    lineItems: [{ label: 'Retainer — March', priceCents: 90000 }],
    client: { id: 'c3', company: 'Peak Orthodontics', email: 'admin@peakortho.test' },
    project: { id: 'p3', name: 'Peak — Website' }, issuedBy: { name: 'Kiana', email: 'k@b.studio' } },
];

/*
 * A scheduled payment, which is a different animal to a one-off charge and
 * shares this list with them. It is settled through a Checkout Session on its
 * own row, so the ledger offers a link to the project rather than a Send that
 * would be refused.
 */
const INSTALMENT = {
  id: 'inv_5', number: 'BM-2026-0028', description: 'Payment 2 of 3 — Northgate Website',
  amountCents: 600000, status: 'open', pdfUrl: 'https://blob.test/d.pdf', paymentUrl: null,
  sentToEmail: 'dana@northgatedental.test', sendCount: 1, lastSentAt: day(9), refundedCents: 0,
  refundMethod: null, refundReason: null, voidReason: null, createdAt: day(10),
  lineItems: [{ label: 'Payment 2 of 3', priceCents: 600000 }],
  client: { id: 'c1', company: 'Northgate Dental', email: 'dana@northgatedental.test' },
  project: { id: 'p1', name: 'Northgate — Website' },
  issuedBy: { name: 'Kiana', email: 'k@b.studio' },
  isInstalment: true,
};

const SETTLED = [
  { ...INVOICES[0], id: 'inv_9', number: 'BM-2026-0024', status: 'paid',
    description: 'Additional photography retouching', amountCents: 48000, createdAt: day(48) },
  { ...INVOICES[1], id: 'inv_8', number: 'BM-2026-0023', status: 'void', amountCents: 75000,
    description: 'SEO audit add-on', voidReason: 'Raised against the wrong project', createdAt: day(53) },
];

// Outstanding is net of the $900 already in against BM-2026-0027.
const TOTALS = { outstandingCents: 565000, outstandingCount: 4, paidCents: 1284000, paidCount: 9,
  refundedCents: 19000, creditedCents: 60000, count: 13 };

const CUSTOMERS = [
  { id: 'c1', company: 'Northgate Dental Group', contactName: 'Dana Whitfield',
    email: 'dana@northgatedental.test',
    projects: [{ id: 'p1', name: 'Northgate — Website', status: 'build', totalPrice: 1450000 }] },
];

const token = jwt.sign(
  { userId: 'user_screenshot', email: 'kiana@bothmadestudio.com', role: 'owner', type: 'user' },
  SECRET,
  { algorithm: 'HS256', expiresIn: '1h' }
);

/*
 * Both widths, every time.
 *
 * This ran at 1500px only, and the two problems it therefore could not catch
 * were both real: on a phone the refund estimator landed BETWEEN the charge
 * form and the ledger as a full-screen-tall empty panel, pushing the thing
 * people open this page for below the fold of the fold; and every action
 * under an invoice wrapped into four ragged lines of eleven-pixel targets,
 * two of which take money. Neither is visible on a desk, and every screenshot
 * the studio actually looks at comes from a phone.
 *
 * The phone pass also asserts the page never grows wider than the viewport.
 * A horizontal scrollbar on a phone is the one layout failure a still image
 * hides completely — the screenshot is taken at the page's width, so an
 * overflowing page photographs perfectly.
 */
const DEVICES = [
  { key: 'desk', viewport: { width: 1500, height: 1400 }, scale: 2, mobile: false },
  { key: 'phone', viewport: { width: 393, height: 852 }, scale: 3, mobile: true },
];

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});

console.log(`\nBilling screenshots → ${OUT}\n`);

let overflowed = false;

for (const device of DEVICES) {
const context = await browser.newContext({
  viewport: device.viewport,
  deviceScaleFactor: device.scale,
  isMobile: device.mobile,
  hasTouch: device.mobile,
});
await context.addCookies([{ name: 'auth_token', value: token, domain: new URL(BASE).hostname, path: '/' }]);
const page = await context.newPage();

await page.route('**/api/**', (route) => {
  const url = route.request().url();
  const json = (body) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  if (url.includes('/api/auth/me')) {
    return json({ user: { id: 'u1', name: 'Kiana', role: 'owner', email: 'kiana@bothmadestudio.com' } });
  }
  if (url.includes('/api/admin/billing/customers')) {
    return json({ success: true, customers: url.includes('q=') ? CUSTOMERS : [] });
  }
  if (url.includes('/api/admin/billing/charges')) {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          clientDelivered: true,
          warnings: [],
          invoice: {
            number: 'BM-2026-0032',
            amountCents: 120000,
            paymentUrl: 'https://pay.test/new',
            pdfUrl: 'https://blob.test/new.pdf',
            sentToEmail: 'dana@northgatedental.test',
            client: { company: 'Northgate Dental' },
          },
        }),
      });
    }
    const open = [...INVOICES, INSTALMENT];
    const rows = url.includes('status=open') ? open : [...open, ...SETTLED];
    return json({ success: true, invoices: rows, totals: TOTALS, matching: rows.length, truncated: false });
  }
  return json({ success: true });
});

let n = 0;
async function shot(name, note) {
  const file = path.join(OUT, `${device.key}-${String(++n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ${path.relative(process.cwd(), file)}  — ${note}`);
}

await page.goto(`${BASE}/admin/billing`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await shot('ledger', 'totals, buckets, ageing lines, row actions');

await page.getByRole('button', { name: /^\d+ lines?$/ }).first().click();
await page.waitForTimeout(300);
await shot('breakdown', 'what the money was for, and who raised it');

await page.getByRole('button', { name: 'Send again' }).first().click();
await page.waitForTimeout(400);
await shot('send-again', 'knows it has already gone three times, and to whom');
await page.keyboard.press('Escape');

await page.getByRole('button', { name: 'Mark paid' }).first().click();
await page.waitForTimeout(400);
await page.getByPlaceholder('Bank transfer, ref ACME0312').fill('Bank transfer, ref NGD-0312');
await shot('mark-paid', 'money that arrived outside Stripe');
await page.keyboard.press('Escape');

await page.getByPlaceholder('Search by company, contact or email').fill('north');
await page.waitForTimeout(700);
await page.getByText('Northgate Dental Group').first().click();
await page.getByPlaceholder('e.g. Extra round of homepage design').fill('Third round of homepage design');
await page.getByPlaceholder('Description').first().fill('Design round');
await page.locator('input[placeholder="0.00"]').first().fill('250.999');
await page.waitForTimeout(300);
await shot('blocker', 'the Charge button says what it is waiting for');

await page.locator('input[placeholder="0.00"]').first().fill('1,200');
await page.waitForTimeout(300);
await shot('charge-ready', 'blocker clears and the button arms');

/*
 * Charging goes through the studio-wide send guard first — it shows the
 * email as the client will receive it and asks once. Captured on the way
 * past, because it is part of what raising a charge actually looks like.
 */
await page.getByRole('button', { name: /^Charge \$/ }).click();
await page.getByRole('dialog', { name: 'Confirm before sending' }).waitFor();
await page.waitForTimeout(500);
await shot('send-guard', 'the studio-wide confirmation, showing the email before it goes');

await page.getByRole('button', { name: 'Send it' }).click();
await page.waitForTimeout(800);
await shot('raised', 'the pay link and the invoice, right where it was raised');

await page.getByRole('button', { name: 'All' }).click();
await page.waitForTimeout(800);
await shot('all-states', 'paid, cancelled, a scheduled payment, and open together');

/*
 * The check a screenshot cannot make. A page wider than the viewport
 * photographs perfectly — Playwright captures at the page's own width — and
 * on a phone it is a sideways scrollbar over every screen.
 */
const width = await page.evaluate(() => ({
  page: document.documentElement.scrollWidth,
  viewport: window.innerWidth,
}));
if (width.page > width.viewport) {
  overflowed = true;
  console.log(
    `  !! ${device.key}: the page is ${width.page}px wide in a ${width.viewport}px viewport — something overflows.`
  );
}

await context.close();
}

await browser.close();
console.log(`\n${overflowed ? 'Done, with an overflow above.' : 'Done — nothing overflowed.'}\n`);
process.exit(overflowed ? 1 : 0);
