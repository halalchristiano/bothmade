import { discountedMonthlyCents, type DiscountType } from '@/lib/recurring';

/**
 * The arithmetic behind the Analytics page.
 *
 * Split out from the route because every number on that page was wrong in a
 * way you could only catch by writing the case down. The conversion rate
 * divided wins by every lead ever entered, so it fell a little every time
 * somebody imported a list and could never rise; the pipeline summed
 * `estimatedValue`, a field that is usually blank; recurring revenue — the
 * whole point of selling care plans — appeared in no total, no chart and no
 * headline. A dashboard that is confidently wrong is worse than no dashboard,
 * because people plan around it.
 */

export type AnalyticsRange = '30d' | '90d' | '12mo' | 'all';

export const ANALYTICS_RANGES: Array<{ value: AnalyticsRange; label: string }> = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '12mo', label: '12 months' },
  { value: 'all', label: 'All time' },
];

export function isAnalyticsRange(value: unknown): value is AnalyticsRange {
  return value === '30d' || value === '90d' || value === '12mo' || value === 'all';
}

/** Null for "all time" — the caller leaves the date filter off entirely. */
export function analyticsRangeStart(range: AnalyticsRange, now: Date): Date | null {
  if (range === 'all') return null;
  const days = range === '30d' ? 30 : range === '90d' ? 90 : 365;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * What a deal is worth, in descending order of how much the number can be
 * trusted: what the client is actually being billed, then what we quoted
 * them, then what somebody guessed on the day the lead was created.
 *
 * Same waterfall the leads list uses. Two pages disagreeing about what a deal
 * was worth is how nobody believes either.
 */
export function dealValueCents(
  lead: { id: string; proposalTotalPrice?: number | null; estimatedValue?: number | null },
  soldFor: Map<string, number>
): number {
  return soldFor.get(lead.id) ?? lead.proposalTotalPrice ?? lead.estimatedValue ?? 0;
}

/** True when the figure came from a contract or a quote rather than a guess. */
export function dealValueIsFirm(
  lead: { id: string; proposalTotalPrice?: number | null },
  soldFor: Map<string, number>
): boolean {
  return soldFor.has(lead.id) || Boolean(lead.proposalTotalPrice);
}

/**
 * Won as a share of decided, not of everything ever entered.
 *
 * The old reading answered "what fraction of all the companies we have ever
 * heard of have bought something", which is a number that only moves down and
 * that no decision depends on. This one answers "when a deal reaches a
 * conclusion, how often is it a yes" — which is the question, and which can
 * be improved.
 */
export function conversionRate(won: number, lost: number): number {
  const decided = won + lost;
  return decided > 0 ? won / decided : 0;
}

/**
 * Whole months between two dates, counting only months that have completed.
 *
 * A plan accepted on the 20th is in its first month until the 20th of the
 * next month — billing anniversaries are what Stripe charges on, so the
 * day-of-month has to be respected or a plan reads as one month further
 * along than it is and gets reported at the wrong rate.
 */
export function monthsElapsed(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(0, months - (to.getDate() < from.getDate() ? 1 : 0));
}

export interface ActivePlan {
  acceptedAt: Date | null;
  monthlyCents: number;
  discountType: string;
  discountValue: number;
  freeMonths: number;
  discountMonths: number;
}

/**
 * What an active care plan is billing *this* month.
 *
 * A plan's price changes twice over its first fifteen months — free, then
 * introductory, then standard — so a single "monthly rate" column would
 * describe most plans wrongly. Reporting the standard rate as current MRR
 * overstates income by the discount; reporting the discounted rate forever
 * understates it. Neither is a number to plan against, so both are returned:
 * this one, and the run rate below.
 */
export function billingThisMonthCents(plan: ActivePlan, now: Date): number {
  if (!plan.acceptedAt) return 0;
  const elapsed = monthsElapsed(plan.acceptedAt, now);
  if (elapsed < plan.freeMonths) return 0;
  if (elapsed < plan.freeMonths + plan.discountMonths) {
    return discountedMonthlyCents(plan.monthlyCents, plan.discountType as DiscountType, plan.discountValue);
  }
  return plan.monthlyCents;
}

/** What the same plans bill once every introductory period has run out. */
export function runRateCents(plans: ActivePlan[]): number {
  return plans.reduce((sum, plan) => sum + plan.monthlyCents, 0);
}

export interface MonthBucket {
  /** `2026-08` — sortable, and what the route keys its sums by. */
  key: string;
  label: string;
}

/**
 * The months a chart should show, oldest first.
 *
 * Capped at twelve because a bar chart of forty months on a phone is a grey
 * smear, and because a year is the comparison anybody actually makes.
 */
export function monthBuckets(start: Date | null, now: Date, max = 12): MonthBucket[] {
  // Calendar months touched, not whole months elapsed. A 30-day range that
  // begins on 6 July and ends on 5 August is under one month old and still
  // spans two bars; counting elapsed months would draw it as one, and the
  // July half of the money would have nowhere to land.
  const monthsBack = start
    ? Math.min(
        max,
        (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1
      )
    : max;
  const buckets: MonthBucket[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'short' }),
    });
  }
  return buckets;
}

/** The `2026-08` a timestamp falls in. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Lost reasons, commonest first, with everything unexplained gathered into
 * one honest row rather than spread across blanks.
 */
export function lostReasonBreakdown(
  leads: Array<{ lostReason?: string | null }>
): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const reason = lead.lostReason?.trim() || 'No reason recorded';
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}
