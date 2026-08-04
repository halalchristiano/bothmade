// Dynamic agency services agreement, generated per-proposal. A fixed
// "skeleton" of core legal sections is always included; on top of that,
// specific clauses are appended only when the underlying add-on, service
// type, timeline, or client tier is actually selected on the onboarding
// form — so a simple website contract stays short, and a contract for a
// project with e-commerce, subscriptions, and an enterprise client tier
// picks up the extra clauses those things actually require.
//
// The agreement is drafted for a UK sole trader billing in USD under
// English law, in two variants sharing one skeleton: the default
// business-to-business form, and a consumer form (isConsumer) that swaps the
// cancellation and payment-consequence terms for ones compliant with the
// Consumer Contracts Regulations 2013 and the Consumer Rights Act 2015 —
// because a blanket "non-refundable" clause is simply void against a
// consumer, and a contract that pretends otherwise protects nothing.
//
// This is modeled on standard web/software agency contract structure. It is
// NOT a substitute for review by a lawyer licensed in your jurisdiction
// before it's treated as binding.

import { formatCents, formatCentsExact, instalmentSchedule, type CustomItem } from '@/lib/pricing';
import { COMPANY_EMAIL, LEGAL_NAME } from '@/lib/company';

/** One line of custom work as the contract states it: what it's called, what
 * it covers in the Agency's own words, and what it costs. */
export interface ContractCustomItem {
  label: string;
  description: string;
  /** Pre-formatted currency, e.g. "$4,000". */
  price: string;
}

/** Maps stored custom items into the shape the contract states them in. */
export function toContractCustomItems(items: CustomItem[]): ContractCustomItem[] {
  return items.map((item) => ({
    label: item.label,
    description: item.description,
    price: formatCents(item.priceCents),
  }));
}

/**
 * Only the items there is actually something to state.
 *
 * New proposals can't reach a contract with a blank description — the
 * dashboard and both admin routes refuse. But a proposal sent before that
 * rule existed still has a live sign-and-pay link, and the client clicking
 * it must get a working agreement rather than a section reading "Scope:"
 * with nothing after it. Those items stay priced and named in the fee
 * breakdown, exactly as they were when the link went out; what they don't
 * get is a scope clause promising a specificity that was never written.
 */
export function describedCustomItems(p: ContractParams): ContractCustomItem[] {
  return (p.customItems ?? []).filter((item) => item.description.trim().length > 0);
}

export interface ContractParams {
  company: string;
  contactName: string | null;
  serviceLabel: string;
  serviceDescription: string;
  addOnLabels: string[];
  addOnKeys: string[];
  /** Ad-hoc work quoted outside the catalogue. Each one gets its scope
   * written out verbatim in its own section — a catalogue add-on carries its
   * own definition, custom work carries only what was written down. */
  customItems?: ContractCustomItem[];
  baseServiceKey: string;
  clientTypeKey: string;
  timelineKey: string;
  timelineLabel: string;
  clientTypeLabel: string;
  basePrice: string; // pre-formatted currency
  addOnsPrice: string;
  totalPrice: string;
  /**
   * The Total Fee in cents. The formatted strings above are fine for quoting
   * back, but the instalment schedule and every worked figure in Sections 7-8
   * are arithmetic on this number — a client reading "40% of the Total Fee"
   * and a client reading "$8,000" are not being told the same thing, and only
   * one of them can check it without a calculator.
   */
  totalPriceCents: number;
  effectiveDate: string;
  /** Preview subdomain (e.g. "acme.bothmade.com"), where one has been assigned. */
  previewDomain?: string | null;
  /**
   * True where the Client is an individual contracting outside a business.
   * Swaps in the consumer cancellation and refund terms: the statutory
   * 14-day cancellation right cannot be excluded against a consumer, and a
   * contract that tried would lose the whole clause rather than win the
   * point. Defaults to the business form.
   */
  isConsumer?: boolean;
}

export interface ContractSection {
  heading: string;
  paragraphs: string[];
}

const ONGOING_CARE_KEYS = ['maintenance', 'growth-plan', 'hosting', 'onboarding-retainer'];
const GROWTH_KEYS = ['seo', 'blog', 'copywriting', 'growth-plan'];
const NATIVE_APP_KEYS = ['ios-app', 'macos-app', 'visionos', 'multi'];

function has(keys: string[], ...targets: string[]): boolean {
  return targets.some((t) => keys.includes(t));
}

/**
 * The one hourly rate in the agreement, doing three jobs: pricing the work
 * actually done when the Agency is the party that terminates, pricing
 * statutory pro-rata charging in the consumer variant, and giving both
 * documents a single published number instead of a derivation. $150/hr sits
 * mid-band for agency work — defensible from published benchmarks without
 * looking like the charge is doing something other than recovering cost.
 */
export const AGENCY_RATE_CENTS = 15_000;

/** Flat administration charge on unwinding a prepayment — cost recovery, not revenue. */
export const PREPAYMENT_ADMIN_FEE_CENTS = 25_000;

/** Notice the Agency gives before planned absence, in Business Days. */
export const ABSENCE_NOTICE_BUSINESS_DAYS = 10;

/** A single absence longer than this earns Care Plan clients a pro-rata credit. */
export const ABSENCE_CREDIT_THRESHOLD_BUSINESS_DAYS = 10;

function money(cents: number): string {
  // Exact, because these figures are multiplied and summed by the reader: a
  // contract whose three instalments visibly don't add up to its own total
  // is the kind of document a finance department bounces.
  return formatCentsExact(cents);
}

const AGENCY_RATE = `${formatCents(AGENCY_RATE_CENTS)} per hour`;

