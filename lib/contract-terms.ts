// Dynamic agency services agreement, generated per-proposal. A fixed
// "skeleton" of core legal sections is always included; on top of that,
// specific clauses are appended only when the underlying add-on, service
// type, timeline, or client tier is actually selected on the onboarding
// form — so a simple website contract stays short, and a contract for a
// project with e-commerce, subscriptions, and an enterprise client tier
// picks up the extra clauses those things actually require.
//
// This is modeled on standard web/software agency contract structure. It is
// NOT a substitute for review by a lawyer licensed in your jurisdiction
// before it's treated as binding.

import { formatCents, type CustomItem } from '@/lib/pricing';

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
  depositAmount: string;
  balanceAmount: string;
  depositPercent: number;
  effectiveDate: string;
  /**
   * The Total Fee in cents. The other money fields arrive pre-formatted, which
   * is fine for quoting them back, but the cancellation terms in Section 8 have
   * to do arithmetic on the number — a client reading "30% of the Total Fee"
   * and a client reading "$6,000" are not being told the same thing, and only
   * one of them can check it without a calculator. It also divides into the
   * estimated hours to give the Cancellation Rate.
   */
  totalPriceCents: number;
  /**
   * Estimated total hours for the Project. Divided into the Total Fee to give
   * the cancellation rate in Section 8, so it is a term the Client is agreeing
   * to, not an internal guess — it belongs in the proposal before it is quoted
   * back here. Falls back to a documented default when nothing was recorded.
   */
  estimatedHours?: number;
  /**
   * True where the Client accepted a reduced price in exchange for providing a
   * testimonial. Turns on the export hold in Section 4 — the work is reviewable
   * on the preview environment, but not exportable until the testimonial is in.
   * Off by default, because a contract with no such bargain must not carry a
   * clause conditioning delivery on something the Client never agreed to.
   */
  reviewDiscount?: boolean;
  /** Preview subdomain (e.g. "acme.bothmade.com"), where one has been assigned. */
  previewDomain?: string | null;
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
 * Cancelling for convenience: one window, and one deduction that is the
 * greater of a floor and the work actually done.
 *
 * The window is short and dated rather than tied to a Milestone, so neither
 * side has to argue about which stage the Project had reached. Inside it, the
 * Client gets back what they paid less a deduction; outside it, the money
 * already paid is earned and the balance falls due under the payment terms.
 *
 * The deduction takes the greater of a flat 30% of the Total Fee and the value
 * of time actually worked, which is the part that makes it fair in both
 * directions. The 30% floor covers what a cancellation costs regardless of
 * hours logged — the reserved delivery slot, the declined work, the restart
 * cost on whatever fills the gap. The hourly leg takes over only once real
 * effort has gone in, and because the rate is the Total Fee divided by the
 * estimated hours, that crossover lands at exactly 30% of the estimated hours.
 * A Project quoted at 160 hours reaches it at 48. The Client is therefore
 * never charged twice for the same thing, and the Agency is never left billing
 * a floor after two weeks of real work.
 */
const CANCELLATION_WINDOW_DAYS = 14;
const CANCELLATION_FLOOR_PERCENT = 30;

/**
 * Hours a Project is assumed to take when no estimate was recorded against it.
 *
 * The cancellation rate is the Total Fee divided by this, so it is not a
 * throwaway default: too low and the rate is inflated, too high and real work
 * bills under the floor. It stays here rather than in the pricing catalogue
 * because it is only ever used to price a cancellation.
 */
const DEFAULT_ESTIMATED_HOURS = 160;

function estimatedHours(p: ContractParams): number {
  return p.estimatedHours && p.estimatedHours > 0 ? p.estimatedHours : DEFAULT_ESTIMATED_HOURS;
}

/**
 * The Total Fee spread across the estimated hours.
 *
 * Rendered to the cent, unlike every other figure in the contract: a rate is
 * multiplied by hours before anyone reads the result, so rounding it to whole
 * dollars would quietly move the answer.
 */
