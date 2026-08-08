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
    receivedCents: 90000, grossReceivedCents: 90000,
    // Money that arrived by transfer. There is no charge behind it, so the
    // refund box must not offer to reverse one.
    hasCardPayment: false },
  /*
   * Refunded, and still open.
   *
   * A refund moves `refundedCents`, not `status`, and writes a negative row
   * into the same ledger the payments live in — so the netted figure is back
   * to zero, which is also the number that means "nothing ever arrived". This
   * is the row where those two situations have to look different.
   */
  { id: 'inv_6', number: 'BM-2026-0026', description: 'Product photography — cancelled shoot',
    amountCents: 140000, status: 'open', pdfUrl: 'https://blob.test/g.pdf', paymentUrl: null,
    sentToEmail: 'studio@fernbank.test', sendCount: 2, lastSentAt: day(26), refundedCents: 60000,
    refundMethod: 'manual', refundReason: 'Shoot cancelled — the deposit went back by transfer',
    voidReason: null, createdAt: day(29),
    lineItems: [{ label: 'Shoot day', priceCents: 110000 }, { label: 'Location', priceCents: 30000 }],
    client: { id: 'c5', company: 'Fernbank Optical', email: 'studio@fernbank.test' },
    project: { id: 'p5', name: 'Fernbank — Website' }, issuedBy: { name: 'Kiana', email: 'k@b.studio' },
    receivedCents: 0, grossReceivedCents: 60000, hasCardPayment: false },
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
    description: 'Additional photography retouching', amountCents: 48000, createdAt: day(48),
    // Paid through Stripe, so a card refund is possible here and is the one
    // the box should open on.
    receivedCents: 48000, grossReceivedCents: 48000, hasCardPayment: true },
  /*
   * More money than it asked for. A transfer arrived, then the client's
   * original pay link — fixed-amount, for the WHOLE invoice — took it again
   * on top. Both are real payments and the invoice really is paid; it is also
   * holding $900 of somebody else's money.
   */
  { ...INVOICES[2], id: 'inv_7', number: 'BM-2026-0022', status: 'paid',
    description: 'Brand photography day — paid twice', amountCents: 180000, createdAt: day(41),
    receivedCents: 270000, grossReceivedCents: 270000, hasCardPayment: true },
  { ...INVOICES[1], id: 'inv_8', number: 'BM-2026-0023', status: 'void', amountCents: 75000,
    description: 'SEO audit add-on', voidReason: 'Raised against the wrong project', createdAt: day(53) },
];

/*
 * What the second page holds — the rows a list capped at a hundred used to
 * put out of reach entirely. The oldest one is the whole reason the chase
 * bucket changed direction.
 */
const OLDER = [
  { ...INVOICES[0], id: 'inv_o1', number: 'BM-2025-0184', description: 'Christmas campaign landing page',
    amountCents: 240000, createdAt: day(213), sendCount: 6, lastSentAt: day(30),
    client: { id: 'c6', company: 'Harlow & Fen', email: 'ops@harlowfen.test' },
    project: { id: 'p6', name: 'Harlow & Fen — Website' } },
  { ...INVOICES[0], id: 'inv_o2', number: 'BM-2025-0191', description: 'Additional product photography',
    amountCents: 96000, createdAt: day(168), sendCount: 4, lastSentAt: day(52),
    client: { id: 'c7', company: 'Brightwater Clinic', email: 'admin@brightwater.test' },
    project: { id: 'p7', name: 'Brightwater — Website' } },
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
  acceptDownloads: true,
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
  if (url.includes('/api/admin/billing/charges/export')) {
    // What the server would build, so the browser half of the download —
    // the filename, and that pressing it does not navigate away — is real.
    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="bothmade-invoices-${
          url.includes('status=open') ? 'open' : url.includes('status=paid') ? 'paid' : 'all'
        }-2026-08-08.csv"`,
      },
      body:
        'Invoice,Type,Raised,Client,Project,For,Amount\r\n' +
        'BM-2026-0031,One-off charge,2026-07-08,Northgate Dental,Northgate — Website,Second round of homepage design,1200.00\r\n' +
        'BM-2026-0028,Scheduled payment,2026-07-29,Northgate Dental,Northgate — Website,Payment 2 of 3,6000.00',
    });
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
    /*
     * Paging, emulated, because the two things worth looking at only exist
     * on a list too long to fit: the "Show N more" control, and the sentence
     * beside it, which has to say "longest outstanding" on the chase bucket
     * and "most recent" everywhere else.
     */
    const chase = url.includes('status=open');
    const open = [...INVOICES, INSTALMENT];
    const rows = chase ? open : [...open, ...SETTLED];
    if (url.includes('before=')) {
      return json({
        success: true,
        invoices: OLDER,
        totals: TOTALS,
        matching: 140,
        truncated: false,
        nextCursor: null,
        oldestFirst: chase,
      });
    }
    return json({
      success: true,
      invoices: rows,
      totals: TOTALS,
      matching: 140,
      truncated: true,
      nextCursor: '2026-03-16T10:00:00.000Z_inv_1',
      // The chase bucket is a to-do list and runs oldest first; the
      // histories are records and run newest first.
      oldestFirst: chase,
    });
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
 * The end of the list, which used to be the end of what this screen could
 * reach at all. The sentence beside the control has to match the order the
 * list is actually in — on the chase bucket, longest outstanding first.
 */