/** The always-present core of the agreement — applies to every engagement regardless of what was selected. */
function buildSkeleton(p: ContractParams, addOnList: string): ContractSection[] {
  const schedule = instalmentSchedule(p.totalPriceCents);
  const [first, second, third] = schedule;
  const consumer = p.isConsumer === true;

  return [
    {
      heading: 'Recitals',
      paragraphs: [
        'WHEREAS, the Agency is in the business of providing web and native application design, development, and related digital services;',
        `WHEREAS, the Client wishes to engage the Agency to design, build, and deliver ${p.serviceLabel.toLowerCase()} and the associated add-on services described below, and the Agency wishes to accept such engagement, on the terms and subject to the conditions set out in this Agreement;`,
        'NOW, THEREFORE, in consideration of the mutual covenants set forth in this Agreement, the Parties agree as follows.',
      ],
    },
    {
      heading: '1. Definitions',
      paragraphs: [
        '"Agreement" means this Project Agreement, together with all Exhibits and any Change Orders.',
        `"Agency Rate" means ${AGENCY_RATE}, the Agency's standard rate for valuing time worked wherever this Agreement requires it.`,
        '"Business Day" means any day other than a Saturday, Sunday, or public holiday in England.',
        '"Care Plan" means any ongoing monthly service the Client has selected — a Maintenance Plan, Growth Plan, Managed Hosting, or Onboarding & Support Retainer.',
        '"Change Order" means a written amendment to the scope of the Project under Section 9.',
        '"Client Dependencies" means any content, access, approvals, or feedback the Client must provide under Section 6.',
        '"Deliverable(s)" means any design file, source code, document, or other work product the Agency produces under this Agreement.',
        '"Design Approval" means the Client\'s written approval of the design under Section 4, including deemed approval where the Review Period lapses without a response.',
        '"Fees" means all amounts payable by the Client under this Agreement.',
        '"Instalment" means one of the scheduled payments set out in Section 7 and Exhibit B, always identified by its position — "Payment 1 of 3", "Payment 2 of 3", "Payment 3 of 3".',
        '"Kickoff Date" has the meaning given in Section 5. It is also the "Project Start Date" wherever that term is used, and is the date from which the Project timeline runs.',
        '"Milestone" means a defined stage of the Project — Discovery, Design, Build, or Launch — described in Section 5 and Exhibit A.',
        '"Preview Environment" means any Agency-controlled staging address, including a subdomain of a domain the Agency owns, on which Deliverables are made available for review under Section 4.',
        '"Ready for Launch" means the state in which the Project is complete on the Preview Environment — agreed revisions incorporated, internal testing done — and the Agency has confirmed in writing through the dashboard that it is ready to go live.',
        '"Requirements Sign-off" means the Client\'s written approval of the requirements summary under Section 5, which closes Discovery and fixes the scope.',
        '"Total Fee" means the aggregate fee for the Project set out in Section 7, exclusive of later Change Orders.',
        '"Warranty Period" has the meaning given in Section 16.',
      ],
    },
    {
      heading: '2. Parties and Capacity',
      paragraphs: [
        `This Project Agreement (the "Agreement") is entered into as of ${p.effectiveDate} (the "Effective Date") by and between ${LEGAL_NAME} ("the Agency") and ${p.company} ("the Client").`,
        `${p.contactName ? `The Client's primary point of contact is ${p.contactName}, who represents that they have authority to bind the Client to this Agreement.` : 'The Client represents that the individual executing this Agreement has authority to bind the Client to its terms.'}`,
        ...(consumer
          ? [
              'The Client enters this Agreement as a consumer — an individual acting wholly or mainly outside any trade, business, craft, or profession. Nothing in this Agreement excludes or restricts any right the Client has under consumer protection law that cannot lawfully be excluded, including the cancellation rights set out in Section 8, and if any term of this Agreement conflicts with such a right, the right prevails.',
            ]
          : [
              'The Client warrants that it enters this Agreement in the course of a trade, business, craft, or profession, and not as a consumer. The pricing, payment structure, and cancellation terms of this Agreement were set on the basis of that warranty. If the Client is in fact an individual contracting as a consumer, the Client must tell the Agency before signing, so the correct form of agreement — which carries the statutory cancellation rights consumer law requires — can be issued instead.',
            ]),
        'This Agreement supersedes any prior proposals, quotes, or correspondence relating to the Project, except where expressly incorporated by reference in writing. By making the first Instalment payment referenced in Section 7, or providing written acceptance, the Client agrees to be bound by this Agreement in full.',
      ],
    },
    {
      heading: '3. Scope of Work',
      paragraphs: [
        `The Agency agrees to design, develop, and deliver the following: ${p.serviceLabel}. ${p.serviceDescription}`,
        `The following add-ons are included in this engagement: ${addOnList}.`,
        ...(describedCustomItems(p).length > 0
          ? [
              'This engagement also includes custom work quoted specifically for the Client rather than drawn from the Agency\'s standard catalogue. Each such item, and the scope it covers, is set out in full in the section titled "Custom Work — Agreed Scope" below, which forms part of this Section 3.',
            ]
          : []),
        `The Client has been classified as "${p.clientTypeLabel}" for this engagement, which affects pricing and process overhead but does not by itself expand or restrict the Deliverables.`,
        'The scope is fixed at Requirements Sign-off under Section 5. Any feature, page, or functionality not explicitly listed in this Section, the signed-off requirements summary, Exhibit A, or the written scope documentation is out of scope, and the Agency is under no obligation to perform out-of-scope work absent a signed Change Order under Section 9.',
        'Where the Project integrates with third-party services or infrastructure not owned by the Agency, the Agency is not responsible for outages, policy changes, or deprecations imposed by those third parties, and accommodating such changes after delivery is billable as a Change Order.',
      ],
    },
    {
      heading: '4. Deliverables, Acceptance, and the Preview Environment',
      paragraphs: [
        `Deliverables are provided through the Bothmade client dashboard, and where the Agency considers it useful for review, on a Preview Environment${p.previewDomain ? ` — for this Project, ${p.previewDomain}` : ' hosted on a subdomain of a domain the Agency controls'}. A Preview Environment is a review tool, not the delivered product: it carries no uptime, performance, or availability commitment, is excluded from the warranty in Section 16, may be rebuilt or taken down as work proceeds, and is removed thirty (30) days after Launch or termination.`,
        'The Client will not share a Preview Environment address publicly, use it to serve its own customers, or deploy it for commercial purposes before payment in full, and the Agency may restrict it to authenticated dashboard users and exclude it from search engine indexing.',
        'While any Instalment that has fallen due remains unpaid, Deliverables remain available to view and review — in the dashboard and on any Preview Environment — but are not available for download, export, deployment, or transfer. The Client can always see exactly what has been produced; what waits for payment is taking it. This is the mechanism behind Section 7\'s rule that nothing is handed over before the final Instalment clears.',
        'The Client has five (5) Business Days from when a Deliverable is made available to provide written feedback (the "Review Period"); absent a response, the Deliverable is deemed accepted. A Deliverable is "made available" when it can be viewed — whether in the dashboard or on a Preview Environment — and the Review Period runs from that point whether or not the Client is entitled to download or export it at the time.',
        'Deemed acceptance applies to the design as it does to any other Deliverable: where the Client does not respond to the presented design within the Review Period, Design Approval has occurred for the purposes of Sections 5 and 7, including the second Instalment falling due. A Client who wants more time to review need only say so in writing before the Review Period lapses, and the Parties will agree a reasonable extension.',
        'Acceptance criteria are limited to conformance with the written scope in Section 3, the signed-off requirements summary, Exhibit A, and any mutually agreed specifications. Subjective preferences not reflected in agreed specifications do not constitute grounds for rejecting a Deliverable, though the Agency will accommodate such feedback within the standard revision allowance.',
        'Each major Milestone includes up to two (2) rounds of revisions at no additional charge for changes consistent with the originally agreed scope; additional or materially different revisions are billable as a Change Order.',
        'Final acceptance of the Project occurs upon the Client\'s written acknowledgment of Launch, or upon the Project going live, whichever occurs first.',
      ],
    },
    {
      heading: '5. Project Timeline, Kickoff, and Sign-off Gates',
      paragraphs: [
        `The Parties have agreed to a target timeline of ${p.timelineLabel}. That timeline does not begin on the Effective Date, on signature, or on payment alone. It begins on the "Kickoff Date," which is the later of the following two events — both are required, and neither on its own starts the clock:`,
        `(a) First Instalment cleared: Payment 1 of ${first.count} (${money(first.amountCents)}) has been received and cleared by the Agency's payment processor, which the dashboard records with a date; and`,
        '(b) Inputs signed off: the Agency has confirmed in writing, through the dashboard, that it has received every Client Dependency under Section 6 needed to begin Discovery — content, credentials, access, brand assets, and a named point of contact — and that the Project is ready to start.',
        'Where the payment clears first, the timeline does not start until the Agency confirms inputs are complete; where inputs are complete first, the timeline does not start until the payment clears. The Agency will not unreasonably withhold or delay the confirmation in (b), and will tell the Client specifically what is outstanding where it does. The dashboard record of the Kickoff Date is the operative date for Sections 5, 6, 8, and 10.',
        'Discovery concludes with a written requirements summary presented through the dashboard for Requirements Sign-off. The Review Period in Section 4 applies: approval, or five (5) Business Days of silence, closes Discovery and fixes the scope. From that point, changes travel through Section 9 as Change Orders rather than through conversation. This gate exists for both Parties — it is the moment the Client knows exactly what is being built, and the moment the Agency knows exactly what it has promised.',
        'Design then proceeds to a presented design concept and Design Approval under Section 4. Design Approval is the trigger for the second Instalment under Section 7, and Build begins once that Instalment is received.',
        'This timeline is a good-faith estimate, not a guaranteed delivery date, unless the Parties separately and explicitly agree in writing to a fixed date with associated penalty terms. Time is not "of the essence" for purposes of this Agreement absent such a separate written agreement.',
        'The Agency will notify the Client as soon as it becomes aware that a Milestone is at risk, together with a revised estimate where possible. Milestones generally follow Discovery, Design, Build, and Launch, as further itemized in Exhibit A.',
      ],
    },
    {
      heading: '6. Client Responsibilities and Dependencies',
      paragraphs: [
        'The Client will provide, in a timely manner, all content, credentials, access, approvals, and feedback reasonably required to perform the Project (collectively, "Client Dependencies"), and will designate a single authorized point of contact.',
        'Delays in providing a Client Dependency extend the Project timeline on a day-for-day (or greater) basis and do not constitute Agency delay for purposes of Section 10 or Section 8.',
        'Where the Client fails to provide a Client Dependency for more than fifteen (15) consecutive Business Days after being asked, the Agency may pause the Project with the timeline extended accordingly, proceed using reasonable assumptions (with resulting rework billed as a Change Order), or treat the Project as suspended by the Client, with Fees for work completed becoming due.',
      ],
    },
    {
      heading: '7. Fees, Instalments, and Payment',
      paragraphs: [
        `The total fee for this engagement is ${p.totalPrice}, comprising ${p.basePrice} for the base service and ${p.addOnsPrice === '$0' ? 'no additional add-on fees' : `${p.addOnsPrice} for the selected add-ons`}. All Fees are stated and payable in United States dollars (USD).`,
        `The Total Fee is paid in ${first.count} Instalments, each tied to a gate both Parties can see in the dashboard:`,
        `Payment 1 of ${first.count} — ${money(first.amountCents)} (${first.percent}% of the Total Fee), due on signing. Work is scheduled once it is received, and the Kickoff Date under Section 5 cannot occur before it clears.`,
        `Payment 2 of ${second.count} — ${money(second.amountCents)} (${second.percent}% of the Total Fee), due on Design Approval, including deemed approval under Section 4. It is invoiced on the day of approval and payable within fourteen (14) days; the Agency is not required to begin Build before it is received, and the timeline extends by any gap between approval and payment.`,
        `Payment 3 of ${third.count} — ${money(third.amountCents)} (${third.percent}% of the Total Fee), due when the Project is Ready for Launch. It is invoiced at that point and payable within fourteen (14) days. Nothing goes live, no files or source transfer, no credentials hand over, and no intellectual property assigns until it has cleared: the finished Project is visible in full on the Preview Environment while the Client decides to pay, which is exactly the order of events both Parties want in writing.`,
        `Instalments are invoiced individually, each identified by its position in the schedule, and Exhibit B restates the full schedule in one place. Where the Client chooses to pay ahead of schedule — including paying the Total Fee in full at signing — the later gates still apply to delivery, and Section 8(${consumer ? 'e' : 'd'}) governs what happens to prepaid amounts if the Project ends early.`,
        `The Agency is not registered for VAT, and no VAT is charged on or added to the Fees. If the Agency becomes required to register for VAT, VAT will be added to invoices issued after registration only where the law requires it, and the Client will be told before it first appears.`,
        ...(consumer
          ? [
              'Payments not received within seven (7) days of their due date are late. The Agency may pause work without penalty until payment is current, and may charge interest on overdue sums at 4% per annum above the Bank of England base rate, accruing daily.',
            ]
          : [
              'Payments not received within seven (7) days of their due date are late. The Agency may pause work without penalty until payment is current, and overdue sums carry statutory interest and fixed compensation under the Late Payment of Commercial Debts (Interest) Act 1998 — currently 8% per annum above the Bank of England base rate — which applies by law to commercial debts and does not depend on this Agreement to exist.',
            ]),
        'An Instalment that has fallen due before any cancellation or termination notice is given remains payable notwithstanding that notice, as Section 8 sets out.',
        'Payments made via a Bothmade-generated payment link are processed by Stripe, Inc. under Stripe\'s own terms; the Agency does not store or have access to the Client\'s card details.',
      ],
    },
    consumer ? buildConsumerRefunds(p, schedule) : buildBusinessRefunds(p, schedule),
    {
      heading: '9. Change Orders and Scope Changes',
      paragraphs: [
        'Work requested that is not included in the scope in Section 3, the signed-off requirements summary, and Exhibit A — new features, pages, integrations, or substantial revisions to accepted Deliverables — is scoped and quoted separately as a "Change Order," and no such work begins until the Client approves the additional scope and fee in writing.',
        'Scope can move down as well as up. Where the Client asks to remove an add-on or separately priced item before any work on it has begun, the Total Fee reduces by that item\'s listed price, recorded as a Change Order, and later Instalments recalculate accordingly. Once work on an item has begun, its price is committed: removing it no longer reduces the Fee, though the Agency will deliver whatever of it exists.',
        'Change Orders extend the Project timeline by an amount reasonably determined by the Agency, and such extensions are not Agency delay for purposes of Section 10. Where a Change Order requires re-architecting completed work, the quote reflects that rework cost in addition to the new feature.',
      ],
    },
    {
      heading: '10. Delays and Extensions',
      paragraphs: [
        'The Project timeline is extended, without penalty to the Agency, for delay attributable to: (a) Client Dependencies not met on schedule; (b) Change Orders; (c) third-party services or infrastructure outside the Agency\'s control; (d) Force Majeure Events under Section 19; (e) any period during which Client payment is overdue; or (f) Agency absence notified under Section 11.',
        'Where a delay is solely and directly attributable to the Agency\'s own scheduling (and none of the causes above), the Client\'s sole remedy is set out in Section 8 (Agency default) — the Client is not entitled to consequential damages, lost profits, or the cost of a replacement vendor, subject to Section 17 (Limitation of Liability).',
      ],
    },
    {
      heading: '11. Agency Availability, Holidays, and Illness',
      paragraphs: [
        'The Agency is a small studio, and says so rather than drafting around it. Planned absence — holidays, conferences, scheduled time away — is notified to the Client in writing at least ten (10) Business Days in advance, and the Project timeline extends day-for-day for the notified period. An absence notified this way is an agreed extension under Section 10, not Agency delay.',
        'Illness, injury, or emergency cannot be notified in advance; the Agency will notify the Client as soon as reasonably practicable, and the same day-for-day extension applies from the start of the absence.',
        'Where the Client has an active Care Plan, response-time commitments are paused during a notified absence. If a single absence exceeds ten (10) consecutive Business Days, the Client receives a pro-rata credit of that Care Plan\'s monthly fee for the availability not provided, applied to the next monthly invoice — the Client should not pay for availability that was not there.',
        'An absence, of whatever length or cause, is not by itself a breach of this Agreement. Where an absence is long enough to engage the Force Majeure provisions of Section 19, those apply, including the right of either Party to terminate if it continues beyond sixty (60) days.',
      ],
    },
    {
      heading: '12. Termination',
      paragraphs: [
        'Either Party may end the Project before completion by written notice. The financial consequences are set out exclusively in Section 8 — whichever Party gives notice — and no cancellation charge, fee, or damages arise from the ending of the Project itself beyond what that Section provides.',
        'On any termination the Agency will deliver the Deliverables paid for in their then-current state, together with the source, credentials, and documentation within scope for the work paid for. Any Preview Environment stays available for thirty (30) days from termination so the Client can retrieve what is theirs, then comes down.',
        'Either Party may terminate immediately for a material breach the other Party fails to cure within fifteen (15) Business Days of written notice describing the breach. The Agency may also terminate immediately, without further delivery obligation, if any Instalment remains overdue more than thirty (30) days past its due date.',
        'Either Party may terminate immediately by written notice if the other becomes unable to pay its debts as they fall due, enters bankruptcy, administration, receivership, liquidation, or any arrangement with creditors, or suffers any analogous event in any jurisdiction. Termination under this paragraph is treated, for Section 8, as termination by the insolvent Party.',
        'Sections 1, 7 (as to amounts due), 8, 13 (as to ownership of unpaid work), 14, 15, 16, 17, 18, and 20 survive termination for any reason.',
      ],
    },
    {
      heading: '13. Intellectual Property and Ownership',
      paragraphs: [
        'Upon payment in full for the applicable Deliverable — for the Project as a whole, upon clearance of the final Instalment — the Agency assigns to the Client all right, title, and interest in the final delivered work product created specifically for the Client, excluding Agency Background IP.',
        'Until paid in full, all work product remains the Agency\'s sole property and the Client is granted no license to use, deploy, or exploit it. This is the legal half of the arrangement whose practical half is in Section 4: review is never withheld, taking is what waits for payment.',
        '"Agency Background IP" means tools, libraries, frameworks, or components the Agency developed before or independently of this engagement, or of general applicability beyond this Project; the Agency retains all rights to it, and grants the Client a non-exclusive, perpetual, royalty-free license to use any Agency Background IP incorporated into the delivered work.',
        'The Client grants the Agency a limited, non-exclusive license to use the Client\'s name, logo, and a description of the Project for the Agency\'s own portfolio and marketing, unless the Client requests otherwise in writing (see also Section 21, Publicity).',
        'Where the Project incorporates third-party software, fonts, or stock imagery, the Client\'s rights are subject to the applicable third-party license, and the Agency makes no representation those licenses are perpetual or free of ongoing fees beyond what has been disclosed.',
      ],
    },
    {
      heading: '14. Confidentiality',
      paragraphs: [
        'Each Party will hold the other\'s Confidential Information in confidence and not disclose it to a third party without prior written consent, except as required to perform this Agreement or by law.',
        '"Confidential Information" excludes information that is or becomes public through no fault of the receiving Party, was already known to it, is independently developed, or is rightfully received from a third party without restriction. This obligation survives termination for three (3) years, except trade secrets, which remain protected as long as they qualify as such under applicable law.',
      ],
    },
    {
      heading: '15. Data Protection',
      paragraphs: [
        'Both Parties will comply with applicable data protection law, including the UK GDPR and the Data Protection Act 2018, in connection with this Agreement.',
        'Where the Agency processes personal data on the Client\'s behalf in the course of the Project — end-user enquiries submitted through forms the Agency builds and hosts, account data in systems the Agency operates for the Client, analytics the Agency configures — the Agency acts as the Client\'s processor and the Client is the controller. The processing terms required by Article 28(3) UK GDPR are set out in Exhibit D (Data Processing Addendum), which forms part of this Agreement.',
        'For personal data each Party holds about the other\'s own personnel and contacts for the purposes of managing this relationship — names, emails, billing details — each Party is an independent controller of its own records.',
        'The Agency will notify the Client without undue delay on becoming aware of a personal data breach affecting personal data it processes on the Client\'s behalf, and will provide reasonable assistance with the Client\'s own obligations to assess and report it.',
      ],
    },
    {
      heading: '16. Warranties and Disclaimers',
      paragraphs: [
        'The Agency warrants it will perform services with reasonable skill and care, consistent with generally accepted industry standards, and will correct, at no charge, any defect causing a Deliverable to fail to conform to the agreed scope for thirty (30) days following final delivery (the "Warranty Period") — excluding defects caused by Client or third-party modification after delivery, or by issues in infrastructure the Agency does not manage.',
        consumer
          ? 'Nothing in this Agreement affects the Client\'s statutory rights as a consumer, including the rights under the Consumer Rights Act 2015 to services performed with reasonable care and skill, and to repeat performance or a price reduction where they are not.'
          : 'EXCEPT AS EXPRESSLY SET OUT ABOVE, THE DELIVERABLES ARE PROVIDED "AS IS," AND THE AGENCY DISCLAIMS ALL OTHER WARRANTIES, EXPRESS, IMPLIED, OR STATUTORY, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT, TO THE MAXIMUM EXTENT PERMITTED BY LAW.',
        'Absent an active Care Plan, the Agency has no obligation to provide updates, patches, or compatibility fixes after the Warranty Period expires.',
      ],
    },
    {
      heading: '17. Limitation of Liability',
      paragraphs: [
        'Nothing in this Agreement limits or excludes either Party\'s liability for death or personal injury caused by its negligence, for fraud or fraudulent misrepresentation, or for any other liability that cannot lawfully be limited or excluded.',
        'Subject to that, neither Party is liable for any indirect or consequential loss, loss of profits, loss of revenue, loss of data, or loss of anticipated savings arising out of this Agreement, however arising, even if advised of the possibility of such loss.',
        'Subject to the first paragraph of this Section, the Agency\'s total aggregate liability under or in connection with this Agreement will not exceed the total Fees actually paid by the Client in the twelve (12) months preceding the event giving rise to the claim. The Fees charged reflect this allocation of risk, and the Parties agree it is reasonable for an engagement of this size and nature.',
      ],
    },
    {
      heading: '18. Indemnification',
      paragraphs: [
        'The Client indemnifies the Agency against third-party claims arising from: (a) content or materials the Client provided; (b) the Client\'s use of the delivered product in violation of law; or (c) the Client\'s breach of this Agreement.',
        'The Agency indemnifies the Client against claims that the Agency\'s Background IP, as incorporated into the delivered work, directly infringes a third party\'s valid IP rights, provided the Client promptly notifies the Agency and cooperates in its defense — excluding claims arising from Client-provided content or the Client\'s post-delivery modifications.',
      ],
    },
    {
      heading: '19. Force Majeure',
      paragraphs: [
        'Neither Party is liable for delay or failure to perform (other than payment obligations) caused by events beyond its reasonable control — acts of God, natural disaster, war, government action, pandemic, failure of a third-party provider, or the serious illness or incapacity of a person essential to performance. The affected Party will notify the other promptly and resume performance as soon as practicable; if the event continues beyond sixty (60) days, either Party may terminate under Section 12, with the financial consequences following Section 8 as if the affected Party had given notice.',
      ],
    },
    {
      heading: '20. Governing Law and Disputes',
      paragraphs: [
        consumer
          ? 'This Agreement is governed by the law of England and Wales, and the courts of England and Wales have jurisdiction — except that, as a consumer, the Client may also rely on mandatory consumer protections of, and bring or defend proceedings in, the country of the Client\'s own residence where the law gives that right.'
          : 'This Agreement is governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction over any dispute arising out of or in connection with it, including non-contractual disputes.',
        'Before either Party issues proceedings, the Parties will attempt good-faith negotiation for at least fifteen (15) Business Days from one Party\'s written description of the dispute to the other. Either Party may nevertheless apply to court at any time for injunctive or interim relief to protect its intellectual property or Confidential Information.',
        'Each Party bears its own costs except where a court awards otherwise.',
      ],
    },
    {
      heading: '21. Publicity and Testimonial Thank-You',
      paragraphs: [
        'Beyond the general portfolio license in Section 13, the Agency may, with the Client\'s consent (not to be unreasonably withheld), publish a more detailed case study. Neither Party will issue a press release naming the other without prior written consent, except as already permitted above.',
        'After Launch, the Client may — entirely at its option — provide a written testimonial for the Agency\'s own marketing: the Bothmade website, case studies, and sales materials. In thanks, the Agency will provide one (1) additional month of its standard Maintenance Plan at no charge, added to any Care Plan the Client has or provided standalone if it has none. The testimonial must simply be the Client\'s honest opinion: the offer is not conditioned on what it says, nothing about the Project is withheld or delayed pending it, and it has no connection to reviews on any third-party platform, which the Agency neither pays nor rewards for.',
      ],
    },
    {
      heading: '22. Non-Solicitation',
      paragraphs: [
        'During the term and for twelve (12) months after, the Client will not directly solicit or hire an Agency employee or contractor materially involved in the Project without the Agency\'s written consent. Breach entitles the Agency to liquidated damages equal to 25% of the hired individual\'s first-year compensation, without prejudice to injunctive relief.',
      ],
    },
    {
      heading: '23. Assignment, Notices, and Miscellaneous',
      paragraphs: [
        'Neither Party may assign this Agreement without the other\'s written consent, except in connection with a merger, acquisition, incorporation of the Agency\'s business, or asset sale, provided the assignee agrees in writing to be bound.',
        `Notices are delivered by email — to the Agency at ${COMPANY_EMAIL}, and to the Client at the address on its Bothmade account — deemed given upon transmission or, absent confirmation, the next Business Day.`,
        'This Agreement, with its Exhibits and any Change Orders, is the entire agreement between the Parties and supersedes all prior discussions. It may only be amended in writing signed (including electronically) by both Parties. If a provision is found unenforceable, it will be limited to the minimum extent necessary and the remainder stays in force. Failure to enforce a provision is not a waiver of it or any other provision.',
        'This Agreement may be executed in counterparts, including by electronic signature or by the act of making the first Instalment payment, each deemed an original.',
      ],
    },
  ];
}

