// Shared vocabulary for the sales CRM — lead statuses and the checklist of
// common business issues Evan tags when he sizes up a prospect.

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'won',
  'lost',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal: 'Proposal Sent',
  won: 'Won',
  lost: 'Lost',
};

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

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

export function isLeadActivityType(value: string): value is LeadActivityType {
  return (LEAD_ACTIVITY_TYPES as readonly string[]).includes(value);
}
