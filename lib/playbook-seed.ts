/**
 * Seed content for the sales playbook — the answer sheet behind every line
 * item that appears in a research dossier.
 *
 * Written for a rep with no technical background: `whatItIs` explains the
 * thing itself, `pitch` is what gets said to the customer, `justification`
 * is why the price is fair in business terms, and `objection` is the
 * pushback the item reliably attracts plus the answer to it.
 *
 * Prices are per-item list prices and are set so that a full dossier's
 * essentials add up to its quoted low figure and the upsells make up the
 * difference to its high figure — otherwise the itemised numbers and the
 * headline range would contradict each other on the call.
 *
 * This is the seed, not the source of truth: rows live in the database and
 * can be edited there without a deploy. Re-seeding never overwrites an
 * edited row.
 */
export interface PlaybookSeedItem {
  slug: string;
  label: string;
  kind: 'essential' | 'upsell';
  priceCents: number;
  whatItIs: string;
  pitch: string;
  justification: string;
  objection?: string;
}

const item = (
  label: string,
  kind: 'essential' | 'upsell',
  dollars: number,
  whatItIs: string,
  pitch: string,
  justification: string,
  objection?: string
): PlaybookSeedItem => ({
  slug: label.toLowerCase().replace(/[^a-z0-9]/g, ''),
  label,
  kind,
  priceCents: dollars * 100,
  whatItIs,
  pitch,
  justification,
  objection,
});