/**
 * Section 8, business form. The deliberate shape: no cooling-off window, no
 * refund arithmetic on an ordinary cancellation — the instalment schedule
 * itself is the protection, and every instalment is earned when paid because
 * each one is tied to a gate the Client signed off. The clauses that follow
 * are the honest edges of that rule: debts that already crystallised,
 * prepayments, scope drops, third-party costs, and the mirror case where the
 * Agency is the one leaving.
 */
function buildBusinessRefunds(
  p: ContractParams,
  schedule: ReturnType<typeof instalmentSchedule>
): ContractSection {
  return {
    heading: '8. Cancellation and Refunds',
    paragraphs: [
      'Refunds and the financial consequences of the Project ending early are governed exclusively by this Section, which controls over any general expectation of refund availability.',
      '(a) Cancellation by the Client. The Client may end the Project at any time by written notice. There is no cooling-off period: each Instalment is tied to a gate the Client has already passed — signing, Design Approval, Ready for Launch — so every Instalment paid has been earned by the work behind its gate, is non-refundable, and nothing further is owed beyond what paragraph (b) preserves. This is the whole of the ordinary case: what has been paid stays paid, and what has not fallen due is never billed.',
      '(b) Amounts already due survive. An Instalment or other Fee that fell due before the Client\'s notice was given remains payable in full. The work that triggered it was finished and accepted before any notice existed; cancelling afterwards does not erase a debt that had already crystallised. For clarity: cancelling between Design Approval and payment of Payment 2 does not avoid Payment 2.',
      `(c) What the Client keeps. On cancellation the Client receives every Deliverable whose Instalment has been paid, in its then-current state, and Section 13 applies to ownership. Work whose gate was never reached is not delivered and is never charged for.`,
      `(d) Prepayments. Where the Client paid ahead of the schedule — including paying the Total Fee of ${p.totalPrice} in full at signing — and the Project ends before the later gates are reached, the Agency retains what the schedule in Section 7 would have entitled it to at the point notice was given, and refunds the remainder, less any non-recoverable payment-processor fees on the refunded amount and a fixed administration charge of ${money(PREPAYMENT_ADMIN_FEE_CENTS)}. Prepaying is a cash-flow convenience, not a change in what is earned.`,
      '(e) Scope reductions. Removing an add-on or separately priced item is a Change Order under Section 9, not a cancellation: untouched items come off the Total Fee, started items do not, and later Instalments recalculate.',
      '(f) Third-party costs. Non-recoverable third-party costs the Agency committed for the Project — domain registrations, licenses, stock assets — are deducted from any refund in whichever direction it flows, itemized in writing, and the Client receives the asset itself (the domain transfers; licenses assign where their terms allow).',
      `(g) Termination by the Agency, and Agency default. Where the Agency terminates for convenience under Section 12, or the Client terminates for the Agency's uncured material breach or its default under (h), the position reverses: the Agency retains only the value of time actually worked on the Project at the Agency Rate (${AGENCY_RATE}), evidenced by a written time record provided to the Client, plus non-recoverable third-party costs under (f), and refunds everything paid above that. No gate-based retention applies — the Agency does not keep money tied to gates when the Agency is the reason later gates will never be reached.`,
      '(h) Abandonment. Where the Agency ceases substantive work for more than forty-five (45) consecutive days without a Client-caused reason, a notified absence under Section 11, or reasonable communication, the Client may issue written notice of default. If the Agency does not resume work or provide a remediation plan within fifteen (15) Business Days, the Client may terminate and be refunded on the basis in (g).',
      '(i) Timeline overruns. A timeline running longer than projected does NOT, on its own, entitle the Client to a refund, provided the Agency continues to work in good faith and has not abandoned the Project — particularly where delay is caused or contributed to by Client Dependencies (Section 6), scope changes (Section 9), or third-party dependencies (Section 3).',
      '(j) Completed and accepted Deliverables are not refundable except for the Agency\'s gross negligence or willful misconduct in producing that specific Deliverable.',
      '(k) Chargebacks. Initiating a card chargeback in lieu of the process in this Section is a material breach and may result in immediate suspension of Deliverables, Preview Environments, and dashboard access; the Agency may contest any chargeback with evidence of work performed and the gates passed.',
      '(l) Mechanics. A refund due under this Section is processed to the original payment method within fifteen (15) Business Days of the amount being agreed or determined. An amount due from the Client is payable within fifteen (15) Business Days of the Agency\'s written statement of it. Every settlement under this Section is stated as two lines — amount due from the Client, and amount returned to the Client — at least one of which is always zero.',
      '(m) Sole remedy. This Section is the Client\'s sole and exclusive remedy for dissatisfaction with the pace, quality, or outcome of the Project, except where a separate remedy is expressly provided elsewhere in this Agreement or required by law that cannot be excluded.',
    ],
  };
}