/*
 * The file an accountant asks for, downloaded for real rather than asserted
 * about. The stub answers the export route with the CSV the server would
 * build, so what is checked here is the browser's half: that the link is a
 * download, that it is named for what is in it, and that pressing it does not
 * navigate away from the page.
 */
await page.getByRole('link', { name: /Download .* as CSV/ }).scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await shot('export', 'the whole matching set as a file, not the hundred on screen');

const [file] = await Promise.all([
  page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
  page.getByRole('link', { name: /Download .* as CSV/ }).click(),
]);
if (file) {
  const name = file.suggestedFilename();
  if (!/^bothmade-invoices-(open|paid|cancelled|all)-\d{4}-\d{2}-\d{2}\.csv$/.test(name)) {
    overflowed = true;
    console.log(`  !! ${device.key}: the download is called "${name}", which says nothing about what is in it.`);
  } else {
    console.log(`  ${device.key}: downloaded ${name}`);
  }
} else {
  overflowed = true;
  console.log(`  !! ${device.key}: pressing Download did not download anything.`);
}

await page.getByRole('button', { name: 'Needs chasing' }).click();
await page.waitForTimeout(700);
await page.getByRole('button', { name: /^Show \d+ more$/ }).scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await shot('more-to-come', 'the list says which end it is showing, and offers the rest');

await page.getByRole('button', { name: /^Show \d+ more$/ }).click();
await page.waitForTimeout(900);
await shot('older-page', 'the invoice open 213 days, previously unreachable from this screen');

/*
 * The two refund boxes, which differ in the two ways that matter.
 *
 * On an invoice paid by card, the card option is live and selected. On one
 * part paid by transfer there is no charge to reverse, so it is disabled and
 * says why — and the ceiling is what came in rather than the face value,
 * which the box now explains rather than simply refusing anything above it.
 */
/*
 * Opened by asking the dialog which invoice it is, rather than by counting
 * rows. A nth-Refund-button selector picked the wrong invoice on the first
 * run here and captured the same modal twice, which a screenshot cannot tell
 * you — both images look like a refund box.
 */
async function openRefund(number) {
  const buttons = page.getByRole('button', { name: 'Refund' });
  for (let i = 0; i < (await buttons.count()); i++) {
    await buttons.nth(i).click();
    const title = page.getByRole('heading', { name: `Refund invoice ${number}` });
    if (await title.isVisible().catch(() => false)) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  throw new Error(`No Refund button opened ${number} — the row is not offering one.`);
}

/*
 * The row that replaces Send on a part-paid invoice. Sending it again would
 * rebuild the original demand — the invoice total in the PDF and the email,
 * and a pay link for it — so the next move is a charge for what is left.
 */
await page.getByRole('button', { name: 'Needs chasing' }).click();
await page.waitForTimeout(700);
await page.getByRole('button', { name: /^Charge the .* left$/ }).first().click();
await page.waitForTimeout(700);
await shot('charge-balance', 'the part-paid row fills the form with the difference');
await page.getByRole('button', { name: 'Choose a different customer' }).click();
await page.waitForTimeout(300);

await page.getByRole('button', { name: 'All' }).click();
await page.waitForTimeout(800);

await openRefund('BM-2026-0024');
await page.waitForTimeout(400);
await shot('refund-card', 'paid by card — the card option is live and selected');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

await openRefund('BM-2026-0027');
await page.waitForTimeout(400);
await shot('refund-transfer', 'part paid by transfer — no card to reverse, capped at what came in');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

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