export const PLAYBOOK_SEED: PlaybookSeedItem[] = [
  // ---------- Local service business: essentials ----------
  item(
    'Website redesign',
    'essential',
    1200,
    'Rebuilding their site so it looks current and guides a visitor towards getting in touch, instead of just listing information.',
    "We'd rebuild the site around one thing: turning the people already finding you into enquiries. Same business, presented the way it deserves.",
    "It's the cheapest item that affects every other one. Better SEO, better ads and better follow-up all still land on the same page — if that page doesn't convert, everything spent upstream leaks out here.",
    '"Our site is fine." — Ask what percentage of visitors get in touch. Almost nobody knows, which is the actual problem.'
  ),
  item(
    'Mobile optimisation',
    'essential',
    450,
    'Making the site work properly on a phone — readable text, tappable buttons, fast forms.',
    "Most of your customers will find you on a phone, often while they're standing in the problem. It needs to be effortless on that screen.",
    'Typically the majority of traffic is mobile, and Google ranks on the mobile version, not the desktop one. A poor phone experience costs twice — visitors and ranking.',
    '"It works on my phone." — Ask them to fill in their own enquiry form on it while you wait.'
  ),
  item(
    'Service-page structure',
    'essential',
    600,
    'A separate page for each service they offer, instead of one page listing everything.',
    "Right now everything you do lives on one page. We'd give each service its own page, so someone searching for that exact thing lands on it.",
    "Google can only rank a page for what's on it. One page covering six services competes weakly for all six; six focused pages compete properly for one each.",
    undefined
  ),
  item(
    'Qualified enquiry form',
    'essential',
    400,
    'A form that asks the questions needed to quote, so enquiries arrive complete instead of "call me".',
    "We'd have the form ask for what you actually need to quote — so by the time it reaches you, you can price it rather than start a game of phone tag.",
    'Every incomplete enquiry costs a call, an email, and a delay. Removing three back-and-forths per enquiry pays for this within weeks.',
    '"We prefer to talk to them." — You still do. This just means the conversation starts with the details already in hand.'
  ),
  item(
    'Booking or estimate workflow',
    'essential',
    900,
    'Letting customers book a slot or request an estimate online, without ringing.',
    "Someone deciding at 9pm can't ring you. Right now they either wait until morning or ring the next name on the list — and most don't wait.",
    "Out-of-hours enquiries are pure recovered revenue: demand that already exists and is currently lost. It usually only takes one or two recovered jobs to cover this outright.",
    '"People like to call." — Plenty do, and they still can. This is for the ones who won\'t.'
  ),
  item(
    'Local SEO',
    'essential',
    550,
    'Getting them showing up in the map results and "near me" searches for their area.',
    "When someone nearby searches for this, you want to be in that little map box at the top. That's where the ready-to-buy customers are.",
    'Local search traffic is the highest-intent traffic there is — those people are looking to buy now, not researching. It is also the cheapest position to win compared to competing nationally.',
    undefined
  ),
  item(
    'Analytics setup',
    'essential',
    500,
    'Tracking that shows how many people visit, where they came from, and what they did.',
    "At the moment there's no way to tell which of your marketing actually brings people in. We'd fix that first, so every decision after it is based on something real.",
    "It is the smallest item here and it makes every other spend measurable. Without it you cannot tell a campaign that's working from one that isn't, so you either keep paying for the wrong thing or cut the right one.",
    undefined
  ),
  item(
    'CRM lead routing',
    'essential',
    650,
    'Every enquiry landing in one organised system and going to the right person automatically.',
    "Every enquiry lands in one place and goes straight to whoever should handle it, so nothing sits in an inbox over a weekend.",
    'One lost enquiry a month is usually worth more than this costs for the year. The value is not the software, it is that follow-up stops depending on somebody remembering.',
    undefined
  ),
  item(
    'Professional copywriting',
    'essential',
    700,
    'Writing the words on the site so they sell, rather than just describe.',
    "We'd rewrite the wording so it speaks to what your customers are actually worried about, instead of just listing what you do.",
    "The traffic is the expensive part; the words are what convert it. Improving wording lifts results across every visitor you already get, without paying for a single extra one.",
    undefined
  ),
  item(
    'Trust and proof system',
    'essential',
    300,
    'Showing reviews, accreditations, guarantees and real photos of their work where they matter.',
    "You've got the reputation — it's just not visible at the moment someone's deciding. We'd put the proof right where the doubt happens.",
    'Cheapest item on the list and often the biggest single lift, because it removes the last hesitation before someone gets in touch. You already own the material; it just is not being used.',
    undefined
  ),

  item(
    'Lead-generation rebuild',
    'essential',
    0,
    "The whole job in one line — rebuilding the site so that the people already finding this business turn into enquiries, rather than looking and leaving. It's the summary of everything listed under it, not a separate item to charge for.",
    "What I'm describing is one job, not a shopping list: rebuilding the site around turning the people already finding you into actual enquiries.",
    "Priced as the items beneath it rather than on its own — this is the headline, and the detail is what you're quoting.",
    '"So what does that actually mean?" — Point at the list underneath. This line is the summary; those are the parts.'
  ),

  // ---------- Local service business: upsells ----------
  item(
    'Customer portal',
    'upsell',
    2000,
    'A private login where customers see their own quotes, jobs, documents and history.',
    "Your customers get a login where they can see their quote, their job and their documents — instead of ringing to ask where things are at.",
    'Every "where are we up to?" call is unpaid admin. A portal removes that category of call entirely, and makes you look considerably bigger than competitors who cannot offer it.',
    undefined
  ),
  item(
    'Review automation',
    'upsell',
    700,
    'Automatically asking happy customers for a Google review after a job, and catching unhappy ones privately first.',
    "After every completed job it asks for a review automatically — and if someone's unhappy, it routes them to you privately instead of to Google.",
    'Reviews are the single biggest factor in local search and in whether someone picks you. Doing it automatically is the difference between asking occasionally and asking every time.',
    undefined
  ),
  item(
    'SMS follow-up',
    'upsell',
    600,
    'Automatic text messages for confirmations, reminders and chasing quotes that went quiet.',
    "Confirmations, reminders and a nudge on quotes that have gone quiet — by text, automatically.",
    'Texts get read almost immediately, unlike email. Cutting no-shows and reviving a fraction of dormant quotes usually covers this several times over.',
    undefined
  ),
  item(
    'Online payments',
    'upsell',
    900,
    'Taking deposits or full payment through the site.',
    "You can take a deposit at the moment they say yes, rather than invoicing and waiting.",
    'Getting paid sooner improves cash flow, and a deposit taken at the point of commitment dramatically reduces cancellations. It pays for itself on the timing alone.',
    undefined
  ),
  item(
    'Recurring service plans',
    'upsell',
    1200,
    'Selling maintenance or care as a monthly subscription instead of one-off jobs.',
    "Instead of chasing the next job, some of your customers pay a set amount monthly for ongoing care — predictable for them and for you.",
    'Turns one-off customers into recurring revenue, which is worth several times more per customer over time and makes quiet months survivable.',
    undefined
  ),
  item(
    'Email nurture',
    'upsell',
    850,
    'Automatic email sequences that stay in touch with people who did not buy yet.',
    "The ones who aren't ready today don't have to be lost — they hear from you occasionally so you're who they think of when they are ready.",
    "Most enquiries do not buy immediately. Without follow-up that work is written off; with it, a slice of it converts months later at no extra acquisition cost.",
    undefined
  ),
  item(
    'Paid-search landing pages',
    'upsell',
    900,
    'Dedicated pages built specifically for ad campaigns to point at.',
    "If you run ads, they should land somewhere built for that exact search — not on your homepage.",
    "Sending paid traffic to a general page wastes a chunk of the ad budget. Purpose-built pages raise the return on money already being spent.",
    undefined
  ),
  item(
    'Photo and document uploads',
    'upsell',
    500,
    'Letting customers attach photos or documents to an enquiry.',
    "They can send photos of the problem with the enquiry, so you can often quote without a site visit.",
    'Every site visit avoided is hours of travel and labour saved. A handful a month makes this trivially worthwhile.',
    undefined
  ),
  item(
    'Referral workflow',
    'upsell',
    650,
    'A system that makes it easy for happy customers to send you their friends and neighbours.',
    "Your happy customers become a channel — it makes referring you a two-tap thing rather than something they mean to do and forget.",
    'Referred customers cost nothing to acquire and close far more readily than cold ones. Formalising it turns luck into a reliable stream.',
    undefined
  ),
  item(
    'Ongoing growth plan',
    'upsell',
    600,
    'A monthly retainer for continued improvements, content and reporting.',
    "Rather than build it and leave you, we keep improving it monthly and show you what changed and what it did.",
    "A site left alone decays as competitors move and Google changes. Ongoing work protects the investment already made rather than watching it slide.",
    '"Can we do this later?" — Yes. It is genuinely optional, and better started once results are showing.'
  ),

  item(
    'Customer follow-up and retention system',
    'upsell',
    0,
    "The umbrella name for keeping in touch after the job — review requests, reminders, repeat bookings. It's the summary of the extras listed under it, not a separate charge.",
    "Once the core is live, the next win is the customers you already have — staying in front of them so they come back and refer you.",
    "Priced as whichever of the pieces below they actually take, not as a lump.",
    '"How much is all that?" — It depends which parts they want. Price the pieces underneath, not this line.'
  ),

  // ---------- B2B / industrial: essentials ----------
  item(
    'Product-led website redesign',
    'essential',
    3500,
    'Rebuilding the site around what buyers are trying to solve, rather than around company structure.',
    "We'd reorganise the site around the problems your buyers are trying to solve, so they can find the right product themselves instead of guessing.",
    'Technical buyers self-serve most of the way before contacting anyone. If they cannot get there alone, they leave — and you never learn they existed.',
    undefined
  ),
  item(
    'Guided selection system',
    'essential',
    4500,
    'A step-by-step selector that asks the technical questions and narrows buyers to the right product.',
    "A buyer answers a few questions about their application and it points them at the right configuration — the conversation your engineers currently have by email, done automatically.",
    "It removes the single biggest reason technical buyers abandon: not being sure what fits. It also filters out the enquiries that were never viable, so engineering time goes to the real ones.",
    '"Our products are too complex for that." — It does not need to give a final answer, only get them close enough to enquire with confidence.'
  ),
  item(
    'Structured RFQ web app',
    'essential',
    4500,
    'A proper quote-request tool that collects specifications, quantities, deadlines and files up front.',
    "Instead of a quote request arriving as a one-line email, it arrives with the specifications, quantities and deadlines already filled in.",
    'Your engineers currently spend paid hours collecting information that a form could have gathered. That time is the most expensive in the business and it is being spent on data entry.',
    undefined
  ),
  item(
    'Secure file upload',
    'essential',
    900,
    'Letting buyers attach drawings, parts lists and technical documents to an enquiry safely.',
    "They can attach drawings and specifications directly to the enquiry, rather than emailing files around.",
    "Quoting cannot start until the drawings arrive. Removing that delay shortens every quote cycle, and handling commercially sensitive files properly is a credibility issue with larger buyers.",
    undefined
  ),
  item(
    'CRM integration',
    'essential',
    1200,
    'Enquiries flowing automatically into their sales system as proper opportunities.',
    "Every enquiry becomes a tracked opportunity automatically, with the product interest and requirements already attached.",
    'Manual re-entry is both a cost and a source of error. Once enquiries land as structured records, you can finally see conversion by product line instead of guessing.',
    undefined
  ),
  item(
    'Analytics and funnel tracking',
    'essential',
    800,
    'Measuring which products get looked at, where buyers give up, and which enquiries turn into orders.',
    "You'd see which products get attention, where people give up, and which enquiries actually turn into orders.",
    'Small spend, and it is what makes every other investment justifiable. Without it you cannot tell which product lines deserve more marketing and which are quietly losing money.',
    undefined
  ),
  item(
    'Technical SEO',
    'essential',
    900,
    'The behind-the-scenes work that lets Google index and rank a large technical catalogue properly.',
    "We make sure Google can actually read and rank your full catalogue, not just the front page.",
    'Industrial buyers search in very specific technical language. Ranking for those exact terms attracts a small number of extremely valuable visitors — one order typically dwarfs the cost.',
    undefined
  ),
  item(
    'CMS and data migration',
    'essential',
    1200,
    'Moving existing product data across and giving the team a way to edit it without a developer.',
    "Your existing product information comes across properly, and your team can update it themselves afterwards.",
    'Without it you are dependent on us for every change, which is slower and more expensive over time. This is the item that stops the site going stale.',
    undefined
  ),
  item(
    'Core integrations',
    'essential',
    1200,
    'Connecting the site to the systems they already run — inventory, email, support, distributors.',
    "The site talks to the systems you already run, so information stops being typed into two places.",
    'Duplicate entry costs hours and produces numbers that disagree between systems, which means nobody trusts any of them. Connecting them removes both problems at once.',
    undefined
  ),
  item(
    'Accessibility and privacy',
    'essential',
    600,
    'Meeting the accessibility and data-protection standards expected of an established commercial business.',
    "We bring the site up to the accessibility and data standards your larger customers will expect — and increasingly ask about.",
    'Cheap to do at build time and expensive to retrofit. For commercial and public-sector buyers it can be a procurement requirement, so it protects deals rather than just reducing risk.',
    undefined
  ),

  // ---------- Trades / field-service (emergency + scheduled): essentials ----------
  item(
    'Website and service-routing rebuild',
    'essential',
    2600,
    'A mobile-first rebuild that splits emergency calls from scheduled work, checks the visitor is in the service area, and adds online estimates, CRM intake and analytics.',
    "We'd rebuild the site so an emergency and a routine job are never treated the same way — the urgent visitor gets the phone number in one tap, the routine one gets a proper estimate flow.",
    "This is the item everything else on the list sits on top of. Routing, service-area checks, estimates and CRM intake only pay off once the underlying site is built to carry them.",
    undefined
  ),
  item(
    'Website restructuring',
    'essential',
    900,
    "Reorganising the site around the journeys visitors actually arrive with — emergency, planned service, commercial, and existing-account.",
    "We'd organise the site around why someone actually showed up — an emergency, a planned job, a commercial enquiry, or an existing account — instead of one layout trying to serve all four.",
    "A visitor who has to work out which part of the site applies to them leaves before they find it. Structuring around their reason for being there is what gets them to the right action.",
    undefined
  ),
  item(
    'Mobile-first call flow',
    'essential',
    500,
    'Keeping the correct emergency phone number visible and one tap away on every page, on the screen size most visitors actually use.',
    "Wherever someone is on the site, on their phone, the right number to call is one tap away — no hunting through a menu while their basement floods.",
    "An emergency visitor decides in seconds. If the phone action isn't immediately visible on mobile, where most of this traffic lands, they call the next name on the list instead.",
    undefined
  ),
  item(
    'Guided intake',
    'essential',
    1100,
    'A short set of questions — incident or project type, location, urgency, key details, photos — collected before the job goes to dispatch or sales.',
    "Before it ever reaches you, we'd get the type of job, the location, how urgent it is, and any photos — so whoever picks it up already knows what they're walking into.",
    "Dispatch and sales currently spend the first few minutes of every call gathering the same basics. Collecting it up front shortens every single job by that much, for free, forever.",
    undefined
  ),
  item(
    'Booking and dispatch',
    'essential',
    1300,
    'Connecting urgent and scheduled requests to the correct team automatically, with a clear response-time expectation set for each.',
    "Urgent requests and scheduled ones stop competing for the same queue — each goes straight to the right team with the response time that request actually needs.",
    "Missed or misrouted jobs cost more than this line item in a single bad week. Getting the right job to the right team immediately is what a response-time promise actually depends on.",
    undefined
  ),

  // ---------- Trades / field-service: trust & compliance ----------
  item(
    'Trust architecture',
    'essential',
    650,
    'Surfacing reviews, licences, guarantees, case studies and response standards where a nervous visitor actually looks for them.',
    "You've already got the licences, the reviews and the track record — we'd just put them where someone deciding whether to trust you actually looks.",
    "Trust is the last thing standing between a visitor and picking up the phone. You already own the proof; this is the difference between it existing and it being seen.",
    undefined
  ),
  item(
    'Privacy and accessibility',
    'essential',
    600,
    'A credible compliance foundation for handling customer information and for mobile and assistive-technology usability.',
    "We bring the site up to a standard you can point to if a commercial or municipal customer ever asks how customer data and accessibility are handled.",
    "Cheap to build in now, expensive to bolt on later, and increasingly a checkbox commercial and public-sector customers actually ask about before signing.",
    undefined
  ),

  // ---------- B2B / industrial: upsells ----------
  item(
    'Quote-status dashboard',
    'upsell',
    2200,
    'A screen where customers can see whether a quote is under review, quoted, approved or in production.',
    "Customers can see exactly where their quote is — under review, quoted, approved, in production — without ringing to ask.",
    'Chasing calls consume sales time and irritate the customer doing the chasing. Visibility removes the call and makes you look markedly more professional than competitors who cannot offer it.',
    undefined
  ),
  item(
    'Distributor or rep portal',
    'upsell',
    3600,
    'A dedicated area for channel partners with their own resources, leads and quoting tools.',
    "Your distributors and reps get their own area with the resources, pricing and lead information they need, instead of emailing you for it.",
    'Channel partners sell more when they are equipped and self-sufficient. It also removes a steady stream of internal requests that currently interrupt the sales team.',
    undefined
  ),
  item(
    'Saved projects and BOMs',
    'upsell',
    1800,
    'Letting buyers save configurations and parts lists (a BOM is a bill of materials — the list of parts a job needs) to return to later.',
    "Engineers can save a configuration or parts list and come back to it, rather than starting from scratch every visit.",
    'Technical purchases take weeks and multiple visits. Losing their work between visits is a common reason buyers drift to a competitor whose site remembered them.',
    undefined
  ),
  item(
    'Parts and repeat ordering',
    'upsell',
    3000,
    'Letting existing customers reorder parts or consumables themselves without involving sales.',
    "Existing customers can reorder parts themselves, without tying up your sales team on repeat admin.",
    'Repeat orders are your highest-margin, lowest-effort revenue and they are currently capped by how many calls your team can answer. Self-service lifts that ceiling entirely.',
    undefined
  ),
  item(
    'Service and support dashboard',
    'upsell',
    2400,
    'A place for customers to log service requests and track them through to resolution.',
    "Service requests get logged and tracked in one place, so nothing gets lost and customers can see progress.",
    'Support handled over email has no record and no accountability. A tracked system reduces repeat contacts and gives you data on which products generate the most service load.',
    undefined
  ),
  item(
    'ERP or inventory integration',
    'upsell',
    3600,
    'Connecting the site to the system that runs stock, orders and production (an ERP is the central business system many manufacturers run on).',
    "The site connects to the system that actually runs your stock and orders, so what customers see reflects reality.",
    'Stopping quotes on unavailable stock avoids both a bad customer experience and wasted production planning. It is the item that makes everything else trustworthy.',
    '"Our ERP is old." — Most can still be connected. Worth checking before ruling it out.'
  ),
  item(
    'Training and resource platform',
    'upsell',
    1800,
    'A structured library of technical documentation, guides and training material.',
    "All your technical documentation and guidance in one organised place, rather than scattered across emails and PDFs.",
    'Buyers who can self-educate move faster and need less hand-holding. It also reduces the support burden of answering the same technical questions repeatedly.',
    undefined
  ),
  item(
    'Automated lifecycle messaging',
    'upsell',
    1400,
    'Automatic emails triggered by what a customer does — a quote going quiet, a service due, a part needing reordering.',
    "Automatic prompts at the right moments — a quote that has gone quiet, a service coming due, parts likely needing reordering.",
    'This is revenue you have already earned the right to. Reminding customers at the right moment costs nothing per message and recovers orders that would otherwise simply not happen.',
    undefined
  ),
  item(
    'Native or multi-platform app',
    'upsell',
    6000,
    'A proper phone or tablet app, downloaded from the app store, for customers or field staff.',
    "A proper app for your field team or customers — works offline, lives on the home screen, built for the job.",
    'Only worth it where people work somewhere a browser struggles — on site, offline, in a workshop. Where that is true it is transformative; where it is not, spend the money elsewhere.',
    '"Do we need an app?" — Be honest. If everything happens at a desk, say no and put the budget into the core build.'
  ),
];

