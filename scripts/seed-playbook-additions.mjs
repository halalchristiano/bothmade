// One-off seed for the trades/field-service playbook items added to close
// the gap where "Website and service-routing rebuild", "Website
// restructuring", "Mobile-first call flow", "Guided intake", "Booking and
// dispatch", "Trust architecture" and "Privacy and accessibility" had no
// answer sheet behind them (see lib/playbook-seed.ts for the source content).
//
// Only inserts rows that don't already exist by slug — never overwrites an
// edited row. Run with: node scripts/seed-playbook-additions.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const slug = (label) => label.toLowerCase().replace(/[^a-z0-9]/g, '');

const items = [
  {
    label: 'Website and service-routing rebuild',
    kind: 'essential',
    priceCents: 260000,
    whatItIs:
      'A mobile-first rebuild that splits emergency calls from scheduled work, checks the visitor is in the service area, and adds online estimates, CRM intake and analytics.',
    benefit:
      "{company}'s emergency and scheduled visitors stop being funnelled through the same generic page. The urgent ones reach a phone number immediately; the routine ones reach an estimate flow — both convert better than one page trying to do both jobs.",
    pitch:
      "We'd rebuild the site so an emergency and a routine job are never treated the same way — the urgent visitor gets the phone number in one tap, the routine one gets a proper estimate flow.",
    justification:
      'This is the item everything else on the list sits on top of. Routing, service-area checks, estimates and CRM intake only pay off once the underlying site is built to carry them.',
    objection: null,
  },
  {
    label: 'Website restructuring',
    kind: 'essential',
    priceCents: 90000,
    whatItIs:
      'Reorganising the site around the journeys visitors actually arrive with — emergency, planned service, commercial, and existing-account.',
    benefit:
      "Visitors to {company} find the part of the site meant for them — emergency, planned service, commercial, or account — in one step instead of hunting through a generic menu.",
    pitch:
      "We'd organise the site around why someone actually showed up — an emergency, a planned job, a commercial enquiry, or an existing account — instead of one layout trying to serve all four.",
    justification:
      "A visitor who has to work out which part of the site applies to them leaves before they find it. Structuring around their reason for being there is what gets them to the right action.",
    objection: null,
  },
  {
    label: 'Mobile-first call flow',
    kind: 'essential',
    priceCents: 50000,
    whatItIs:
      'Keeping the correct emergency phone number visible and one tap away on every page, on the screen size most visitors actually use.',
    benefit:
      "{company} stops losing emergency calls to whoever's site made the phone number easiest to tap. On the phone screen most visitors are using, it's never more than one tap away.",
    pitch:
      "Wherever someone is on the site, on their phone, the right number to call is one tap away — no hunting through a menu while their basement floods.",
    justification:
      "An emergency visitor decides in seconds. If the phone action isn't immediately visible on mobile, where most of this traffic lands, they call the next name on the list instead.",
    objection: null,
  },
  {
    label: 'Guided intake',
    kind: 'essential',
    priceCents: 110000,
    whatItIs:
      'A short set of questions — incident or project type, location, urgency, key details, photos — collected before the job goes to dispatch or sales.',
    benefit:
      "Every job reaching {company} arrives with the type, location, urgency and photos already attached, so dispatch or sales start working the job instead of interviewing the caller.",
    pitch:
      "Before it ever reaches you, we'd get the type of job, the location, how urgent it is, and any photos — so whoever picks it up already knows what they're walking into.",
    justification:
      'Dispatch and sales currently spend the first few minutes of every call gathering the same basics. Collecting it up front shortens every single job by that much, for free, forever.',
    objection: null,
  },
  {
    label: 'Booking and dispatch',
    kind: 'essential',
    priceCents: 130000,
    whatItIs:
      'Connecting urgent and scheduled requests to the correct team automatically, with a clear response-time expectation set for each.',
    benefit:
      "Urgent and scheduled requests to {company} stop competing in the same queue. Each reaches the right team immediately, which is what actually makes a response-time promise real.",
    pitch:
      "Urgent requests and scheduled ones stop competing for the same queue — each goes straight to the right team with the response time that request actually needs.",
    justification:
      'Missed or misrouted jobs cost more than this line item in a single bad week. Getting the right job to the right team immediately is what a response-time promise actually depends on.',
    objection: null,
  },
  {
    label: 'Trust architecture',
    kind: 'essential',
    priceCents: 65000,
    whatItIs:
      'Surfacing reviews, licences, guarantees, case studies and response standards where a nervous visitor actually looks for them.',
    benefit:
      "{company}'s licences, reviews and track record sit exactly where a nervous visitor is deciding whether to call. The proof already exists — this is what makes it visible at the moment it matters.",
    pitch:
      "You've already got the licences, the reviews and the track record — we'd just put them where someone deciding whether to trust you actually looks.",
    justification:
      'Trust is the last thing standing between a visitor and picking up the phone. You already own the proof; this is the difference between it existing and it being seen.',
    objection: null,
  },
  {
    label: 'Privacy and accessibility',
    kind: 'essential',
    priceCents: 60000,
    whatItIs:
      'A credible compliance foundation for handling customer information and for mobile and assistive-technology usability.',
    benefit:
      "{company} has a straight answer the next time a commercial or municipal customer asks how data and accessibility are handled — built in now, rather than retrofitted under pressure later.",
    pitch:
      "We bring the site up to a standard you can point to if a commercial or municipal customer ever asks how customer data and accessibility are handled.",
    justification:
      'Cheap to build in now, expensive to bolt on later, and increasingly a checkbox commercial and public-sector customers actually ask about before signing.',
    objection: null,
  },
];

async function main() {
  for (const item of items) {
    const existing = await prisma.salesPlaybookItem.findUnique({
      where: { slug: slug(item.label) },
    });
    if (existing) {
      console.log(`skip (already exists): ${item.label}`);
      continue;
    }
    await prisma.salesPlaybookItem.create({
      data: { slug: slug(item.label), ...item },
    });
    console.log(`created: ${item.label}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
