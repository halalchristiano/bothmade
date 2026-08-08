import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The public status page — the one screen a client checks without being asked.
 *
 * It needs no login, it is the link that got emailed, and a client watches it
 * for weeks. Every other screenshot script in this folder covers a page
 * somebody signs in to reach; none covered this one, which is the page most
 * likely to be looked at by somebody who is deciding whether we are worth
 * recommending.
 *
 * Three of its behaviours cannot be checked by asserting on strings, which is
 * why they get a browser and a ruler rather than a unit test:
 *
 *   - the progress rail must stop AT the stop it has reached, not past it.
 *     The stops are centred in five equal columns, so stop `i` sits at
 *     `(i + 0.5) / 5` — the obvious `(i + 1) / 5` overshoots by half a column
 *     every time and, on the last stage, draws a line running out past the
 *     final dot and off the end of the card. Both formulas produce a
 *     plausible-looking bar; only one of them lines up, and only geometry
 *     can tell them apart. This measures the filled line's right edge against
 *     the centre of the current dot.
 *
 *   - "waiting on you" has to sit ABOVE the stage card. It is the one state
 *     where nothing moves until the client acts, and where the work has got
 *     to matters less than the fact it has stopped. Ordering is a layout
 *     fact, so it is asserted as one: the band's top edge against the card's.
 *
 *   - the page must never grow wider than the viewport. A horizontal
 *     scrollbar is the single layout failure a still image cannot show,
 *     because the screenshot is taken at the page's own width.
 *
 * And two rules about what may appear at all:
 *
 *   - the amber band must be gone once the design is approved. A page that
 *     nags about a decision already made is worse than one that never
 *     mentioned it.
 *   - nothing financial, ever. This link gets forwarded — to a client's
 *     colleague, their investor, whoever they like — so the deal is that it
 *     carries progress and nothing else. The payload below deliberately
 *     includes prices and a balance the route does not currently send, so
 *     that a future route growing a field cannot quietly put the studio's
 *     numbers on a page anyone with the link can read.
 *
 * The API is stubbed rather than seeded: every state this page has lives in
 * one field of one response, and four projects in a database would prove
 * nothing extra while making the script need one. The token still rides in
 * the URL, because the page refuses to fetch without it.
 *
 * Imports playwright-core, not playwright — it is the one in package.json, so
 * this runs after a plain `npm ci`. Its sibling scripts import `playwright`
 * and need a separate install first.
 *
 *   npm run dev -- -p 3100
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *     node scripts/screenshots/client-status.mjs
 */

const BASE = process.env.BOTHMADE_BASE ?? 'http://localhost:3100';
const OUT = process.env.BOTHMADE_SHOT_DIR ?? '/tmp/client-status-shots';
const CHROMIUM = process.env.CHROMIUM_PATH; // set when Playwright's own download was skipped

fs.mkdirSync(OUT, { recursive: true });

const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

const UPDATES = [
  {
    id: 'u1',
    title: 'Homepage build started',
    description: 'The approved design is going into code, section by section, starting at the top.',
    createdAt: day(2),
  },
  {
    id: 'u2',
    title: 'Design approved',
    description: 'Thanks for the notes — the header spacing and the softer green are both in.',
    createdAt: day(9),
  },
];

/*
 * Money the route does not send, carried anyway. If the page ever renders
 * these it will be because somebody widened the route and nobody looked at
 * this screen; the assertion below is what looks.
 */
const NEVER_SHOW = { totalPrice: 1450000, balanceDue: 870000, amountPaid: 580000 };

const STATES = [
  {
    key: 'awaiting-review',
    caption: 'design presented, still unapproved — the page says whose turn it is',
    project: {
      name: 'Vellum — Website',
      company: 'Vellum Studio',
      statusStage: 1,
      estimatedCompletionDate: new Date(Date.now() + 34 * 86_400_000).toISOString(),
      liveUrl: null,
      awaitingYourReview: {
        presentedAt: day(4),
        reviewEndsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      },
      updates: UPDATES.slice(1),
      ...NEVER_SHOW,
    },
  },
  {
    key: 'in-progress',
    caption: 'mid-build, design approved — no band, and a target date',
    project: {
      name: 'Vellum — Website',
      company: 'Vellum Studio',
      statusStage: 2,
      estimatedCompletionDate: new Date(Date.now() + 21 * 86_400_000).toISOString(),
      liveUrl: null,
      awaitingYourReview: null,
      updates: UPDATES,
      ...NEVER_SHOW,
    },
  },
  {
    key: 'delivered',
    caption: 'finished — the live site takes the slot the target date had',
    project: {
      name: 'Vellum — Website',
      company: 'Vellum Studio',
      statusStage: 4,
      estimatedCompletionDate: day(3),
      liveUrl: 'https://vellum.studio',
      awaitingYourReview: null,
      updates: [
        {
          id: 'u0',
          title: 'Live',
          description: 'Everything is pointed at the new site and the old one is redirecting.',
          createdAt: day(1),
        },
        ...UPDATES,
      ],
      ...NEVER_SHOW,
    },
  },
];

const DEVICES = [
  // A phone first: this link is opened from an email, mostly on one.
  { key: 'phone', viewport: { width: 393, height: 852 }, scale: 2, mobile: true },
  { key: 'desk', viewport: { width: 1280, height: 1000 }, scale: 1, mobile: false },
];

const browser = await chromium.launch({
  ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  args: ['--no-sandbox'],
});

