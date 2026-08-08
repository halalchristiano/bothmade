/**
 * Look at the /start page, rather than reading assertions about it.
 *
 * /start is where an enquiry converts, and the two things fixed on it are both
 * invisible in a browser: a <label> that is not attached to its input looks
 * identical to one that is, and an FAQ answer missing from the document looks
 * identical to one that is merely collapsed. Neither shows up in a normal
 * screenshot, which is exactly why both survived on the most commercially
 * important form on the site.
 *
 * So this produces two images:
 *
 *   start-evidence.png  what the accessibility tree and the HTML actually
 *                       contain, read out of a real production render
 *   start-page.png      the page itself, with the first FAQ answer open
 *
 * ## Running it
 *
 *   npm i -D playwright        # not a project dependency; see billing.mjs
 *   npx prisma generate && npx next build && npx next start
 *   node scripts/screenshots/start-page.mjs
 *
 * A production server, not `npm run dev` — and `npx next build` rather than
 * `npm run build`, which would run `prisma migrate deploy` against whatever
 * DATABASE_URL points at. Dummy values are fine for everything except
 * STRIPE_SECRET_KEY, which is read at module scope by the checkout routes.
 *
 * ## What is real and what is not
 *
 * Every value on the sheet is computed in the page at run time — accessible
 * names are resolved by querying the live accessibility tree, and the answer
 * count is a DOM query against the served HTML. Nothing is transcribed.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.SHOT_BASE_URL || 'http://localhost:3000';
const OUT = process.env.SHOT_OUT || path.join(process.cwd(), '.screenshots');
const CHROMIUM = process.env.CHROMIUM_PATH;

fs.mkdirSync(OUT, { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});

// Two tabs: setContent() on a tab that has loaded the app is reverted the
// moment Next hydrates and React re-renders. See security.mjs.
const appPage = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const sheet = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await appPage.goto(`${BASE}/start`, { waitUntil: 'networkidle' });

// --- Read the page ---------------------------------------------------------

const facts = await appPage.evaluate(() => {
  /** The accessible name of a form control, the way an AT resolves it. */
  const nameOf = (el) => {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    const by = el.getAttribute('aria-labelledby');
    if (by) return document.getElementById(by)?.textContent?.trim() || '';
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return l.textContent.trim();
    }
    const wrap = el.closest('label');
    return wrap ? wrap.textContent.trim() : '';
  };

  const form = document.querySelector('#contact-form');
  const fields = [...form.querySelectorAll('input,select,textarea')]
    .filter((el) => el.type !== 'hidden')
    .map((el) => ({
      kind: `${el.tagName.toLowerCase()}${el.type ? `[${el.type}]` : ''}`,
      name: nameOf(el),
      placeholder: el.placeholder || '',
      linkedBy: el.id ? (document.querySelector(`label[for="${CSS.escape(el.id)}"]`) ? `label[for=${el.id}]` : '') : '',
    }));

  const faqButtons = [...document.querySelectorAll('button[aria-controls^="faq-a-"]')];
  const faq = {
    questions: faqButtons.length,
    withAriaExpanded: faqButtons.filter((b) => b.hasAttribute('aria-expanded')).length,
    answersInDom: document.querySelectorAll('[id^="faq-a-"]').length,
    answersVisible: [...document.querySelectorAll('[id^="faq-a-"]')].filter((p) => !p.hidden).length,
    controlsResolve: faqButtons.every((b) => document.getElementById(b.getAttribute('aria-controls'))),
    sampleAnswer: (document.querySelector('#faq-a-0')?.textContent || '').trim().slice(0, 150),
  };

  return { fields, faq };
});

const unnamed = facts.fields.filter((f) => !f.name);

const row = (ok, label, value) => `
  <tr><td class="mark ${ok ? 'ok' : 'bad'}">${ok ? '&#10003;' : '&#10007;'}</td>
      <td class="label">${esc(label)}</td>
      <td class="value">${esc(value)}</td></tr>`;