/** A playbook row as the lead page consumes it. */
export interface PlaybookEntry {
  slug: string;
  label: string;
  kind: string;
  priceCents: number;
  whatItIs: string;
  benefit: string;
  pitch: string;
  justification: string;
  objection: string | null;
}

/** The lookup key: an item's name reduced to letters and digits. */
export function playbookSlug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Different dossiers name the same piece of work differently — "CRM lead
 * routing", "CRM and lead capture", "CRM setup". Without this they miss the
 * playbook entirely and the rep gets a line with no price, no explanation and
 * nothing to say, which is worse than not listing the item at all.
 */
const SLUG_ALIASES: Record<string, string> = {
  crmandleadcapture: 'crmleadrouting',
  crmleadcapture: 'crmleadrouting',
  crmcapture: 'crmleadrouting',
  crmsetup: 'crmleadrouting',
  crmandleadrouting: 'crmleadrouting',
  leadcapture: 'crmleadrouting',
  crmleadcapturesetup: 'crmleadrouting',
  analytics: 'analyticssetup',
  analyticsandtracking: 'analyticssetup',
  localseoandgooglebusinessprofile: 'localseo',
  googlebusinessprofile: 'localseo',
  seo: 'technicalseo',
  seosetup: 'technicalseo',
  onlinebooking: 'bookingorestimateworkflow',
  bookingsystem: 'bookingorestimateworkflow',
  mobilefirstdesign: 'mobileoptimisation',
  mobileoptimization: 'mobileoptimisation',
  copywriting: 'professionalcopywriting',
  websiteredesignandrebuild: 'websiteredesign',
};

