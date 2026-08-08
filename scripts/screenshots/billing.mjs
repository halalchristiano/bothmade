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
  { id: 'inv_3', number: 'BM-2026-0029', description: 'Retainer — March', amountCents: 90000,
    status: 'open', pdfUrl: null, paymentUrl: null, sentToEmail: null, sendCount: 0, lastSentAt: null,
    refundedCents: 0, refundMethod: null, refundReason: null, voidReason: null, createdAt: day(6),
    lineItems: [{ label: 'Retainer — March', priceCents: 90000 }],
    client: { id: 'c3', company: 'Peak Orthodontics', email: 'admin@peakortho.test' },
    project: { id: 'p3', name: 'Peak — Website' }, issuedBy: { name: 'Kiana', email: 'k@b.studio' } },
];

const SETTLED = [
  { ...INVOICES[0], id: 'inv_9', number: 'BM-2026-0024', status: 'paid',
    description: 'Additional photography retouching', amountCents: 48000, createdAt: day(48) },
  { ...INVOICES[1], id: 'inv_8', number: 'BM-2026-0023', status: 'void', amountCents: 75000,
    description: 'SEO audit add-on', voidReason: 'Raised against the wrong project', createdAt: day(53) },
];

const TOTALS = { outstandingCents: 475000, outstandingCount: 3, paidCents: 1284000, paidCount: 9,
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

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width: 1500, height: 1400 }, deviceScaleFactor: 2 });
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
    const rows = url.includes('status=open') ? INVOICES : [...INVOICES, ...SETTLED];
    return json({ success: true, invoices: rows, totals: TOTALS, matching: rows.length, truncated: false });
  }
  return json({ success: true });
});

let n = 0;
async function shot(name, note) {
  const file = path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ${path.relative(process.cwd(), file)}  — ${note}`);
}

console.log(`\nBilling screenshots → ${OUT}\n`);

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

await page.getByRole('button', { name: 'All' }).click();
await page.waitForTimeout(800);
await shot('all-states', 'paid, cancelled and open together');

await browser.close();
console.log(`\n${n} screenshots.\n`);