function cancellationRate(p: ContractParams): string {
  const perHour = p.totalPriceCents / estimatedHours(p) / 100;
  return perHour.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** The flat leg of the deduction, as money. */
function cancellationFloor(p: ContractParams): string {
  return formatCents(Math.round((p.totalPriceCents * CANCELLATION_FLOOR_PERCENT) / 100));
}

/** Value of a given number of hours at the Cancellation Rate, as money. */
function timeValue(p: ContractParams, hours: number): string {
  return formatCents(Math.round((p.totalPriceCents / estimatedHours(p)) * hours));
}

/**
 * Hours at which the time-worked leg overtakes the flat floor.
 *
 * Because the rate is the fee over the estimated hours, this is always the
 * floor percentage of the estimate — no arithmetic needed, but worth stating
 * in the contract so nobody has to derive it mid-argument.
 */
function crossoverHours(p: ContractParams): number {
  return Math.round((estimatedHours(p) * CANCELLATION_FLOOR_PERCENT) / 100);
}

/** What actually comes back on a cancellation inside the window. */
function refundAfterHours(p: ContractParams, hours: number): string {
  const paid = Math.round((p.totalPriceCents * p.depositPercent) / 100);
  const worked = Math.round((p.totalPriceCents / estimatedHours(p)) * hours);
  const floor = Math.round((p.totalPriceCents * CANCELLATION_FLOOR_PERCENT) / 100);
  return formatCents(Math.max(0, paid - Math.max(floor, worked)));
}

/** The always-present core of the agreement — applies to every engagement regardless of what was selected. */
function buildSkeleton(p: ContractParams, addOnList: string): ContractSection[] {
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
        '"Business Day" means any day other than a Saturday, Sunday, or public holiday observed by the Agency.',
        '"Change Order" means a written amendment to the scope of the Project under Section 9.',
        '"Client Dependencies" means any content, access, approvals, or feedback the Client must provide under Section 6.',
        '"Deliverable(s)" means any design file, source code, document, or other work product the Agency produces under this Agreement.',
        '"Fees" means all amounts payable by the Client under this Agreement.',
        '"Cancellation Rate" means the Total Fee divided by the estimated total Project hours, as calculated in Section 8(c).',
        '"Kickoff Date" has the meaning given in Section 5. It is also the "Project Start Date" wherever that term is used, and is the date from which both the Project timeline and the cancellation window in Section 8 run.',
        '"Milestone" means a defined stage of the Project — Discovery, Design, Build, or Launch — described in Section 5 and Exhibit A.',
        '"Preview Environment" means any Agency-controlled staging address, including a subdomain of a domain the Agency owns, on which Deliverables are made available for review under Section 4.',
        '"Total Fee" means the aggregate fee for the Project set out in Section 7, exclusive of later Change Orders.',
        '"Warranty Period" has the meaning given in Section 14.',
      ],
    },
    {
      heading: '2. Parties',
      paragraphs: [
        `This Project Agreement (the "Agreement") is entered into as of ${p.effectiveDate} (the "Effective Date") by and between Bothmade ("the Agency") and ${p.company} ("the Client").`,
        `${p.contactName ? `The Client's primary point of contact is ${p.contactName}, who represents that they have authority to bind the Client to this Agreement.` : 'The Client represents that the individual executing this Agreement has authority to bind the Client to its terms.'}`,
        'This Agreement supersedes any prior proposals, quotes, or correspondence relating to the Project, except where expressly incorporated by reference in writing. By making the deposit payment referenced in Section 7, or providing written acceptance, the Client agrees to be bound by this Agreement in full.',
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
        'Any feature, page, or functionality not explicitly listed in this Section, Exhibit A, or the written scope documentation is out of scope, and the Agency is under no obligation to perform out-of-scope work absent a signed Change Order under Section 9.',
        'Where the Project integrates with third-party services or infrastructure not owned by the Agency, the Agency is not responsible for outages, policy changes, or deprecations imposed by those third parties, and accommodating such changes after delivery is billable as a Change Order.',
      ],
    },
    {
      heading: '4. Deliverables and Acceptance',
      paragraphs: [
        `Deliverables are provided through the Bothmade client dashboard, and where the Agency considers it useful for review, on a Preview Environment${p.previewDomain ? ` — for this Project, ${p.previewDomain}` : ' hosted on a subdomain of a domain the Agency controls'}. A Preview Environment is a review tool, not the delivered product: it carries no uptime, performance, or availability commitment, is excluded from the warranty in Section 14, may be rebuilt or taken down as work proceeds, and is removed thirty (30) days after Launch or termination.`,
        'The Client will not share a Preview Environment address publicly, use it to serve its own customers, or deploy it for commercial purposes before payment in full, and the Agency may restrict it to authenticated dashboard users and exclude it from search engine indexing.',
        'The Client has five (5) Business Days from when a Deliverable is made available to provide written feedback (the "Review Period"); absent a response, the Deliverable is deemed accepted. A Deliverable is "made available" when it can be viewed — whether in the dashboard or on a Preview Environment — and the Review Period runs from that point whether or not the Client is entitled to download or export it at the time.',
        'Acceptance criteria are limited to conformance with the written scope in Section 3, Exhibit A, and any mutually agreed specifications. Subjective preferences not reflected in agreed specifications do not constitute grounds for rejecting a Deliverable, though the Agency will accommodate such feedback within the standard revision allowance.',
        'Each major Milestone includes up to two (2) rounds of revisions at no additional charge for changes consistent with the originally agreed scope; additional or materially different revisions are billable as a Change Order.',
        'Final acceptance of the Project occurs upon the Client\'s written acknowledgment of Launch, or upon the Project going live, whichever occurs first.',
      ],
    },
    {
      heading: '5. Project Timeline and Milestones',
      paragraphs: [
        `The Parties have agreed to a target timeline of ${p.timelineLabel}. That timeline does not begin on the Effective Date, on signature, or on payment alone. It begins on the "Kickoff Date," which is the later of the following two events — both are required, and neither on its own starts the clock:`,
        `(a) Deposit cleared: the deposit of ${p.depositAmount} has been received and cleared by the Agency's payment processor, which the dashboard records with a date; and`,
        '(b) Inputs signed off: the Agency has confirmed in writing, through the dashboard, that it has received every Client Dependency under Section 6 needed to begin Discovery — content, credentials, access, brand assets, and a named point of contact — and that the Project is ready to start.',
        'Where the deposit clears first, the timeline does not start until the Agency confirms inputs are complete; where inputs are complete first, the timeline does not start until the deposit clears. The Agency will not unreasonably withhold or delay the confirmation in (b), and will tell the Client specifically what is outstanding where it does.',
        `The Kickoff Date is also the Project Start Date for the purposes of Section 8, and so is the date the ${CANCELLATION_WINDOW_DAYS}-day cancellation window runs from. Because it is recorded in the dashboard on the day it happens, both Parties can tell afterwards exactly when that window opened and closed. The dashboard record of the Kickoff Date is the operative date for Sections 5, 6, 8, and 10.`,
        'This timeline is a good-faith estimate, not a guaranteed delivery date, unless the Parties separately and explicitly agree in writing to a fixed date with associated penalty terms. Time is not "of the essence" for purposes of this Agreement absent such a separate written agreement.',
        'The Agency will notify the Client as soon as it becomes aware that a Milestone is at risk, together with a revised estimate where possible. Milestones generally follow Discovery, Design, Build, and Launch, as further itemized in Exhibit A.',
      ],
    },
    {
      heading: '6. Client Responsibilities and Dependencies',
      paragraphs: [
        'The Client will provide, in a timely manner, all content, credentials, access, approvals, and feedback reasonably required to perform the Project (collectively, "Client Dependencies"), and will designate a single authorized point of contact.',
        'Delays in providing a Client Dependency extend the Project timeline on a day-for-day (or greater) basis and do not constitute Agency delay for purposes of Section 8 or Section 10.',
        'Where the Client fails to provide a Client Dependency for more than fifteen (15) consecutive Business Days after being asked, the Agency may pause the Project with the timeline extended accordingly, proceed using reasonable assumptions (with resulting rework billed as a Change Order), or treat the Project as suspended by the Client, with Fees for work completed becoming due.',
      ],
    },
    {
      heading: '7. Fees and Payment Terms',
      paragraphs: [
        `The total fee for this engagement is ${p.totalPrice}, comprising ${p.basePrice} for the base service and ${p.addOnsPrice === '$0' ? 'no additional add-on fees' : `${p.addOnsPrice} for the selected add-ons`}.`,
        `A deposit of ${p.depositAmount} (${p.depositPercent}% of the Total Fee) is due before work begins. The remaining balance of ${p.balanceAmount} is due upon completion of the Build phase and prior to Launch, unless the Parties agree to a different schedule in writing (see Exhibit B).`,
        'All Fees are in USD, exclusive of applicable taxes, which are the Client\'s responsibility except where the Agency is legally required to collect them.',
        'Payments not received within seven (7) days of their due date are late. The Agency may pause work without penalty until payment is current, and may apply a late fee of 1.5% per month or the maximum rate permitted by law, whichever is lower.',
        `The Deposit begins to be earned on the Kickoff Date and is fully earned on the ${CANCELLATION_WINDOW_DAYS}th calendar day after it, reflecting the immediate cost to the Agency of allocating personnel and pausing other engagements to begin the Project. Within that window it is refundable net of the deduction in Section 8(b); after it, it is not refundable. Section 8 controls the calculation in every case.`,
        'Payments made via a Bothmade-generated payment link are processed by Stripe, Inc. under Stripe\'s own terms; the Agency does not store or have access to the Client\'s card details.',
      ],
    },
    {
      heading: '8. Refund Policy and Termination Settlement',
      paragraphs: [
        'Refunds are governed exclusively by this Section, which controls over any general expectation of refund availability:',
        `(a) Payment structure. The Total Fee is paid in two installments: ${p.depositPercent}% (${p.depositAmount}) before work begins, and the remaining ${100 - p.depositPercent}% (${p.balanceAmount}) as specified in Section 7 and Exhibit B. There are no intermediate Milestone payments.`,
        `(b) Cancellation within the first ${CANCELLATION_WINDOW_DAYS} days. The Client may request cancellation in writing during the first fourteen (${CANCELLATION_WINDOW_DAYS}) calendar days following the Project Start Date. Any refund during that period will equal the amount paid by the Client, less the greater of:`,
        `(1) thirty percent (${CANCELLATION_FLOOR_PERCENT}%) of the Total Fee — ${cancellationFloor(
          p
        )} on this engagement; or`,
        `(2) the value of all time worked, calculated using the Cancellation Rate stated in (c), together with all nonrecoverable or third-party project expenses.`,
        `(c) The Cancellation Rate. The Cancellation Rate is the Total Fee divided by the estimated total Project hours. For this engagement that is ${
          p.totalPrice
        } over ${estimatedHours(p)} estimated hours, giving a Cancellation Rate of ${cancellationRate(
          p
        )} per hour. Compensable project time includes research, planning, meetings, communications, administration, design, production, revisions, and related work. The Agency will provide a written record of time worked with any refund calculation under (b).`,
        `(d) Limits. No refund will exceed the amount actually paid, and no refund calculation will result in a payment owed to the Client greater than the amount received. A deduction larger than the amount paid reduces the refund to zero; it does not create a debt.`,
        `(e) Cancellation on or after the ${CANCELLATION_WINDOW_DAYS}th day. Beginning on the fourteenth (${CANCELLATION_WINDOW_DAYS}th) calendar day after the Project Start Date, the initial ${p.depositPercent}% payment of ${p.depositAmount} is fully earned and non-refundable. The remaining ${100 - p.depositPercent}% of ${p.balanceAmount} becomes due according to the payment terms in Section 7 and Exhibit B.`,
        '(f) Scope of this policy. Paragraphs (b) through (e) apply to cancellation by the Client for convenience, and do not eliminate any rights or remedies that cannot legally be waived.',
        '(g) Where the Agency is the one leaving. Where instead the Agency terminates for convenience under Section 11, or the Client terminates because of the Agency\'s uncured material breach or its default under (i) below, no deduction under (b)(1) applies: the Agency retains only the value of time worked at the Cancellation Rate plus nonrecoverable expenses, and refunds the balance of everything paid.',
        '(h) Missed timeline estimates: a timeline running longer than projected does NOT, on its own, entitle the Client to a refund, provided the Agency continues to work in good faith and has not abandoned the Project — particularly where delay is caused or contributed to by Client Dependencies (Section 6), scope changes (Section 9), or third-party dependencies (Section 3).',
        '(i) Agency-caused unreasonable delay: where the Agency ceases substantive work for more than forty-five (45) consecutive days without a Client-caused reason and without reasonable communication, the Client may issue written notice of default. If the Agency does not resume work or provide a remediation plan within fifteen (15) Business Days, the Client may terminate and be refunded on the basis set out in (g), whether or not the cancellation window in (b) has closed.',
        '(j) Completed and accepted Deliverables are not refundable except for the Agency\'s gross negligence or willful misconduct in producing that specific Deliverable.',
        '(k) Chargebacks: initiating a card chargeback in lieu of the process in this Section is a material breach and may result in immediate suspension of Deliverables, Preview Environments, and dashboard access; the Agency may contest any chargeback with evidence of work performed.',
        '(l) A refund due under this Section is processed to the original payment method within fifteen (15) Business Days, less any non-recoverable processor fees. An amount due from the Client under (e) is payable within fifteen (15) Business Days of the Agency\'s written statement of the amount.',
        '(m) This Refund Policy is the Client\'s sole and exclusive remedy for dissatisfaction with the pace, quality, or outcome of the Project, except where a separate remedy is expressly provided elsewhere in this Agreement or required by non-waivable consumer protection law.',
      ],
    },
    {
      heading: '9. Change Orders and Additional Work',
      paragraphs: [
        'Work requested that is not included in the scope in Section 3 and Exhibit A — new features, pages, integrations, or substantial revisions to accepted Deliverables — is scoped and quoted separately as a "Change Order," and no such work begins until the Client approves the additional scope and fee in writing.',
        'Change Orders extend the Project timeline by an amount reasonably determined by the Agency, and such extensions are not Agency delay for purposes of Section 10. Where a Change Order requires re-architecting completed work, the quote reflects that rework cost in addition to the new feature.',
      ],
    },
    {
      heading: '10. Delays and Extensions',
      paragraphs: [
        'The Project timeline is extended, without penalty to the Agency, for delay attributable to: (a) Client Dependencies not met on schedule; (b) Change Orders; (c) third-party services or infrastructure outside the Agency\'s control; (d) Force Majeure Events under Section 17; or (e) any period during which Client payment is overdue.',
        'Where a delay is solely and directly attributable to the Agency\'s own scheduling (and none of the causes above), the Client\'s sole remedy is set out in Section 8(i) — the Client is not entitled to consequential damages, lost profits, or the cost of a replacement vendor, subject to Section 15 (Limitation of Liability).',
      ],
    },
    {
      heading: '11. Termination',
      paragraphs: [
        'Either Party may terminate for convenience on thirty (30) days\' written notice. The financial consequence is fixed entirely by Section 8 — paragraphs (b) to (e) where the Client terminates, and paragraph (g) where the Agency does — and no other cancellation charge, fee, or damages arise from the termination itself.',
        `Whether a Client cancellation falls inside or outside the ${CANCELLATION_WINDOW_DAYS}-day window is decided by the date written notice is given, not the date the notice period expires. During the notice period the Agency will perform only wind-down work: completing or safely stopping work in progress, preparing a handover, and transferring credentials and materials. Time worked during wind-down is compensable under Section 8(c), but the Agency will not begin new work in order to increase it.`,
        'On termination the Agency will deliver all completed Deliverables covered by the settlement in their then-current state, along with the source, credentials, and documentation within scope for the work paid for. Any Preview Environment stays available for thirty (30) days from termination so the Client can retrieve its material, then comes down.',
        'Either Party may terminate immediately for a material breach the other Party fails to cure within fifteen (15) Business Days of written notice describing the breach. The Agency may also terminate immediately, without further delivery obligation, if the Client\'s balance remains overdue more than thirty (30) days past its due date.',
        'Sections 1, 7 (as to amounts due), 8, 12 (as to ownership of unpaid work), 13, 14, 15, 16, and 18 survive termination for any reason.',
      ],
    },
    {
      heading: '12. Intellectual Property and Ownership',
      paragraphs: [
        'Upon payment in full for the applicable Deliverable, the Agency assigns to the Client all right, title, and interest in the final delivered work product created specifically for the Client, excluding Agency Background IP.',
        'Until paid in full, all work product remains the Agency\'s sole property and the Client is granted no license to use, deploy, or exploit it.',
        '"Agency Background IP" means tools, libraries, frameworks, or components the Agency developed before or independently of this engagement, or of general applicability beyond this Project; the Agency retains all rights to it, and grants the Client a non-exclusive, perpetual, royalty-free license to use any Agency Background IP incorporated into the delivered work.',
        'The Client grants the Agency a limited, non-exclusive license to use the Client\'s name, logo, and a description of the Project for the Agency\'s own portfolio and marketing, unless the Client requests otherwise in writing (see also Section 20, Publicity).',
        'Where the Project incorporates third-party software, fonts, or stock imagery, the Client\'s rights are subject to the applicable third-party license, and the Agency makes no representation those licenses are perpetual or free of ongoing fees beyond what has been disclosed.',
      ],
    },
    {
      heading: '13. Confidentiality',
      paragraphs: [
        'Each Party will hold the other\'s Confidential Information in confidence and not disclose it to a third party without prior written consent, except as required to perform this Agreement or by law.',
        '"Confidential Information" excludes information that is or becomes public through no fault of the receiving Party, was already known to it, is independently developed, or is rightfully received from a third party without restriction. This obligation survives termination for three (3) years, except trade secrets, which remain protected as long as they qualify as such under applicable law.',
      ],
    },
    {
      heading: '14. Warranties and Disclaimers',
      paragraphs: [
        'The Agency warrants it will perform services in a professional, workmanlike manner consistent with generally accepted industry standards, and will correct, at no charge, any defect causing a Deliverable to fail to conform to the agreed scope for thirty (30) days following final delivery (the "Warranty Period") — excluding defects caused by Client or third-party modification after delivery, or by issues in infrastructure the Agency does not manage.',
        'EXCEPT AS EXPRESSLY SET OUT ABOVE, THE DELIVERABLES ARE PROVIDED "AS IS," AND THE AGENCY DISCLAIMS ALL OTHER WARRANTIES, EXPRESS, IMPLIED, OR STATUTORY, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT, TO THE MAXIMUM EXTENT PERMITTED BY LAW.',
        'Absent an active Maintenance Plan, Growth Plan, or Managed Hosting add-on, the Agency has no obligation to provide updates, patches, or compatibility fixes after the Warranty Period expires.',
      ],
    },
    {
      heading: '15. Limitation of Liability',
      paragraphs: [
        'TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS OR DATA, ARISING OUT OF THIS AGREEMENT, REGARDLESS OF THEORY, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.',
        'THE AGENCY\'S TOTAL AGGREGATE LIABILITY UNDER THIS AGREEMENT WILL NOT EXCEED THE TOTAL FEES ACTUALLY PAID BY THE CLIENT IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM. Nothing in this Section limits liability for gross negligence, willful misconduct, or fraud, or any liability that cannot be limited under applicable law. The Fees charged reflect this risk allocation.',
      ],
    },
    {
      heading: '16. Indemnification',
      paragraphs: [
        'The Client indemnifies the Agency against third-party claims arising from: (a) content or materials the Client provided; (b) the Client\'s use of the delivered product in violation of law; or (c) the Client\'s breach of this Agreement.',
        'The Agency indemnifies the Client against claims that the Agency\'s Background IP, as incorporated into the delivered work, directly infringes a third party\'s valid IP rights, provided the Client promptly notifies the Agency and cooperates in its defense — excluding claims arising from Client-provided content or the Client\'s post-delivery modifications.',
      ],
    },
    {
      heading: '17. Force Majeure',
      paragraphs: [
        'Neither Party is liable for delay or failure to perform (other than payment obligations) caused by events beyond its reasonable control — acts of God, natural disaster, war, government action, pandemic, or failure of a third-party provider. The affected Party will notify the other promptly and resume performance as soon as practicable; if the event continues beyond sixty (60) days, either Party may terminate under Section 11.',
      ],
    },
    {
      heading: '18. Governing Law and Dispute Resolution',
      paragraphs: [
        'This Agreement is governed by the laws of the state in which the Agency is principally located, without regard to conflict-of-laws principles. The Parties will first attempt good-faith negotiation for at least fifteen (15) Business Days before pursuing any other remedy; unresolved disputes go to binding arbitration under the commercial rules of a mutually agreed body, in the Agency\'s jurisdiction, with judgment enforceable in any court of competent jurisdiction.',
        'Either Party may seek injunctive relief in court to protect its IP or Confidential Information pending arbitration. Each Party bears its own costs, except the prevailing Party may be awarded reasonable attorneys\' fees at the arbitrator\'s or court\'s discretion.',
      ],
    },
    {
      heading: '19. Independent Contractor Relationship',
      paragraphs: [
        'The Agency is an independent contractor; nothing in this Agreement creates a partnership, joint venture, or employment relationship. The Agency retains full control over the manner and means of performing the services, including the right to use subcontractors, while remaining responsible for the quality and delivery of the work (see also Section 21).',
      ],
    },
    {
      heading: '20. Publicity',
      paragraphs: [
        'Beyond the general portfolio license in Section 12, the Agency may, with the Client\'s consent (not to be unreasonably withheld), publish a more detailed case study. Neither Party will issue a press release naming the other without prior written consent, except as already permitted above.',
      ],
    },
    {
      heading: '21. Non-Solicitation',
      paragraphs: [
        'During the term and for twelve (12) months after, the Client will not directly solicit or hire an Agency employee or contractor materially involved in the Project without the Agency\'s written consent. Breach entitles the Agency to liquidated damages equal to 25% of the hired individual\'s first-year compensation, without prejudice to injunctive relief.',
      ],
    },
    {
      heading: '22. Assignment, Notices, and Miscellaneous',
      paragraphs: [
        'Neither Party may assign this Agreement without the other\'s written consent, except in connection with a merger, acquisition, or asset sale, provided the assignee agrees in writing to be bound.',
        'Notices are delivered by email to the address on each Party\'s Bothmade account, deemed given upon transmission or, absent confirmation, the next Business Day.',
        'This Agreement, with its Exhibits and any Change Orders, is the entire agreement between the Parties and supersedes all prior discussions. It may only be amended in writing signed (including electronically) by both Parties. If a provision is found unenforceable, it will be limited to the minimum extent necessary and the remainder stays in force. Failure to enforce a provision is not a waiver of it or any other provision.',
        'This Agreement may be executed in counterparts, including by electronic signature or by the act of making the deposit payment, each deemed an original.',
      ],
    },
  ];
}