/** Resolves an item's name to a playbook entry, allowing for naming drift. */
export function findPlaybookEntry(
  label: string,
  playbook: Map<string, PlaybookEntry>
): PlaybookEntry | null {
  const slug = playbookSlug(label);
  return playbook.get(slug) ?? playbook.get(SLUG_ALIASES[slug] ?? '') ?? null;
}

export interface PricedItem {
  point: string;
  explanation: string | null;
  entry: PlaybookEntry | null;
  /** Scaled to this lead's quote — null when the item isn't in the playbook. */
  priceCents: number | null;
  /** True when the price is ours to decide rather than one from the catalogue. */
  isCustom?: boolean;
}

/**
 * Prices a lead's line items so they add up to the figure being quoted.
 *
 * Every dossier lists the same items but quotes a different range, because
 * the range is set per business. Showing fixed catalogue prices against a
 * bespoke range means the itemised numbers contradict the headline — a rep
 * reading out "$6,250" above a list that sums to $8,200 loses the room.
 *
 * So playbook prices act as relative weights: the shape of the split is
 * ours, the total is whatever this lead is being quoted. Rounded to the
 * nearest £10 with the remainder pushed onto the largest item, so the column
 * always sums exactly rather than being one rounding step out.
 *
 * A point that arrived with its own recorded price is left exactly as it is
 * and taken out of the quote before the rest are scaled. That price was
 * either written into the sheet deliberately or agreed afterwards, and
 * silently stretching it to make a range balance would misquote the one
 * number somebody actually decided.
 */