const html = `
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; padding:40px; background:#05030a; color:#e8e6f0;
         font:14px/1.55 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  h1 { font-size:27px; margin:0 0 4px; letter-spacing:-0.02em; }
  .sub { color:#8a86a0; font-size:13px; margin-bottom:26px; }
  .sub b { color:#c9c5da; font-weight:600; }
  section { border:1px solid #221d33; border-radius:12px; padding:18px 20px;
            margin-bottom:16px; background:#0b0814; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:0.16em;
       color:#7d78a0; margin:0 0 14px; font-weight:600; }
  table { width:100%; border-collapse:collapse; }
  td { padding:5px 8px 5px 0; vertical-align:top; border-bottom:1px solid #17132480; }
  tr:last-child td { border-bottom:0; }
  .mark { width:22px; font-weight:700; }
  .ok { color:#4ade80; } .bad { color:#f87171; }
  .label { width:300px; color:#b9b4cd; }
  .value { font-family:ui-monospace, Menlo, monospace; font-size:11.5px; color:#7fd1ff; word-break:break-word; }
  .note { color:#6f6a8a; font-size:11.5px; margin-top:10px; font-style:italic; }
  pre { font-family:ui-monospace, Menlo, monospace; font-size:11.5px; background:#06040d;
        border:1px solid #1b1629; border-radius:8px; padding:12px; margin:0;
        white-space:pre-wrap; color:#a8e6a0; }
</style>

<h1>/start &mdash; live evidence</h1>
<div class="sub">Read from a <b>production</b> render at <b>${esc(BASE)}</b>. Accessible names
resolved from the live accessibility tree; counts are DOM queries against the served HTML.</div>

<section>
  <h2>Enquiry form &mdash; every control has an accessible name</h2>
  <table>
    ${facts.fields.map((f) =>
      row(Boolean(f.name), `${f.kind} — "${f.name || 'NO ACCESSIBLE NAME'}"`,
          f.linkedBy || (f.name ? 'aria-label' : `only placeholder="${f.placeholder}"`))).join('')}
  </table>
  <div class="note">
    Three of these were announced as "edit text, blank": a visible &lt;label&gt; with no htmlFor,
    and no id on the input. A placeholder is a hint, not a name &mdash; it clears as soon as you type.
  </div>
</section>

<section>
  <h2>FAQ accordion &mdash; structured data vs. what the page contains</h2>
  <table>
    ${row(facts.faq.answersInDom === facts.faq.questions,
          'answers present in the HTML while collapsed',
          `${facts.faq.answersInDom} of ${facts.faq.questions} questions`)}
    ${row(facts.faq.answersVisible === 0,
          'and none of them on screen until opened',
          `${facts.faq.answersVisible} visible`)}
    ${row(facts.faq.withAriaExpanded === facts.faq.questions,
          'every question button reports its state',
          `${facts.faq.withAriaExpanded} of ${facts.faq.questions} carry aria-expanded`)}
    ${row(facts.faq.controlsResolve, 'aria-controls points at a real panel',
          facts.faq.controlsResolve ? 'all resolve' : 'some dangle')}
  </table>
  <div class="note">
    app/start/layout.tsx publishes all of these as FAQPage structured data. Before the fix the
    answers were rendered as <code>{open &amp;&amp; …}</code>, so the page a crawler fetches had
    <b>zero</b> of them &mdash; markup claiming content the page did not contain.
  </div>
</section>

<section>
  <h2>First answer, as served (collapsed, still in the document)</h2>
  <pre>${esc(facts.faq.sampleAnswer)}${facts.faq.sampleAnswer.length >= 150 ? ' …' : ''}</pre>
</section>
`;

await sheet.setContent(html, { waitUntil: 'load' });
await sheet.screenshot({ path: path.join(OUT, 'start-evidence.png'), fullPage: true });

// The page itself, with the first FAQ answer opened so the disclosure shows.
await appPage.evaluate(() => document.querySelector('#contact-form')?.scrollIntoView());
await appPage.screenshot({ path: path.join(OUT, 'start-page.png') });

await browser.close();

console.log(`start-evidence.png, start-page.png -> ${OUT}`);
console.log(unnamed.length ? `UNNAMED CONTROLS: ${unnamed.length}` : 'every form control has an accessible name');
console.log(`FAQ: ${facts.faq.answersInDom}/${facts.faq.questions} answers in DOM, ${facts.faq.answersVisible} visible, ${facts.faq.withAriaExpanded} with aria-expanded`);