/**
 * Section 8, consumer form. The Consumer Contracts Regulations 2013 give an
 * individual a 14-day cancellation right on a distance contract that no
 * drafting removes, and charging anything during it requires the consumer's
 * express request to start early. So the consumer form says exactly that,
 * charges pro-rata at the published Agency Rate, and drops the gate-based
 * retention entirely — a term a court would strike as unfair protects
 * nothing and endangers its neighbours.
 */
function buildConsumerRefunds(
  p: ContractParams,
  schedule: ReturnType<typeof instalmentSchedule>
): ContractSection {
  const first = schedule[0];
  return {
    heading: '8. Your Right to Cancel, and Refunds',
    paragraphs: [
      'This Section governs cancellation and refunds. Nothing in it takes away rights the Client has by law that cannot be excluded; where the law gives more, the law wins.',
      `(a) The 14-day cancellation period. The Client may cancel this Agreement, without giving any reason, within fourteen (14) days of the Effective Date. To cancel, the Client need only send a clear written statement to ${COMPANY_EMAIL} before the period expires — no special form is required. This is the statutory cancellation right under the Consumer Contracts Regulations 2013.`,
      `(b) Starting early. By signing and paying Payment 1 of ${first.count}, the Client expressly requests that the Agency begin work during the cancellation period rather than waiting for it to expire, and acknowledges that cancelling after making that request means paying for what was supplied before cancellation, as (c) describes.`,
      `(c) Cancelling within the period. If the Client cancels within the 14 days, the Agency refunds everything paid, less an amount for the services actually supplied up to the moment of cancellation, calculated as time worked at the Agency Rate (${AGENCY_RATE}) and evidenced by a written time record — capped so the deduction never exceeds the share of the Total Fee proportionate to the work done. Non-recoverable third-party costs committed at the Client's request are also deducted, itemized, with the asset transferring to the Client.`,
      '(d) After the period. After the 14 days, the Client may still end the Project at any time by written notice. The Agency retains payment for work performed to the date of cancellation — the value of time worked at the Agency Rate, evidenced by a time record, never more than the amounts the schedule in Section 7 had made due — and refunds anything paid above that. An Instalment that fell due before notice, for a gate the Client had approved, remains payable.',
      `(e) Prepayments. Where the Client paid ahead of schedule, amounts above what (c) or (d) entitle the Agency to keep are refunded, less non-recoverable payment-processor fees on the refunded amount and a fixed administration charge of ${money(PREPAYMENT_ADMIN_FEE_CENTS)}.`,
      `(f) If the Agency is the one that ends the Project, or defaults. Where the Agency terminates, or ceases substantive work for more than forty-five (45) days without a Client-caused reason or notified absence and does not remedy within fifteen (15) Business Days of written notice, the Client is refunded everything paid above the value of time worked at the Agency Rate, with the time record provided.`,
      '(g) Deliverables the Client has paid for are theirs on the terms of Section 13. Refunds are processed to the original payment method within fifteen (15) Business Days. Every settlement is stated as two lines — amount due from the Client, and amount returned to the Client — at least one of which is always zero.',
      '(h) This Section does not limit any statutory right the Client has, including under the Consumer Rights Act 2015, to services performed with reasonable care and skill.',
    ],
  };
}

