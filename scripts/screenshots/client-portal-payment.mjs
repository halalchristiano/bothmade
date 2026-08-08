/**
 * The client's own dashboard, on the day they have part paid an instalment.
 *
 * tests/components/client-pay-button-amount.test.tsx is what CI runs. This is
 * the other half: the actual screen a paying client is looking at, because
 * the failure this covers is not a wrong number — it is a person deciding not
 * to press a button. A gradient bar demanding $12,000 from somebody who
 * transferred $6,000 that morning does not read as a rounding error to them;
 * it reads as "they have not seen my payment", and the next thing that
 * happens is an email rather than a payment.
 *
 * Three states are worth having in front of you, and they differ only in what
 * has arrived: nothing paid, half paid, and the schedule seen from the side
 * that shows what is owed.
 *
 * ## Running it
 *
 *   npm i -D playwright --no-save   # not a project dependency; see below
 *   npm run dev                     # a real dev server, no database needed
 *   node scripts/screenshots/client-portal-payment.mjs
 *
 * Captured at 1500px and at an iPhone's 393px — and the phone matters more
 * here than anywhere else in this repo, because a client reading "your
 * project is ready" on their phone is the whole point of the portal.
 *
 * Playwright is deliberately NOT in package.json, for the reason
 * scripts/screenshots/billing.mjs gives.
 *
 * ## What is real and what is not
 *
 * The page is real — same components, same lib functions, same CSS. Only the
 * API responses are invented, because this runs against no database.
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
const PROJECT_ID = 'proj_northgate';

const instalments = (receivedOnSecond = 0) => [
  { id: 'i_1', index: 1, label: 'Deposit', amountCents: 483_333, percent: 33, trigger: 'signing',
    status: 'paid', dueAt: day(40), paidAt: day(40), invoiceNumber: 'BM-2026-0021', receivedCents: 483_333 },
  { id: 'i_2', index: 2, label: 'Payment 2 of 3', amountCents: 483_333, percent: 33,
    trigger: 'design-approval', status: 'due', dueAt: day(-9), paidAt: null,
    invoiceNumber: 'BM-2026-0031', receivedCents: receivedOnSecond },
  { id: 'i_3', index: 3, label: 'Final payment', amountCents: 483_334, percent: 34,
    trigger: 'ready-for-launch', status: 'scheduled', dueAt: null, paidAt: null,
    invoiceNumber: null, receivedCents: 0 },
];

const project = (receivedOnSecond = 0) => ({
  id: PROJECT_ID,
  name: 'Northgate — Website',
  status: 'build',
  statusStage: 2,
  timeline: '8 weeks',
  baseService: 'website',
  addOns: ['seo'],
  totalPrice: 1_450_000,
  amountPaid: 483_333 + receivedOnSecond,
  balanceDue: 1_450_000 - 483_333 - receivedOnSecond,
  payments: [],
  invoices: [],
  instalments: instalments(receivedOnSecond),
  estimatedCompletionDate: null,
  liveUrl: null,
  createdAt: day(48),
  updatedAt: day(2),
  messages: [],
  updates: [
    { id: 'u_1', title: 'Design approved', description: 'Thanks — we are into the build.',
      statusStage: 'build', createdAt: day(6) },
  ],
  deliverables: [],
  contractUrl: null,
  client: { company: 'Northgate Dental', name: 'Dana Whitfield', email: 'dana@northgatedental.test' },
});

const token = jwt.sign(
  { clientId: 'c_1', email: 'dana@northgatedental.test', type: 'client' },
  SECRET,
  { algorithm: 'HS256', expiresIn: '1h' }
);

const DEVICES = [
  { key: 'desk', viewport: { width: 1500, height: 1400 }, scale: 2, mobile: false },
  { key: 'phone', viewport: { width: 393, height: 852 }, scale: 3, mobile: true },
];

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
console.log(`\nClient portal payment screenshots → ${OUT}\n`);

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

  let received = 0;

  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/onboarding')) return json({ success: true, questions: [] });
    if (url.includes('/messages')) return json({ success: true, messages: [] });
    if (url.includes(`/api/projects/${PROJECT_ID}`)) return json({ success: true, project: project(received) });
    return json({ success: true });
  });

  let n = 0;
  async function shot(name, note) {
    const file = path.join(OUT, `client-${device.key}-${String(++n).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const tall = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(`  ${path.relative(process.cwd(), file)}  ${String(tall).padStart(5)}px  — ${note}`);
  }

  async function checkWidth(where) {
    const w = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    if (w.page > w.viewport) {
      overflowed = true;
      console.log(`  !! ${device.key} ${where}: page is ${w.page}px in a ${w.viewport}px viewport.`);
    }
  }

  await page.goto(`${BASE}/client/${PROJECT_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot('nothing-paid', 'Payment 2 untouched — the button offers the whole thing');
  await checkWidth('nothing paid');

  /*
   * The state this exists for. $4,833.33 billed, half of it transferred that
   * morning: the schedule row and the button have to agree, and the button
   * has to ask for the smaller number.
   */
  received = 241_666;
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot('part-paid', 'half transferred — the button asks for the rest, not the face value');
  await checkWidth('part paid');

  await context.close();
}

await browser.close();
console.log(`\n${overflowed ? 'Done, with an overflow above.' : 'Done — nothing overflowed.'}\n`);
process.exit(overflowed ? 1 : 0);