/**
 * Writes out every piece of custom work in full — its name, its price, and
 * the description of what it covers, verbatim as it was entered.
 *
 * A catalogue add-on can be named and left at that, because "SEO
 * Foundations" is defined the same way for every client. Custom work has no
 * such shared definition: "Custom integration — $4,000" on an invoice is
 * only ever as specific as whoever reads it assumes. This section is what
 * makes the assumption unnecessary, and the reason the dashboard won't
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
        'Where the Project includes a custom backend or user accounts, the Client is the data controller for any end-user personal data the product collects and remains responsible for a lawful basis for processing and its own privacy disclosures, unless a Privacy & Compliance add-on has also been selected.',
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
        'Where the Client has selected a Maintenance Plan, Growth Plan, Managed Hosting, or Onboarding & Support Retainer, that plan is billed monthly in advance, cancellable by either Party on thirty (30) days\' written notice, and continues past the one-time Warranty Period in Section 14.',
        'Absent a different commitment stated at the time of selection: critical issues (the product fully down, or a core purchase/login flow broken) receive an initial response within one (1) Business Day; non-critical issues within three (3) Business Days. "Initial response" is an acknowledgment and triage, not a guaranteed resolution time.',
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

  if (p.reviewDiscount) {
    clauses.push({
      heading: 'Testimonial Discount and Export Condition',
      paragraphs: [
        `The Total Fee of ${p.totalPrice} reflects a discount the Client accepted in exchange for providing a written testimonial about working with the Agency. The discount is consideration for the testimonial, and is earned when the testimonial is provided.`,
        'Until the Client provides the testimonial, Deliverables are made available for review in full — in the dashboard and on any Preview Environment — but are not available for download, export, or deployment. The Client can therefore see exactly what has been produced, and judge it, before writing anything. Review access is not withheld or degraded while the condition is outstanding; only export is held.',
        'The testimonial must be the Client\'s own honest opinion. The Agency does not require it to be favorable, does not condition the discount on a minimum rating or on any particular wording, and will not withhold export because it dislikes what the testimonial says: a submitted honest testimonial satisfies this condition regardless of its content. Where the Client publishes the testimonial somewhere that requires disclosure of an incentive, the Client will disclose it.',
        'The Client may instead decline to provide a testimonial and pay the undiscounted price, in which case the export hold lifts on payment of the difference. Where the Client neither provides a testimonial nor pays the difference within thirty (30) days of Launch, the Agency may treat the discount as not earned and invoice the difference, which is then payable under Section 7.',
        'For the avoidance of doubt, this condition does not extend the Review Period in Section 4, does not delay acceptance, and does not affect the assignment of intellectual property under Section 12 once the applicable Deliverable is paid for in full.',
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

export function buildContractSections(p: ContractParams): ContractSection[] {
  const addOnList = p.addOnLabels.length > 0 ? p.addOnLabels.join(', ') : 'none selected at signing';

  const skeleton = buildSkeleton(p, addOnList);
  const conditional = buildConditionalClauses(p);

  const exhibits: ContractSection[] = [
    {
      heading: 'Exhibit A — Scope by Phase',
      paragraphs: [
        `This Exhibit itemizes what is typically included in each phase of a ${p.serviceLabel} engagement. The Agency will confirm the specific items applicable to this Project in writing at the conclusion of Discovery.`,
        'Discovery: requirements-gathering with the Client\'s point of contact; review of existing brand assets and reference material; confirmation of technical approach and integrations; a written summary of confirmed requirements for sign-off. Discovery begins on the Kickoff Date as defined in Section 5 — that is, once the deposit has cleared and the Agency has confirmed in writing that the Client\'s inputs are complete.',
        'Design: an original visual design concept for review; up to two (2) rounds of revisions; finalized design files for the core screens agreed during Discovery.',
        'Build: implementation of the approved design and confirmed requirements; integration with confirmed third-party services; internal QA; a Preview Environment under Section 4 on which the Client can review the work in progress.',
        'Launch: final Client sign-off; deployment to production (or app store submission, where applicable); handover of credentials, source, and documentation included in scope; commencement of the Warranty Period.',
      ],
    },
    {
      heading: 'Exhibit B — Payment Schedule',
      paragraphs: [
        `Unless the Parties agree otherwise in writing: (1) the Deposit, equal to ${p.depositPercent}% of the Total Fee — ${p.depositAmount} — is due before Discovery begins; and (2) the Balance of ${p.balanceAmount} is due upon completion of Build and prior to Launch.`,
        'Where the Client has selected a recurring add-on, the first month\'s fee is included in the Total Fee above; subsequent months are billed separately per that add-on\'s own terms.',
        `Estimated total Project hours: ${estimatedHours(
          p
        )}. Dividing the Total Fee by that figure gives a Cancellation Rate of ${cancellationRate(
          p
        )} per hour, which is the rate used to value time worked under Section 8(c).`,
        `If the Client cancels within ${CANCELLATION_WINDOW_DAYS} calendar days of the Project Start Date, the refund is what was paid less the greater of ${cancellationFloor(
          p
        )} (${CANCELLATION_FLOOR_PERCENT}% of the Total Fee) or time worked at the Cancellation Rate plus nonrecoverable expenses. On or after the ${CANCELLATION_WINDOW_DAYS}th day, the ${p.depositAmount} paid up front is fully earned and the ${p.balanceAmount} balance falls due. Section 8 controls if this summary and it ever diverge.`,
      ],
    },
    {
      heading: 'Exhibit C — Illustrative Delay and Refund Scenarios',
      paragraphs: [
        'Provided for illustration only — it does not modify Section 8 or Section 10, which control in the event of any inconsistency. The figures below use this engagement\'s actual numbers, so they are the amounts that would really apply.',
        `The numbers these examples use: Total Fee ${p.totalPrice}; paid up front ${
          p.depositAmount
        }; estimated ${estimatedHours(p)} hours; Cancellation Rate ${cancellationRate(
          p
        )} per hour; flat deduction ${cancellationFloor(p)}. The time-worked leg overtakes the flat deduction at ${crossoverHours(
          p
        )} hours.`,
        `Worked example, cancelled early in the window with little time spent: the Client cancels in writing on day 5, by which point ${Math.round(
          estimatedHours(p) * 0.25
        )} hours have gone in — worth ${timeValue(
          p,
          Math.round(estimatedHours(p) * 0.25)
        )}. That is less than the flat ${cancellationFloor(
          p
        )}, so the flat figure is deducted and the Client is refunded ${refundAfterHours(
          p,
          Math.round(estimatedHours(p) * 0.25)
        )} of the ${p.depositAmount} paid.`,
        `Worked example, cancelled later in the window with real work done: the Client cancels on day 12, by which point ${Math.round(
          estimatedHours(p) * 0.5
        )} hours have gone in — worth ${timeValue(
          p,
          Math.round(estimatedHours(p) * 0.5)
        )}. That now exceeds the flat ${cancellationFloor(
          p
        )}, so the time figure is deducted instead and the Client is refunded ${refundAfterHours(
          p,
          Math.round(estimatedHours(p) * 0.5)
        )}. The Client is charged for the work done, not the work done plus a fee.`,
        `Worked example, the deduction exceeds what was paid: if enough time has gone in that the deduction is larger than the ${p.depositAmount} already paid, the refund is zero. It does not become a debt — under Section 8(d) the calculation cannot produce an amount owed by the Client.`,
        `Worked example, cancelled after the window: the Client cancels on day 20. The ${p.depositAmount} paid up front is fully earned and not refundable, and the remaining ${p.balanceAmount} falls due under the payment terms. Hours worked are not recalculated either way.`,
        'Client feedback runs slow, pushing the timeline out: this is a Client-caused delay under Section 6; the timeline extends automatically and no refund is owed.',
        'The Client pays the deposit but never sends content or access: the Kickoff Date under Section 5 never arrives, so neither the timeline nor the cancellation window ever starts. The window cannot expire against a Client whose Project never began.',
        'The Agency goes quiet for over 45 days with no explanation: the Client may issue a written default notice under Section 8(i); if the Agency doesn\'t resume or provide a plan within 15 Business Days, the Client can terminate and be refunded on the Section 8(g) basis — the Agency keeps only the value of work actually performed and accepted, with no cancellation element.',
        'The Client changes their mind mid-Build for reasons unrelated to Agency performance: if that is more than 14 days after the Project Start Date, the money paid is earned and the balance falls due. Giving 30 days\' notice does not reopen the window — what matters is the date written notice is given.',
        'A delivered feature genuinely doesn\'t match the agreed spec: this is a non-conformance under Section 4, corrected at no charge and without counting against the revision allowance.',
        'The Client adds new features mid-Project, then blames the resulting delay on the Agency: added scope is a Change Order under Section 9, and the resulting timeline extension is excluded from the definition of Agency delay.',
        'The Client files a card chargeback instead of requesting a refund: this is treated as a breach separate from the underlying Fee dispute under Section 8(k), and the Agency may suspend access while contesting it with evidence of work performed.',
      ],
    },
  ];

  return [...skeleton, ...conditional, ...exhibits];
}