/**
 * Custom work gets its own section stating each item's scope verbatim.
 * A catalogue add-on ("SEO Foundations") means the same thing on every
 * contract; "Custom integration — $4,000" means whatever each side assumed.
 * The description Evan wrote is the definitive scope, and the dashboard won't
 * generate a contract until each custom item has one written.
 */
function buildCustomWorkSection(items: ContractCustomItem[]): ContractSection {
  return {
    heading: 'Custom Work — Agreed Scope',
    paragraphs: [
      'The following work was quoted specifically for this engagement and is not drawn from the Agency\'s standard service catalogue. The description given for each item is the definitive statement of what that item covers, and controls over any shorter label used for it elsewhere in this Agreement, in any invoice, or in any prior conversation, proposal, or correspondence between the Parties.',
      ...items.map((item) => `${item.label} — ${item.price}. Scope: ${item.description}`),
      'Work that falls outside the descriptions above is not included, however closely related it may appear to the item it sits next to, and is performed only under a Change Order agreed in writing under Section 9. Where either Party believes a description above is ambiguous as applied to a specific request, the Parties will resolve the ambiguity in writing before the Agency performs the work, and neither the Agency\'s estimate nor the Client\'s expectation is expanded by silence.',
    ],
  };
}

/** Clauses appended only when the relevant add-on, service type, timeline, or client tier is actually selected. */
function buildConditionalClauses(p: ContractParams): ContractSection[] {
  const keys = p.addOnKeys;
  const clauses: ContractSection[] = [];

  // First, so the specifics of what was bought sit ahead of the generic
  // clauses about categories of work.
  const custom = describedCustomItems(p);
  if (custom.length > 0) {
    clauses.push(buildCustomWorkSection(custom));
  }

  if (has(keys, 'ecommerce', 'subscriptions')) {
    clauses.push({
      heading: 'E-commerce and Payment Processing',
      paragraphs: [
        'Where the Project includes e-commerce or subscription functionality, the Agency will integrate a payment processor selected during Discovery (typically Stripe). The Client is responsible for maintaining its own merchant/processor account in good standing, and for that processor\'s own fees, which are separate from and in addition to the Fees under this Agreement.',
        'The Agency is not responsible for chargebacks, fraud, or disputes between the Client and its own end customers, and does not guarantee compliance with PCI-DSS beyond using a processor that is itself PCI-compliant for card handling.',
      ],
    });
  }

  if (has(keys, 'subscriptions')) {
    clauses.push({
      heading: 'Recurring Billing and Subscription Terms',
      paragraphs: [
        'Where the Project includes recurring billing or memberships, the Agency will configure the agreed subscription tiers, billing cadence, and cancellation flow as scoped during Discovery. The Client is solely responsible for its own pricing, refund policy toward its end customers, and any consumer-protection disclosures required for recurring charges in its own jurisdiction.',
      ],
    });
  }

  if (has(keys, 'custom-backend', 'user-accounts')) {
    clauses.push({
      heading: 'Custom Backend and Data Handling',
      paragraphs: [
        'Where the Project includes a custom backend or user accounts, the Client is the data controller for any end-user personal data the product collects and remains responsible for a lawful basis for processing and its own privacy disclosures, unless a Privacy & Compliance add-on has also been selected. Exhibit D governs the Agency\'s processing on the Client\'s behalf.',
        'The Agency will apply reasonable technical safeguards appropriate to the data being handled, and will delete or return Client data reasonably promptly upon request following completion or termination of the Project, except where retention is required by law.',
      ],
    });
  }

  if (has(keys, 'integrations')) {
    clauses.push({
      heading: 'Third-Party Integrations Disclaimer',
      paragraphs: [
        'Where the Project integrates with a third-party tool the Client already uses (CRM, Slack, Zapier, or similar), the Agency is not responsible for that tool\'s uptime, pricing, or API changes, and material rework required by a breaking change on the third party\'s side is billed as a Change Order.',
      ],
    });
  }

  if (has(keys, 'booking')) {
    clauses.push({
      heading: 'Booking and Scheduling Terms',
      paragraphs: [
        'Where the Project includes appointment or booking functionality, the Client is responsible for keeping its own availability, staff calendars, and service listings up to date; the Agency\'s obligation is limited to building and configuring the scheduling flow itself, not maintaining its ongoing content.',
      ],
    });
  }

  if (has(keys, 'accessibility-audit', 'privacy-compliance')) {
    clauses.push({
      heading: 'Accessibility and Compliance Scope',
      paragraphs: [
        'Where an accessibility or privacy/compliance add-on is selected, the specific standard targeted (for example WCAG 2.1 AA) and testing method (automated scan, manual audit, or assistive-technology testing) is defined in writing during Discovery, and the Agency\'s obligation is limited to that defined scope. This is not a legal opinion that the delivered product satisfies any specific law; the Client remains responsible for its own compliance determination.',
      ],
    });
  }

  if (has(keys, ...ONGOING_CARE_KEYS)) {
    clauses.push({
      heading: 'Ongoing Care and Service Levels',
      paragraphs: [
        'Where the Client has selected a Maintenance Plan, Growth Plan, Managed Hosting, or Onboarding & Support Retainer, that plan is billed monthly in advance, cancellable by either Party on thirty (30) days\' written notice, and continues past the one-time Warranty Period in Section 16.',
        'Absent a different commitment stated at the time of selection: critical issues (the product fully down, or a core purchase/login flow broken) receive an initial response within one (1) Business Day; non-critical issues within three (3) Business Days. "Initial response" is an acknowledgment and triage, not a guaranteed resolution time. Response commitments pause during Agency absence notified under Section 11, with the credit that Section provides for extended absence.',
      ],
    });
  }

  if (has(keys, ...GROWTH_KEYS)) {
    clauses.push({
      heading: 'Content, SEO, and Growth Disclaimer',
      paragraphs: [
        'Where the Project includes SEO, copywriting, a blog, or a Growth Plan, the Agency will follow current best practices, but search ranking and traffic outcomes depend on factors outside the Agency\'s control (competition, algorithm changes, domain history) and are not guaranteed. Any performance figures discussed during sales or Discovery are illustrative estimates, not a binding forecast, and are not grounds for a refund under Section 8 if actual performance differs.',
      ],
    });
  }

  if (p.timelineKey === 'rush') {
    clauses.push({
      heading: 'Rush Timeline Acknowledgment',
      paragraphs: [
        'The Client has selected an expedited timeline. The Client acknowledges that a compressed schedule leaves less room to absorb feedback delays or scope clarification without pushing the delivery date, and that the standard revision allowance in Section 4 still applies — it is not expanded by paying a rush premium. The rush premium reflects prioritized scheduling of Agency resources, not a guaranteed fixed delivery date, unless separately agreed in writing under Section 5.',
      ],
    });
  }

  if (p.clientTypeKey === 'enterprise') {
    clauses.push({
      heading: 'Enterprise Governance Addendum',
      paragraphs: [
        'Given the Client\'s enterprise classification, the Agency will document key decisions and sign-offs in writing at each Milestone to support the Client\'s internal stakeholder review process, and will route material scope questions through the single point of contact designated under Section 2 to avoid conflicting instructions from multiple stakeholders. Additional stakeholder review cycles beyond the standard revision allowance in Section 4 are accommodated within the Client-type pricing adjustment already reflected in the Total Fee, but do not themselves expand the number of included revision rounds per Milestone.',
      ],
    });
  }

  if (has(NATIVE_APP_KEYS, p.baseServiceKey)) {
    clauses.push({
      heading: 'App Store Submission and Review',
      paragraphs: [
        'Where the Project targets iOS, macOS, or visionOS, the Client will maintain its own developer account with the relevant platform (Apple), and any fees charged by that platform are the Client\'s responsibility, separate from the Fees under this Agreement. App store review timelines and outcomes are controlled by the platform, not the Agency; a rejection requiring changes to comply with platform guidelines is handled as promptly as possible but is a third-party-caused delay under Section 10, not Agency delay, and rework to satisfy platform requirements not contemplated in the original scope may be billed as a Change Order.',
      ],
    });
  }

  if (p.baseServiceKey === 'multi') {
    clauses.push({
      heading: 'Multi-Platform Coordination',
      paragraphs: [
        'Where the Project spans two or more platforms delivered together, the Agency will maintain a shared design system and, where technically practical, shared backend logic across platforms to keep them consistent; platform-specific constraints (App Store guidelines, browser support, or device capabilities) may still require platform-specific adjustments, which are considered part of the original scope where reasonably necessary to achieve feature parity, and a Change Order where they materially expand scope.',
      ],
    });
  }

  return clauses;
}

