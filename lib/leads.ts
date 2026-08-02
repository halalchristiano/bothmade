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

export const LEAD_ACTIVITY_TYPES = ['note', 'email', 'call', 'loom', 'proposal'] as const;
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

export const LEAD_ACTIVITY_LABELS: Record<LeadActivityType, string> = {
  note: 'Note',
  email: 'Email',
  call: 'Call',
  loom: 'Loom Video',
  proposal: 'Proposal',
};

export const LOST_REASON_PRESETS = [
  'Went with a competitor',
  'Too expensive',
  'Bad timing / no budget right now',
  'Went quiet — stopped responding',
  'Decided not to move forward with a project at all',
  'Timeline too long',
] as const;

export function isPainPointKey(value: string): value is PainPointKey {
  return value in PAIN_POINTS;
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
