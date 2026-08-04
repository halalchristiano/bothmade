// Recurring care plans — the monthly services a client can be signed onto
// after the build, whether or not they took them at the start.
//
// Two shapes of the same subscription, and the difference is only how many
// months are already paid for:
//
//   Taken up front. The catalogue says "first month included in the price",
//   and by the time the upsell conversation happens the second month has been
//   covered by the project payment too. So billing starts at month 3, runs 12
//   months at the discounted rate, then reverts to the standard one.
//
//   Sold later. Nothing is prepaid, so billing starts immediately, runs 12
//   months at the discounted rate, then reverts.
//
// The revert is the part worth being careful about: a first-year discount that
// silently becomes permanent is a pricing decision nobody made. It's enforced
// in Stripe by a repeating coupon with a fixed duration rather than by us
// remembering to raise the price twelve months later — see
// `couponDurationMonths` below for how the free months are accounted for.

import { ADD_ONS, formatCents, type AddOnKey } from '@/lib/pricing';

/** How long the introductory rate lasts before the standard rate resumes. */
export const DISCOUNT_MONTHS = 12;

/**
 * Months already covered when the service was in the original scope — the
 * "first month included" the catalogue promises, plus the second month, which
 * the project payment covers as the sweetener for signing on for the year.
 */
export const COVERED_MONTHS = 2;

/**
 * The most that can be taken off the standard rate.
 *
 * Deliberately looser than the 15% floor on project pricing
 * (`MAX_DISCOUNT_PERCENT`): a care plan sold at the end of a project is
 * revenue that mostly wasn't going to happen, so there's real room to trade.
 * It is still a floor — an introductory rate this far below cost stops being
 * an introduction and starts being the price they'll expect forever.
 */
export const MAX_RECURRING_DISCOUNT_PERCENT = 50;

export type DiscountType = 'percent' | 'amount';

export function isDiscountType(value: unknown): value is DiscountType {
  return value === 'percent' || value === 'amount';
}

/**
 * The catalogue's recurring services, derived from the "Ongoing Care"
 * category rather than listed again here — a new monthly add-on becomes
 * offerable by being added to ADD_ONS, with nothing else to remember.
 */
export const RECURRING_ADD_ON_KEYS: AddOnKey[] = (Object.keys(ADD_ONS) as AddOnKey[]).filter(
  (key) => ADD_ONS[key].category === 'ongoing-care'
);

export function isRecurringAddOn(value: string): value is AddOnKey {
  return (RECURRING_ADD_ON_KEYS as string[]).includes(value);
}

/** Parses a comma-separated column into recurring add-on keys, dropping anything else. */
export function parseRecurringAddOns(csv: string | null | undefined): AddOnKey[] {
  if (!csv) return [];
  const seen = new Set<AddOnKey>();
  for (const raw of csv.split(',')) {
    const key = raw.trim();
    if (isRecurringAddOn(key)) seen.add(key);
  }
  return Array.from(seen);
}

/** The standard monthly rate for a set of care services, in cents. */
export function monthlyRateCents(keys: AddOnKey[]): number {
  return keys.reduce((sum, key) => sum + ADD_ONS[key].price, 0);
}

/**
 * What they actually pay each month during the introductory year.
 *
 * Rounded to whole cents and floored at zero — a fixed amount-off larger than
 * the rate would otherwise produce a negative charge, and Stripe would reject
 * it at the least convenient moment (after the client clicked Pay).
 */
export function discountedMonthlyCents(
  monthlyCents: number,
  discountType: DiscountType,
  discountValue: number
): number {
  if (discountValue <= 0) return monthlyCents;
  const discounted =
    discountType === 'percent'
      ? Math.round(monthlyCents * (1 - discountValue / 100))
      : monthlyCents - Math.round(discountValue);
  return Math.max(0, discounted);
}

export interface DiscountCheck {
  ok: boolean;
  /** Present when `ok` is false — wording meant to be shown to whoever set it. */
  error?: string;
}

/**
 * Rejects a discount before it reaches Stripe, where the same mistake surfaces
 * as an opaque API error in front of a client mid-checkout.
 */
export function validateDiscount(
  monthlyCents: number,
  discountType: DiscountType,
  discountValue: number
): DiscountCheck {
  if (!Number.isFinite(discountValue) || discountValue < 0) {
    return { ok: false, error: 'The discount has to be a positive number (or zero for none).' };
  }
  if (discountType === 'percent') {
    if (discountValue > MAX_RECURRING_DISCOUNT_PERCENT) {
      return {
        ok: false,
        error: `The most that can be taken off a care plan is ${MAX_RECURRING_DISCOUNT_PERCENT}%.`,
      };
    }
    return { ok: true };
  }
  if (discountValue >= monthlyCents) {
    return {
      ok: false,
      error: `That's more than the monthly rate of ${formatCents(monthlyCents)} — the plan would be free.`,
    };
  }
  const asPercent = (discountValue / monthlyCents) * 100;
  if (asPercent > MAX_RECURRING_DISCOUNT_PERCENT) {
    return {
      ok: false,
      error: `That's ${Math.round(asPercent)}% off, and the most that can be taken off a care plan is ${MAX_RECURRING_DISCOUNT_PERCENT}%.`,
    };
  }
  return { ok: true };
}