function buildExhibits(p: ContractParams): ContractSection[] {
  const schedule = instalmentSchedule(p.totalPriceCents);
  const [first, second, third] = schedule;
  const consumer = p.isConsumer === true;

  return [
    {
      heading: 'Exhibit A — Scope by Phase',
      paragraphs: [
        `This Exhibit itemizes what is typically included in each phase of a ${p.serviceLabel} engagement. The Agency will confirm the specific items applicable to this Project in writing at the conclusion of Discovery.`,
        'Discovery: requirements-gathering with the Client\'s point of contact; review of existing brand assets and reference material; confirmation of technical approach and integrations; a written requirements summary presented for Requirements Sign-off under Section 5. Discovery begins on the Kickoff Date — once Payment 1 has cleared and the Agency has confirmed in writing that the Client\'s inputs are complete — and ends when the requirements summary is signed off.',
        'Design: an original visual design concept for review; up to two (2) rounds of revisions; finalized design files for the core screens agreed during Discovery. The phase ends at Design Approval, which triggers Payment 2 under Section 7.',
        'Build: implementation of the approved design and confirmed requirements; integration with confirmed third-party services; internal QA; a Preview Environment under Section 4 on which the Client can review the work in progress. Build begins once Payment 2 is received.',
        'Launch: the Ready for Launch confirmation and invoice for Payment 3; final Client sign-off; deployment to production (or app store submission, where applicable) once Payment 3 has cleared; handover of credentials, source, and documentation included in scope; commencement of the Warranty Period.',
      ],
    },
    {
      heading: 'Exhibit B — Payment Schedule',
      paragraphs: [
        `The Total Fee of ${p.totalPrice} is paid in ${first.count} Instalments. Every invoice and payment link identifies its Instalment by position, so there is never a question of which payment is which:`,
        `Payment 1 of ${first.count}: ${money(first.amountCents)} (${first.percent}% of the Total Fee) — due on signing, before work begins. The Kickoff Date cannot occur until it has cleared.`,
        `Payment 2 of ${second.count}: ${money(second.amountCents)} (${second.percent}% of the Total Fee) — invoiced on Design Approval (including deemed approval under Section 4), payable within fourteen (14) days. Build begins on receipt.`,
        `Payment 3 of ${third.count}: ${money(third.amountCents)} (${third.percent}% of the Total Fee) — invoiced when the Project is Ready for Launch, payable within fourteen (14) days. Launch, handover, and the assignment of intellectual property follow clearance.`,
        'The schedule structure depends on project size: engagements under $20,000 are billed 50% / 25% / 25%, and engagements of $20,000 and above are billed 40% / 30% / 30%, across the same three gates.',
        'Where the Client has selected a recurring add-on, the first month\'s fee is included in the Total Fee above; subsequent months are billed separately per that add-on\'s own terms.',
        'Paying ahead of the schedule is welcome and changes nothing else: delivery still follows the gates, and Section 8 governs prepaid amounts if the Project ends early.',
      ],
    },
    {
      heading: 'Exhibit C — Illustrative Scenarios',
      paragraphs: [
        'Provided for illustration only — it does not modify Sections 7, 8, or 10, which control in the event of any inconsistency. The figures below use this engagement\'s actual numbers, so they are the amounts that would really apply.',
        ...(consumer
          ? [
              `Cancelling in the first 14 days: the Client signed, paid ${money(first.amountCents)}, and cancels on day 10, by which point 8 hours of Discovery work (${money(8 * AGENCY_RATE_CENTS)} at the Agency Rate) had been done at the Client's request. The refund is ${money(Math.max(0, first.amountCents - 8 * AGENCY_RATE_CENTS))} — everything paid, less the work actually supplied.`,
              `Cancelling later: the Client cancels after Design Approval, having paid ${money(first.amountCents + second.amountCents)} across two Instalments for gates that were reached and approved. The Agency retains payment for the work performed and provides the time record; anything paid beyond the value of work done comes back.`,
            ]
          : [
              `Cancelling after Design Approval, before paying Payment 2: Design Approval happened on Monday, so Payment 2 of ${money(second.amountCents)} fell due; the Client cancels on Wednesday. Payment 2 remains payable under Section 8(b) — the design work that triggered it was finished and approved before notice existed. Payment 3 is never invoiced.`,
              `Cancelling mid-Build: the Client has paid ${money(first.amountCents + second.amountCents)} for the signing and Design Approval gates, then cancels during Build. Both payments are earned and retained; Payment 3 of ${money(third.amountCents)} was never triggered and is never billed. The Client keeps every Deliverable those payments covered.`,
              `Prepaid in full, cancelled early: the Client paid the whole ${p.totalPrice} at signing and cancels before Design Approval. The schedule entitled the Agency to ${money(first.amountCents)} at that point, so the Client is refunded ${money(p.totalPriceCents - first.amountCents)}, less non-recoverable processor fees on the refund and the ${money(PREPAYMENT_ADMIN_FEE_CENTS)} administration charge.`,
            ]),
        `The Agency walks away mid-project: the Agency terminates for convenience with ${money(first.amountCents)} paid and 20 hours worked. It keeps 20 × the Agency Rate = ${money(20 * AGENCY_RATE_CENTS)}, provides the time record, and refunds ${money(Math.max(0, first.amountCents - 20 * AGENCY_RATE_CENTS))}. No gate-based retention applies when the Agency is the one leaving.`,
        'The Client pays Payment 1 but never sends content or access: the Kickoff Date under Section 5 never arrives and the timeline never starts. Section 6 lets the Agency treat a long silence as suspension; a client who returns finds the Project where they left it.',
        'The Client drops an add-on before work on it starts: its listed price comes off the Total Fee as a Change Order, and the remaining Instalments recalculate. Dropped after work began: the price is committed, and whatever exists of the item is delivered.',
        'Client feedback runs slow, pushing the timeline out: this is a Client-caused delay under Section 6; the timeline extends automatically and no refund is owed.',
        'The Agency goes quiet for over 45 days with no explanation: the Client may issue a written default notice under Section 8; if the Agency doesn\'t resume or provide a plan within 15 Business Days, the Client can terminate and is refunded everything above the value of work actually performed at the Agency Rate.',
        'A delivered feature genuinely doesn\'t match the agreed spec: this is a non-conformance under Section 4, corrected at no charge and without counting against the revision allowance.',
        'The Client adds new features mid-Project, then blames the resulting delay on the Agency: added scope is a Change Order under Section 9, and the resulting timeline extension is excluded from the definition of Agency delay.',
        'The Client files a card chargeback instead of using Section 8: the Agency may suspend access while contesting it with evidence of work performed and gates passed.',
      ],
    },
    {
      heading: 'Exhibit D — Data Processing Addendum',
      paragraphs: [
        'This Exhibit contains the terms required by Article 28(3) UK GDPR for personal data the Agency processes on the Client\'s behalf ("Client Personal Data"). It applies for the duration of the Agreement and any period the Agency continues to hold Client Personal Data after it ends.',
        'Particulars of processing — Subject matter: personal data handled by the product the Agency builds and any systems it operates for the Client. Duration: the term of the Agreement plus any agreed Care Plan period. Nature and purpose: building, hosting, maintaining, and supporting the Project, including receiving form submissions, operating user accounts, and configuring analytics. Categories of data subjects: the Client\'s end users, customers, and enquirers. Types of personal data: names, contact details, account credentials, order and enquiry contents, and usage data — the Project does not intentionally process special category data unless separately agreed in writing.',
        'The Agency will: process Client Personal Data only on the Client\'s documented instructions, this Agreement being the core of them, unless required by law to do otherwise (in which case it informs the Client unless the law prevents it); ensure persons authorised to process it are under an obligation of confidentiality; implement appropriate technical and organisational measures for a risk-appropriate level of security; assist the Client, taking into account the nature of the processing, with responses to data subjects\' requests and with the Client\'s own security, breach-notification, and impact-assessment obligations; and at the Client\'s choice delete or return all Client Personal Data at the end of services, deleting existing copies unless the law requires storage.',
        'Sub-processors. The Client gives general written authorisation for the Agency\'s use of sub-processors that host, deliver, and support the product — currently its cloud hosting provider, its payment processor (Stripe, Inc.), and its email delivery provider. The Agency will inform the Client of intended changes to its sub-processors, giving the Client the opportunity to object on reasonable data-protection grounds, and remains responsible to the Client for its sub-processors\' performance.',
        'Audit. The Agency will make available to the Client information reasonably necessary to demonstrate compliance with this Exhibit, and will allow for and contribute to audits conducted by the Client or its mandated auditor, on reasonable notice, no more than once per year absent a specific incident, and at the Client\'s cost.',
        'International transfers. Where processing involves transfers of Client Personal Data outside the UK, the Agency will ensure a lawful transfer mechanism applies — adequacy regulations or the applicable standard contractual/IDTA clauses of the sub-processor concerned.',
      ],
    },
  ];
}

export function buildContractSections(p: ContractParams): ContractSection[] {
  const addOnList = p.addOnLabels.length > 0 ? p.addOnLabels.join(', ') : 'none selected at signing';

  const skeleton = buildSkeleton(p, addOnList);
  const conditional = buildConditionalClauses(p);
  const exhibits = buildExhibits(p);

  return [...skeleton, ...conditional, ...exhibits];
}