export function priceToTotal(
  points: Array<{ point: string; explanation: string | null; priceCents?: number | null; isCustom?: boolean }>,
  playbook: Map<string, PlaybookEntry>,
  totalCents: number | null
): PricedItem[] {
  const items: PricedItem[] = points.map((p) => ({
    point: p.point,
    explanation: p.explanation,
    entry: findPlaybookEntry(p.point, playbook),
    priceCents: p.priceCents ?? null,
    isCustom: p.isCustom ?? false,
  }));

  // Fixed lines are already answered; only the unpriced remainder is up for
  // scaling, against whatever's left of the quote after they're taken out.
  const fixed = items.filter((i) => i.priceCents !== null);
  const remainingTotal =
    totalCents === null ? null : totalCents - fixed.reduce((s, i) => s + (i.priceCents ?? 0), 0);

  const priced = items.filter((i) => i.priceCents === null && i.entry);
  if (priced.length === 0) return items;

  // With no quote to hit, the catalogue price is the honest answer.
  if (!remainingTotal || remainingTotal <= 0) {
    for (const i of priced) i.priceCents = i.entry!.priceCents;
    return items;
  }

  // A zero-price entry is an umbrella line for the items beneath it, so it
  // must not absorb any of the quote — otherwise the parts silently shrink to
  // make room for a heading.
  const weight = priced.reduce((s, i) => s + i.entry!.priceCents, 0);
  if (weight <= 0) return items;

  for (const i of priced) {
    if (i.entry!.priceCents === 0) {
      i.priceCents = 0; // umbrella line — shown as "priced below", not $0
      continue;
    }
    const share = (i.entry!.priceCents / weight) * remainingTotal;
    i.priceCents = Math.round(share / 1000) * 1000; // nearest $10
  }
  const drift = remainingTotal - priced.reduce((s, i) => s + (i.priceCents ?? 0), 0);
  const biggest = priced
    .filter((i) => (i.priceCents ?? 0) > 0)
    .reduce((a, b) => ((a.priceCents ?? 0) >= (b.priceCents ?? 0) ? a : b), priced[0]);
  biggest.priceCents = (biggest.priceCents ?? 0) + drift;

  return items;
}

