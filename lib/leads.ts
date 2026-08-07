// Shared vocabulary for the sales CRM — lead statuses and the checklist of
// common business issues Evan tags when he sizes up a prospect.

// The full sales-methodology pipeline: identify → research → outreach →
// qualify → discovery → mockup → proposal → verbal yes → contract → deposit
// → won. Order matters — it's the sequence pipeline board columns and the
// move-forward/move-back buttons walk through.
export const LEAD_STATUSES = [
  'new',
  'researched',
  'contacted',
  'replied',
  'qualified',
  'discovery_scheduled',
  'discovery_done',
  'mockup_prep',
  'presented',
  'proposal_sent',
  'verbal_yes',
  'contract_sent',
  'contract_signed',
  'deposit_pending',
  'won',
  'lost',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  researched: 'Researched',
  contacted: 'Contacted',
  replied: 'Replied',
  qualified: 'Qualified',
  discovery_scheduled: 'Discovery Booked',
  discovery_done: 'Discovery Done',
  mockup_prep: 'Mockup In Progress',
  presented: 'Mockup Presented',
  proposal_sent: 'Proposal Sent',
  verbal_yes: 'Verbal Yes',
  contract_sent: 'Contract Sent',
  contract_signed: 'Contract Signed',
  deposit_pending: 'Awaiting Deposit',
  won: 'Won',
  lost: 'Lost',
};

// Single source of truth for status pill colors — used by the leads list,
// the pipeline board, and the owner's spreadsheet view, so a status always
// reads the same color everywhere instead of drifting between screens.
export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  new: 'bg-white/10 text-white',
  researched: 'bg-white/10 text-white/80',
  contacted: 'bg-sky-400/20 text-sky-300',
  replied: 'bg-sky-400/25 text-sky-200',
  qualified: 'bg-purple-400/20 text-purple-300',
  discovery_scheduled: 'bg-purple-400/25 text-purple-200',
  discovery_done: 'bg-purple-400/30 text-purple-100',
  mockup_prep: 'bg-pink-400/20 text-pink-300',
  presented: 'bg-pink-400/25 text-pink-200',
  proposal_sent: 'bg-amber-400/20 text-amber-300',
  verbal_yes: 'bg-amber-400/30 text-amber-200',
  contract_sent: 'bg-orange-400/20 text-orange-300',
  contract_signed: 'bg-orange-400/30 text-orange-200',
  deposit_pending: 'bg-teal-400/20 text-teal-300',
  won: 'bg-emerald-400/20 text-emerald-300',
  lost: 'bg-red-400/20 text-red-300',
};

/** Short labels for tight spaces (pipeline board column headers). */
export const LEAD_STATUS_SHORT_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  researched: 'Researched',
  contacted: 'Contacted',
  replied: 'Replied',
  qualified: 'Qualified',
  discovery_scheduled: 'Discovery',
  discovery_done: 'Discovery Done',
  mockup_prep: 'Mockup',
  presented: 'Presented',
  proposal_sent: 'Proposal',
  verbal_yes: 'Verbal Yes',
  contract_sent: 'Contract Sent',
  contract_signed: 'Signed',
  deposit_pending: 'Deposit',
  won: 'Won',
  lost: 'Lost',
};

/** Non-terminal statuses, in pipeline order — used for board columns and move next/back. */
export const ACTIVE_LEAD_STATUSES = LEAD_STATUSES.filter(
  (s) => s !== 'won' && s !== 'lost'
) as Exclude<LeadStatus, 'won' | 'lost'>[];

/**
 * The board's columns.
 *
 * Sixteen statuses is the right granularity for *describing* a deal and the
 * wrong granularity for *looking* at a pipeline: one column per status made
 * the board a sixteen-wide horizontal scroll, which is a lot of dragging on a
 * laptop and completely unusable on a phone. Grouped, the same sixteen become
 * six columns you can see at once.
 *
 * The statuses themselves are untouched, and moving a card still steps one
 * status at a time — a card simply re-homes to a different column when it
 * crosses a boundary, and carries its exact status on its face. Collapsing
 * the view must not coarsen the data underneath it.
 */
export interface LeadStage {
  key: string;
  label: string;
  /** One line explaining what this stage means, for the column header. */
  hint: string;
  statuses: readonly LeadStatus[];
}