export interface CarePlanTerms {
  addOns: AddOnKey[];
  /** The standard rate the plan reverts to, in cents per month. */
  monthlyCents: number;
  discountType: DiscountType;
  discountValue: number;
  /** Months at no charge before billing starts — `COVERED_MONTHS` or 0. */
  freeMonths: number;
  /** How many billed months run at the introductory rate. */
  discountMonths: number;
}

export interface CarePlanSchedule extends CarePlanTerms {
  discountedCents: number;
  savingsPerMonth: number;
  /** What the introductory year saves them in total, free months included. */
  firstYearSavings: number;
  /** 1-based month of the first charge. */
  firstBilledMonth: number;
  /** 1-based month the standard rate resumes. */
  standardRateFromMonth: number;
  /**
   * What Stripe's repeating coupon has to be set to.
   *
   * The discount's clock starts when the subscription does, not when billing
   * does, so a plan with free months up front needs those months added on top
   * of the twelve — otherwise the trial eats into the introductory year and
   * they get ten discounted invoices instead of twelve.
   */
  couponDurationMonths: number;
}

export function buildSchedule(terms: CarePlanTerms): CarePlanSchedule {
  const discountedCents = discountedMonthlyCents(
    terms.monthlyCents,
    terms.discountType,
    terms.discountValue
  );
  const savingsPerMonth = terms.monthlyCents - discountedCents;

  return {
    ...terms,
    discountedCents,
    savingsPerMonth,
    firstYearSavings: savingsPerMonth * terms.discountMonths + terms.monthlyCents * terms.freeMonths,
    firstBilledMonth: terms.freeMonths + 1,
    standardRateFromMonth: terms.freeMonths + terms.discountMonths + 1,
    couponDurationMonths: terms.freeMonths + terms.discountMonths,
  };
}

/**
 * The schedule in the words a client reads on the offer page and in the
 * emailed confirmation. One source for both, so what they agreed to and what
 * they were later told they agreed to cannot drift apart.
 */
export function scheduleLines(schedule: CarePlanSchedule): Array<{ period: string; detail: string }> {
  const lines: Array<{ period: string; detail: string }> = [];

  if (schedule.freeMonths > 0) {
    lines.push({
      period:
        schedule.freeMonths === 1 ? 'Month 1' : `Months 1–${schedule.freeMonths}`,
      detail: 'No charge — already covered by your project.',
    });
  }

  const introEnd = schedule.standardRateFromMonth - 1;
  lines.push({
    period:
      schedule.firstBilledMonth === introEnd
        ? `Month ${schedule.firstBilledMonth}`
        : `Months ${schedule.firstBilledMonth}–${introEnd}`,
    detail:
      schedule.savingsPerMonth > 0
        ? `${formatCents(schedule.discountedCents)}/month — ${formatCents(schedule.savingsPerMonth)}/month off the standard rate.`
        : `${formatCents(schedule.discountedCents)}/month.`,
  });

  lines.push({
    period: `Month ${schedule.standardRateFromMonth} onward`,
    detail: `${formatCents(schedule.monthlyCents)}/month — the standard rate.`,
  });

  return lines;
}

/** A one-line label for the plan, e.g. "Managed Hosting + Maintenance Plan". */
export function planLabel(keys: AddOnKey[]): string {
  if (keys.length === 0) return 'Care plan';
  return keys.map((key) => ADD_ONS[key].label).join(' + ');
}

/**
 * Exact calendar months expressed in days, for Stripe's `trial_period_days` —
 * which only speaks days, while "two months free" is a calendar promise.
 *
 * Clamped to the end of the target month so the 31st of January plus one month
 * is the 28th of February rather than the 3rd of March.
 */
export function monthsAsDays(from: Date, months: number): number {
  if (months <= 0) return 0;
  const target = new Date(from.getTime());
  const dayOfMonth = target.getUTCDate();
  target.setUTCMonth(target.getUTCMonth() + months);
  if (target.getUTCDate() !== dayOfMonth) target.setUTCDate(0);
  return Math.max(1, Math.round((target.getTime() - from.getTime()) / 86_400_000));
}

/**
 * How many free months a plan should default to: the covered two only when
 * every service being offered was already in the project's scope.
 *
 * A mixed offer — one service they've been paying for alongside one they
 * haven't — defaults to none rather than handing over free months on
 * something brand new. Whoever is selling it can still set it deliberately.
 */
export function defaultFreeMonths(offered: AddOnKey[], alreadyInScope: AddOnKey[]): number {
  if (offered.length === 0) return 0;
  const inScope = new Set(alreadyInScope);
  return offered.every((key) => inScope.has(key)) ? COVERED_MONTHS : 0;
}

export const OFFER_STATUSES = ['sent', 'active', 'declined', 'canceled'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  sent: 'Offer sent',
  active: 'Active',
  declined: 'Declined',
  canceled: 'Canceled',
};

/** An offer that can still be accepted — nothing else may open a checkout. */
export function isOpenOffer(status: string): boolean {
  return status === 'sent';
}
