# Building a client brochure

A brochure is a priced proposal wrapped around a concept we already built.
It goes out as a PDF attached to an email, alongside a walkthrough video.

Everything here exists because a version of it went wrong once. Read the
rules before writing copy.

---

## What you get from Evan

Mobile screenshots, two sets:

1. **The concept** — `<client>.bothmade.studio`, 8–12 screens.
2. **Their current site** — 6–14 screens.

Mobile only, on purpose: it is how their customers actually arrive, and it
is the honest test. Never write about desktop, load speed, or anything else
nobody looked at.

If the second set is missing, **build without the comparison section** and
say so. Do not guess at what is wrong with a site you have not seen.

## What you produce

1. A data file — `lib/brochures/<slug>.ts` exporting a `BrochureInput`.
2. Their screenshots in `public/brochures/<slug>/`, `chmod 644`.
3. A row in `BROCHURES` in `app/b/[slug]/page.tsx`.
4. Tests in `tests/lib/brochure.test.ts`.
5. The PDF, rendered with Playwright and sent to Evan.

The route renders it; `lib/brochure.ts` prices it. You write content, not
layout — if a page looks wrong, fix the CSS, don't work around it in prose.

---

## The rules

**Never invent a fact about the client.** Every claim comes off a screenshot
or out of their lead record. No numbers nobody measured. If it would be
embarrassing to be wrong about in front of the owner, it needs a screenshot
behind it.

**Never invent a price.** A tier is a `PricingSelection`; `calculatePrice`
produces the figure. Bespoke work is priced from the catalogue add-ons it is
built out of, and the page shows that arithmetic. `withDependencies()` pulls
in what the checkout will silently add — a quote that omits it is a quote
the first invoice disagrees with.

**Nothing is live for them.** The concept is built and *not published*.
Never print `conceptUrl`, never write "open it on your phone", never imply
there is somewhere to go. What they get is the video and the screenshots,
listed in `enclosures`.

**Say it is one idea.** They never asked for this homepage. The document has
to say, out loud, that it is a starting point and every piece of it is
theirs to change.

**Screenshots before criticism.** The comparison is two pages: their screens
first, the table second. Open with `preamble` — what the business has got
right — before any complaint. This is the only negative section in the
document and it goes to the person who paid for the thing being criticised.

**Plain English.** The reader is an accountant or an owner, not a developer.
Every technical term renders its `sayIt` from `lib/glossary.ts`; the jargon
page is generated from the finished prose, so it cannot fall out of step.
Add an alias there rather than explaining a term twice.

---

## Shape

Eighteen pages with a comparison, sixteen without:

| | |
|---|---|
| 1 | Cover |
| 2–3 | What we noticed · Both ways *(only with their screenshots)* |
| 4–11 | The concept, one idea per page |
| 12–14 | The essentials · What we recommend · Everything |
| 15 | Built for you specifically — bespoke work |
| 16 | The three side by side |
| 17 | Plain English |
| 18 | How payment works, what happens next |

`countPages()` is the authority. Folios come from it, so a page added in one
place and not the other fails a test rather than shipping wrong.

Page 4 carries `observation` — one line from the research brief, specific
enough that it could not have been written about anybody else — and
`enclosures`, the list of what arrived in the email.

## Theme

Read the colours off the concept's own screenshots and put them in `theme`.
The brochure should look like the site it is about, not like Bothmade.

## Tiers

Three, ascending. Essential is groundwork that the other two build on;
Recommended is the one we would pick and should say why; Everything is the
site taking work off the office, not just bringing work in.

If a tier replaces something with a bigger version of itself (Growth Plan
supersedes Maintenance), the comparison table will show a gap in the top
column — explain it in `pricingNotes` or it reads as a downgrade.

## Bespoke work

Three or four things this business needs that the catalogue has no box for.
Phrase `why` as an offer, not a diagnosis — we have not audited how they
work, so "if owners are fielding these calls" rather than "your owners are
fielding these calls".

---

## Sending it

Composer → **Concept delivery → Concept + brochure (video attached)**. It
lays out three attachment rows already labelled: the walkthrough, the
brochure, the screens full size. Paste the links in. Two are PDFs because
they are separate files and forgetting the second is the easy mistake.

## Rendering the PDF

Dev server, then Playwright with `emulateMedia({ media: 'print' })`,
`format: 'Letter'`, `printBackground: true`, `preferCSSPageSize: true`.
Chromium is at `/opt/pw-browsers/chromium`.

Check every page as an image before sending. Overflow does not throw — it
just runs off the bottom of the paper, and the tests cannot see it.