export const LEAD_STAGES: readonly LeadStage[] = [
  {
    key: 'prospect',
    label: 'Prospects',
    hint: 'Found, not yet spoken to',
    statuses: ['new', 'researched'],
  },
  {
    key: 'talking',
    label: 'Talking',
    hint: 'Contact made, working out if it is real',
    statuses: ['contacted', 'replied', 'qualified'],
  },
  {
    key: 'discovery',
    label: 'Discovery',
    hint: 'A call is booked or has happened',
    statuses: ['discovery_scheduled', 'discovery_done'],
  },
  {
    key: 'pitching',
    label: 'Pitching',
    hint: 'Building or showing them something',
    statuses: ['mockup_prep', 'presented'],
  },
  {
    key: 'closing',
    label: 'Closing',
    hint: 'Price is out, waiting on signature or payment',
    statuses: ['proposal_sent', 'verbal_yes', 'contract_sent', 'contract_signed', 'deposit_pending'],
  },
  {
    key: 'closed',
    label: 'Closed',
    hint: 'Won or lost',
    statuses: ['won', 'lost'],
  },
] as const;

/** Which column a status belongs in. */
export function stageForStatus(status: LeadStatus): LeadStage {
  // Falls back to the first stage rather than throwing: an unrecognised status
  // is a row that should still appear on the board somewhere, not a crash.
  return LEAD_STAGES.find((stage) => stage.statuses.includes(status)) ?? LEAD_STAGES[0];
}

/** Realistic starting points when quick-adding a lead — early-pipeline stages only.
 * Deeper stages (discovery/mockup/proposal/contract) get set as things actually progress. */
export const QUICK_ADD_STATUSES = [
  'new',
  'researched',
  'contacted',
  'replied',
  'qualified',
] as const satisfies readonly LeadStatus[];

export type PainPointKey =
  | 'no-website'
  | 'outdated-design'
  | 'not-mobile-friendly'
  | 'slow-site'
  | 'poor-seo'
  | 'no-analytics'
  | 'no-app'
  | 'manual-processes'
  | 'no-booking'
  | 'no-ecommerce'
  | 'weak-branding'
  | 'security-concerns'
  | 'scaling-issues'
  | 'disconnected-tools';

export const PAIN_POINTS: Record<PainPointKey, string> = {
  'no-website': 'No website at all',
  'outdated-design': 'Outdated design',
  'not-mobile-friendly': 'Not mobile-friendly',
  'slow-site': 'Slow loading times',
  'poor-seo': 'Poor / no SEO',
  'no-analytics': 'No analytics or tracking',
  'no-app': 'No mobile app',
  'manual-processes': 'Manual processes that could be automated',
  'no-booking': 'No online booking / scheduling',
  'no-ecommerce': "Can't sell online",
  'weak-branding': 'Weak or inconsistent branding',
  'security-concerns': 'Security or compliance concerns',
  'scaling-issues': "Current systems can't scale",
  'disconnected-tools': "Tools don't talk to each other",
};

/**
 * `dial` is the one type in here nobody writes by hand.
 *
 * Every other entry is somebody's account of what happened. A dial is the
 * system's: the moment a number was actually tapped, recorded before the
 * phone app takes the screen, with no button to press and no way to skip it.
 * That distinction is the whole point — "how many calls did you make" and
 * "how many did you tell me about" are different questions, and only one of
 * them could be answered before.
 */
export const LEAD_ACTIVITY_TYPES = [
  'note',
  'email',
  'call',
  'dial',
  'loom',
  'proposal',
  'objection',
] as const;
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

export const LEAD_ACTIVITY_LABELS: Record<LeadActivityType, string> = {
  note: 'Note',
  email: 'Email',
  call: 'Call',
  dial: 'Number dialled',
  loom: 'Loom Video',
  proposal: 'Proposal',
  objection: 'Objection',
};

/**
 * Whether the lead has read the words in this entry.
 *
 * The timeline mixes two things that look identical and are not. An email or
 * a proposal is text the lead has in their inbox. A note, a call write-up, an
 * objection — those are ours: our summary of what they said, in our words,
 * often blunter than anything we would put in front of them.
 *
 * Nothing distinguished them, so the whole timeline read as a record of the
 * conversation, and the failure mode is a rep skim-reading it before a call
 * and quoting our own private summary back at the person it is about.
 *
 * A call is deliberately internal. The lead knows the call happened; they
 * have never seen "sounded like he's shopping us against two others". The
 * question this answers is not "does the lead know about this" but "could I
 * read this text out to them", and for a call log the answer is no.
 */
export const LEAD_ACTIVITY_SEEN_BY_LEAD: Record<LeadActivityType, boolean> = {
  note: false,
  call: false,
  dial: false,
  objection: false,
  email: true,
  proposal: true,
  loom: true,
};

export function leadActivityIsInternal(type: string): boolean {
  // An unrecognised type is treated as internal. Guessing wrong in that
  // direction hides something from a screen only we can see; guessing wrong
  // the other way is how a private note gets quoted to a customer.
  return !(isLeadActivityType(type) && LEAD_ACTIVITY_SEEN_BY_LEAD[type]);
}

export const LOST_REASON_PRESETS = [
  'Went with a competitor',
  'Too expensive',
  'Bad timing / no budget right now',
  'Went quiet — stopped responding',
  'Decided not to move forward with a project at all',
  'Timeline too long',
] as const;