console.log(`\nClient status screenshots → ${OUT}\n`);

const problems = [];
const note = (msg) => problems.push(msg);

for (const device of DEVICES) {
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.scale,
    isMobile: device.mobile,
    hasTouch: device.mobile,
  });

  for (const state of STATES) {
    const page = await context.newPage();
    const where = `${device.key}/${state.key}`;

    await page.route('**/api/public/projects/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, project: state.project }),
      })
    );

    // The token is what the page is fetching with; a page that loads without
    // one is a page that stopped checking.
    await page.goto(`${BASE}/status/proj_demo?t=share_demo_token`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1');
    // The rail animates its width over 500ms; measuring before it settles
    // reads a bar that is still travelling.
    await page.waitForTimeout(900);

    const file = path.join(OUT, `${device.key}-${state.key}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  ${path.basename(file)}  — ${state.caption}`);

    const body = await page.locator('main').innerText();

    /* --- the rail lines up with the stop it says it has reached --- */
    const geometry = await page.evaluate(() => {
      const filled = document.querySelector('.bg-sky-400\\/70[style*="width"]');
      // Scoped to the stage rail's own list. The recent-updates timeline is
      // an `ol` of `li`s with a dot in each too, so an unscoped query counts
      // five stops plus however many updates were posted.
      const rail = document.querySelector('ol.grid-cols-5');
      const dots = rail ? [...rail.querySelectorAll('li span[aria-hidden="true"]')] : [];
      if (!filled || dots.length !== 5) return null;
      const f = filled.getBoundingClientRect();
      return {
        filledRight: f.right,
        railLeft: f.left,
        dotCentres: dots.map((d) => {
          const r = d.getBoundingClientRect();
          return r.left + r.width / 2;
        }),
      };
    });

    if (!geometry) {
      note(`${where}: could not find the progress rail and its five stops.`);
    } else {
      const stage = state.project.statusStage;
      const target = geometry.dotCentres[stage];
      const drift = Math.abs(geometry.filledRight - target);
      // A couple of pixels of rounding is fine; half a column is the bug.
      const column = (geometry.dotCentres[4] - geometry.dotCentres[0]) / 4;
      console.log(
        `      rail ends ${geometry.filledRight.toFixed(1)}px, stage ${stage + 1} dot at ` +
          `${target.toFixed(1)}px — off by ${drift.toFixed(1)}px (column ${column.toFixed(0)}px)`
      );
      if (drift > 3) {
        note(
          `${where}: the filled rail ends ${drift.toFixed(1)}px from the stop it claims to be ` +
            `on — on the last stage that draws a line past the final dot.`
        );
      }
    }

    /* --- who the page says it is waiting on --- */
    const band = page.locator('section[aria-live="polite"]');
    const bandCount = await band.count();

    if (state.project.awaitingYourReview) {
      if (bandCount === 0) {
        note(`${where}: the design is waiting on the client and the page does not say so.`);
      } else {
        const bandText = await band.innerText();
        if (!/waiting for your review/i.test(bandText)) {
          note(`${where}: the band is there but does not say the review is theirs to give.`);
        }
        // The deadline is a term they agreed to; they should not meet it for
        // the first time on an invoice.
        if (!/take it as approved/i.test(bandText)) {
          note(`${where}: the band does not say what happens if they say nothing.`);
        }
        const bandBox = await band.boundingBox();
        const cardBox = await page
          .locator('section')
          .filter({ hasText: 'Stage ' })
          .first()
          .boundingBox();
        if (bandBox && cardBox && bandBox.y >= cardBox.y) {
          note(
            `${where}: "waiting for your review" is below the stage card — the fact that the ` +
              `work has stopped outranks where it stopped.`
          );
        }
      }
    } else if (bandCount > 0) {
      note(`${where}: nothing is waiting on the client and the page is asking them for it anyway.`);
    }

    /* --- the delivery moment, and what it displaces --- */
    if (state.project.liveUrl) {
      const visit = page.locator(`a[href="${state.project.liveUrl}"]`);
      if ((await visit.count()) === 0) {
        note(`${where}: the site is live and the page offers no way to go and look at it.`);
      }
      if (!/Your site is live/.test(body)) {
        note(`${where}: the site is live and the page does not say so.`);
      }
      if (/Estimated target/.test(body)) {
        note(
          `${where}: still forecasting a completion date for a project that has already shipped.`
        );
      }
    } else {
      if (/Your site is live/.test(body)) {
        note(`${where}: promising a live site that does not exist yet.`);
      }
      if (state.project.estimatedCompletionDate && !/Estimated target/.test(body)) {
        note(`${where}: there is a target date and the page is keeping it to itself.`);
      }
    }

    /* --- what a forwarded link may never carry --- */
    for (const [field, cents] of Object.entries(NEVER_SHOW)) {
      const pounds = String(Math.round(cents / 100));
      if (body.includes(pounds) || body.includes(pounds.replace(/\B(?=(\d{3})+$)/g, ','))) {
        note(`${where}: ${field} (${pounds}) is on a page anybody with the link can read.`);
      }
    }

    /* --- and the failure a picture cannot show --- */
    const width = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    if (width.page > width.viewport) {
      note(
        `${where}: the page is ${width.page}px wide in a ${width.viewport}px viewport — ` +
          `something overflows.`
      );
    }

    await page.close();
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
console.log('\nDone — the rail lines up, the band appears only when it is true, and nothing costs money.\n');