/**
 * "How does this help MY business?" — the question every line item gets on a
 * call, and the one a generic catalogue description never answers.
 *
 * `{company}` is substituted with the lead's actual name at render time, so
 * the answer names the business back to them instead of describing a
 * category. Written per item against the kind of business that item appears
 * for in the dossiers: the local-service items assume a trades or
 * home-services operator, the industrial ones assume a technical buyer with
 * a long purchase cycle.
 */
export const PLAYBOOK_BENEFITS: Record<string, string> = {
  // --- local service ---
  websiteredesign:
    "More of the people already finding {company} turn into actual enquiries. Same marketing, same traffic, more jobs — which is why it comes before spending a penny more on getting found.",
  mobileoptimisation:
    "The customers reaching {company} from a phone — which will be most of them — can actually get in touch without pinching and zooming. It also stops Google quietly ranking {company} lower for a bad phone experience.",
  servicepagestructure:
    "Each thing {company} does gets its own page, so someone searching for that exact job finds {company} instead of a competitor who happens to have a page for it.",
  qualifiedenquiryform:
    "Enquiries arrive at {company} ready to quote instead of as 'call me'. That's a couple of phone calls saved on every single job, and quotes going out same-day rather than three days later.",
  bookingorestimateworkflow:
    "{company} stops losing the evening and weekend enquiries entirely. Those people aren't waiting until Monday — they're ringing the next name on the list tonight.",
  localseo:
    "{company} shows up in the map results when someone nearby searches. That's the readiest-to-buy customer there is, and right now they're finding somebody else.",
  analyticssetup:
    "{company} finally knows which marketing actually produces work. That usually means cutting something that was never paying and putting the money where it does.",
  crmleadrouting:
    "No enquiry to {company} gets lost in somebody's inbox again. Following up stops depending on whoever happens to remember.",
  professionalcopywriting:
    "The words speak to what {company}'s customers are actually worried about, so a bigger share of the same visitors get in touch. It lifts every other thing on this list.",
  trustandproofsystem:
    "{company}'s reviews, guarantees and real job photos appear exactly where someone hesitates. The reputation already exists — this just stops it being invisible at the deciding moment.",
  customerportal:
    "{company}'s customers can check their own quote, job and paperwork instead of ringing to ask. It removes a whole category of unpaid admin, and makes {company} look considerably bigger than the competition.",
  reviewautomation:
    "Every completed job for {company} turns into a review request automatically, and unhappy customers get routed privately first. More reviews means better ranking and an easier sell on every future job.",
  smsfollowup:
    "Fewer no-shows for {company}, and quotes that went quiet get a nudge without anyone remembering to send it. Texts get read in minutes; emails often don't get read at all.",
  onlinepayments:
    "{company} takes the deposit the moment someone says yes, rather than invoicing and waiting. Better cash flow, and far fewer people going cold between agreeing and paying.",
  recurringserviceplans:
    "Some of {company}'s one-off customers become monthly income. That's what makes a quiet month survivable and what makes the business worth more if it's ever sold.",
  emailnurture:
    "The enquiries {company} didn't win aren't written off — they hear from {company} occasionally, so a slice of them come back later at no extra cost to acquire.",
  paidsearchlandingpages:
    "If {company} runs ads, more of that budget turns into enquiries instead of bouncing off a general page. It makes money already being spent work harder.",
  photoanddocumentuploads:
    "Customers send photos of the problem with the enquiry, so {company} can often quote without driving out. Every avoided site visit is hours back.",
  referralworkflow:
    "{company}'s happy customers become a steady source of new ones. Referred work costs nothing to win and closes far more easily than cold enquiries.",
  ongoinggrowthplan:
    "{company}'s site keeps improving rather than slowly falling behind, and there's a monthly report showing what changed and what it did.",

  // --- industrial / B2B ---
  productledwebsiteredesign:
    "{company}'s buyers can work out what they need themselves, the way technical buyers actually prefer to. Right now the ones who can't figure it out just leave, and {company} never even knows they existed.",
  guidedselectionsystem:
    "The sizing conversation {company}'s engineers currently have over email happens automatically. Buyers reach the right product with confidence, and engineering time goes to real opportunities instead of tyre-kickers.",
  structuredrfqwebapp:
    "Quote requests reach {company} complete — specifications, quantities, deadlines, drawings — so quoting starts immediately instead of after a week of chasing. Faster quotes win more of them.",
  securefileupload:
    "Drawings and parts lists arrive with the enquiry rather than in a chain of emails, so {company} can start quoting the same day. Handling them properly also matters to bigger buyers doing due diligence.",
  crmintegration:
    "Every enquiry becomes a tracked opportunity for {company} automatically, with the product interest attached. {company} can finally see conversion by product line instead of guessing at it.",
  analyticsandfunneltracking:
    "{company} sees which products get attention, where buyers give up, and which enquiries become orders — so marketing spend follows the lines that actually sell.",
  technicalseo:
    "{company} gets found for the specific technical terms buyers search. It's a small number of visitors, but in this industry one of them can be worth more than the entire project.",
  cmsanddatamigration:
    "{company}'s team can keep product information current without paying a developer for every change. It's the item that stops the site going stale in six months.",
  coreintegrations:
    "{company}'s systems stop needing the same information typed into them twice, and the numbers stop disagreeing between them. Less admin, and figures people can actually trust.",
  accessibilityandprivacy:
    "{company} meets the standards larger and public-sector buyers increasingly ask about in procurement. Cheap now, expensive to retrofit, and it protects deals rather than just reducing risk.",
  quotestatusdashboard:
    "{company}'s customers can see where their quote is without ringing to ask. It removes the chasing calls and makes {company} look far more organised than competitors who can't offer it.",
  distributororrepportal:
    "{company}'s distributors and reps get what they need themselves instead of emailing head office. Better-equipped partners sell more, and the internal interruptions stop.",
  savedprojectsandboms:
    "Engineers buying from {company} can save a configuration and come back to it. Technical purchases take weeks — losing their work between visits is a common reason they end up buying elsewhere.",
  partsandrepeatordering:
    "{company}'s existing customers reorder parts themselves. That's the highest-margin revenue there is, and it stops being capped by how many calls the team can answer.",
  serviceandsupportdashboard:
    "Service requests to {company} get logged and tracked rather than lost in email, and {company} gets data on which products generate the most support load.",
  erporinventoryintegration:
    "What {company}'s customers see reflects what's actually available, so quotes stop going out on stock that isn't there. It's what makes everything else on the site trustworthy.",
  trainingandresourceplatform:
    "{company}'s buyers can get themselves up to speed without hand-holding, which shortens the sale and cuts the same technical questions being answered over and over.",
  automatedlifecyclemessaging:
    "{company} gets prompted in front of customers at the moments that matter — a quote gone quiet, a service due, parts likely needing reordering. This is revenue {company} has already earned the right to.",
  nativeormultiplatformapp:
    "Only worth it if {company}'s people or customers work somewhere a browser struggles — on site, offline, in a workshop. Where that's true it changes how they work; where it isn't, that budget belongs in the core build.",

  // --- trades / field-service (emergency + scheduled) ---
  websiteandserviceroutingrebuild:
    "{company}'s emergency and scheduled visitors stop being funnelled through the same generic page. The urgent ones reach a phone number immediately; the routine ones reach an estimate flow — both convert better than one page trying to do both jobs.",
  websiterestructuring:
    "Visitors to {company} find the part of the site meant for them — emergency, planned service, commercial, or account — in one step instead of hunting through a generic menu.",
  mobilefirstcallflow:
    "{company} stops losing emergency calls to whoever's site made the phone number easiest to tap. On the phone screen most visitors are using, it's never more than one tap away.",
  guidedintake:
    "Every job reaching {company} arrives with the type, location, urgency and photos already attached, so dispatch or sales start working the job instead of interviewing the caller.",
  bookinganddispatch:
    "Urgent and scheduled requests to {company} stop competing in the same queue. Each reaches the right team immediately, which is what actually makes a response-time promise real.",
  trustarchitecture:
    "{company}'s licences, reviews and track record sit exactly where a nervous visitor is deciding whether to call. The proof already exists — this is what makes it visible at the moment it matters.",
  privacyandaccessibility:
    "{company} has a straight answer the next time a commercial or municipal customer asks how data and accessibility are handled — built in now, rather than retrofitted under pressure later.",
};

/** Fills {company} into a playbook line so it names the business back to them. */
export function personalise(text: string, company: string): string {
  return text.replace(/\{company\}/g, company);
}

/**
 * Inserts any PLAYBOOK_SEED item not yet in the database, keyed by slug.
 * Never touches an existing row, so an edit made in the database survives
 * every call. Takes a PrismaClient rather than importing it, so this stays
 * usable from both the app and standalone scripts without a circular import.
 */
export async function ensurePlaybookSeeded(prisma: {
  salesPlaybookItem: {
    createMany: (args: {
      data: Array<PlaybookSeedItem & { benefit: string }>;
      skipDuplicates: boolean;
    }) => Promise<unknown>;
  };
}): Promise<void> {
  await prisma.salesPlaybookItem.createMany({
    data: PLAYBOOK_SEED.map((item) => ({
      ...item,
      benefit: PLAYBOOK_BENEFITS[item.slug] ?? '',
    })),
    skipDuplicates: true,
  });
}