export function isPainPointKey(value: string): value is PainPointKey {
  // Own-property check, not `in` — otherwise "toString" and "constructor"
  // read as valid pain points and index into Object.prototype.
  return Object.prototype.hasOwnProperty.call(PAIN_POINTS, value);
}

// Turns a lead's comma-separated pain point keys into a natural-language
// clause for the "specific problem to reference" field in cold outreach and
// follow-up emails — e.g. "the site isn't mobile-friendly and loads slowly"
// instead of a generic "noticed a couple of things".
export function painPointSentence(painPoints: string): string | null {
  const labels = painPoints
    .split(',')
    .map((p) => p.trim())
    .filter(isPainPointKey)
    .map((key) => PAIN_POINTS[key].toLowerCase());

  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * A lead that's still sitting at "New" or "Researched" hasn't actually been
 * talked to yet — the moment an email goes out, that's no longer true.
 * Returns 'contacted' when the current status is earlier in the pipeline
 * than that, otherwise returns the status unchanged so a lead that's
 * already further along (replied, qualified, etc.) never gets moved
 * backwards by a routine follow-up email.
 */
export function advanceToContactedOnOutreach(currentStatus: string): string {
  return currentStatus === 'new' || currentStatus === 'researched' ? 'contacted' : currentStatus;
}

/**
 * A generic "Subject: ...\n\n<body>" cold-email draft for leads that don't
 * have a bespoke personalisedColdEmail from CSV research — so "send all"
 * doesn't silently skip them just because nobody wrote a custom line yet.
 * Uses whatever personalization is on file (observation, then pain points)
 * and falls back to a plain first-contact line if there's neither.
 * [First Name] and [Sender Name] are resolved at send/preview time.
 */
export function buildFallbackColdEmailDraft(lead: {
  company: string;
  painPoints: string;
  personalizedObservation: string | null;
}): string {
  const observation =
    lead.personalizedObservation?.trim() ||
    (() => {
      const sentence = painPointSentence(lead.painPoints);
      return sentence ? `your website currently has ${sentence}` : null;
    })();

  const hook = observation
    ? `One thing stood out to me: ${observation}.`
    : `I wanted to reach out because I think there's an opportunity to help ${lead.company} stand out more online.`;

  return [
    `Subject: Thoughts on ${lead.company}`,
    '',
    `Hi [First Name],`,
    '',
    `I came across ${lead.company} while researching businesses in your industry and spent some time looking through your online presence.`,
    '',
    hook,
    '',
    `Rather than sending a generic pitch, we'd like to earn the opportunity to work with you by putting together a free, no-obligation concept for your homepage — no strings attached.`,
    '',
    `Would you be open to a quick 15-minute conversation next week?`,
    '',
    `Best,`,
    `[Sender Name]`,
  ].join('\n');
}

/**
 * Whether `target` is further along the pipeline than `current` — used to
 * auto-advance a lead's stage (e.g. generating a contract bumps it to
 * "Contract Sent") without ever accidentally moving it backwards or past
 * a terminal won/lost state.
 */
export function isFurtherAlong(current: string, target: LeadStatus): boolean {
  if (current === 'won' || current === 'lost') return false;
  const currentIdx = LEAD_STATUSES.indexOf(current as LeadStatus);
  const targetIdx = LEAD_STATUSES.indexOf(target);
  return targetIdx > currentIdx;
}

export function isLeadActivityType(value: string): value is LeadActivityType {
  return (LEAD_ACTIVITY_TYPES as readonly string[]).includes(value);
}

/**
 * What to write to `wonAt` on a status change, if anything.
 *
 * Three paths mark a lead won — the lead editor, converting one into a
 * project, and the Stripe webhook — and they must agree, because the number
 * this feeds is a commission figure. The rules, in order:
 *
 *   - Not moving to "won"? Leave the column alone (`undefined`, so Prisma
 *     omits it from the update).
 *   - Already won and already stamped? Leave it alone too. Re-saving a won
 *     deal must not re-date it — that is the whole bug this column exists
 *     for, and it would come straight back if any write path re-stamped.
 *   - Otherwise stamp it: either a genuine transition into "won", or a row
 *     that was won before this column existed and never got backfilled.
 *
 * Moving *out* of "won" deliberately keeps the old stamp rather than
 * clearing it. A deal marked won by mistake and corrected the same hour is
 * rarer than one reopened and re-closed, and for the second case the
 * original close date is the one worth keeping.
 */
export function wonAtForStatusChange(
  nextStatus: string | undefined,
  existing: { status: string; wonAt: Date | null },
  now: Date = new Date()
): Date | undefined {
  const resulting = nextStatus ?? existing.status;
  if (resulting !== 'won') return undefined;
  if (existing.wonAt) return undefined;
  return now;
}

/**
 * The same rule for the other way a deal ends.
 *
 * Deliberately a mirror of wonAtForStatusChange rather than a generalisation
 * of it — the two are only ever called with a status in hand, and one
 * function taking a "which end" argument would read worse at every call site
 * than two that say what they stamp.
 *
 * "Lost" is written from fewer places than "won" — the lead editor and a
 * "not interested" call outcome — but it feeds the lost-reason breakdown and
 * the analytics page's won/lost split, both of which dated a decision by
 * `updatedAt`. So correcting a typo on a lead lost in March counted its
 * reason into the current quarter a second time.
 */
export function lostAtForStatusChange(
  nextStatus: string | undefined,
  existing: { status: string; lostAt: Date | null },
  now: Date = new Date()
): Date | undefined {
  const resulting = nextStatus ?? existing.status;
  if (resulting !== 'lost') return undefined;
  if (existing.lostAt) return undefined;
  return now;
}

/** One hand-written sales point: the headline, and why it applies to this business. */
export interface SalesPoint {
  point: string;
  explanation: string | null;
  /**
   * What this item costs for THIS lead, recorded at import time rather than
   * worked out again every time the page renders. Null only for points
   * written before prices were carried on the line at all.
   */
  priceCents: number | null;
  /**
   * True when the item didn't match anything in the sales playbook, so the
   * price beside it is a suggestion nobody has signed off yet. These are
   * the lines Kiana and Evan have to actually decide on before a PDF or a
   * proposal goes out, which is why they're marked rather than blended in.
   */
  isCustom: boolean;
}

/**
 * The part of a point the call script and the email templates care about:
 * the words, not the money. Kept separate so a caller assembling points on
 * the fly — from the pain-point checklist, say — doesn't have to invent a
 * price it has no use for.
 */
export type WrittenPoint = Pick<SalesPoint, 'point' | 'explanation'>;

// Prices ride on the end of a point line after a pipe, because the line is
// still edited as plain text in a textarea and anything heavier (a second
// column, a JSON blob) would mean the rep can no longer just type. A bare
// number is a settled price; "custom" in front of it means nobody has agreed
// it yet:
//
//   Booking system: they lose the after-hours calls | $900
//   Drone photography: nobody local offers it | custom $1,500
const PRICE_SUFFIX = /\|\s*(custom\s*)?\$?\s*([0-9][0-9,.]*)\s*$/i;

/** "$1,200" / "1200" -> 120000 cents. Null for anything that isn't a number. */
export function parsePointPriceCents(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const dollars = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return !isNaN(dollars) && dollars > 0 ? Math.round(dollars * 100) : null;
}

/**
 * Parses the "Point: explanation written for this business" lines that come
 * out of the research CSV into something renderable. One point per line,
 * with an optional "| $900" or "| custom $1,500" price on the end.
 *
 * The point/explanation split is on the FIRST colon only, because
 * explanations routinely contain colons of their own ("Booking: they lose
 * bookings after 6pm: the phone goes unanswered"). A line with no colon is
 * still a valid point — it just has no explanation yet, which is better
 * than dropping it.
 */
export function parseSalesPoints(text: string | null | undefined): SalesPoint[] {
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((rawLine) => {
      const priceMatch = rawLine.match(PRICE_SUFFIX);
      const line = priceMatch ? rawLine.slice(0, priceMatch.index).trim() : rawLine;
      const priceCents = priceMatch ? parsePointPriceCents(priceMatch[2]) : null;
      const isCustom = !!priceMatch?.[1];

      const idx = line.indexOf(':');
      if (idx === -1) return { point: line, explanation: null, priceCents, isCustom };
      const point = line.slice(0, idx).trim();
      const explanation = line.slice(idx + 1).trim();
      // A leading colon, or a "point" that's really a sentence, means the
      // author didn't use the format — keep the whole line as the point.
      if (!point) return { point: explanation, explanation: null, priceCents, isCustom };
      return { point, explanation: explanation || null, priceCents, isCustom };
    });
}

/**
 * The inverse of parseSalesPoints() for a single point — used by the
 * importer to write a resolved price back onto the line it came from, so
 * the price is stored in the database rather than recomputed on every read.
 */
export function formatSalesPoint(p: SalesPoint): string {
  const body = p.explanation ? `${p.point}: ${p.explanation}` : p.point;
  if (p.priceCents === null) return body;
  const dollars = Math.round(p.priceCents / 100).toLocaleString('en-US');
  return `${body} | ${p.isCustom ? 'custom ' : ''}$${dollars}`;
}

/** Serialises a whole group back to the newline-separated column format. */
export function formatSalesPoints(points: SalesPoint[]): string | null {
  const lines = points.map(formatSalesPoint).filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : null;
}
