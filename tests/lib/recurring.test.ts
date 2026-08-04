import { describe, expect, it } from 'vitest';
import {
  COVERED_MONTHS,
  DISCOUNT_MONTHS,
  MAX_RECURRING_DISCOUNT_PERCENT,
  RECURRING_ADD_ON_KEYS,
  buildSchedule,
  defaultFreeMonths,
  discountedMonthlyCents,
  isRecurringAddOn,
  monthlyRateCents,
  monthsAsDays,
  parseRecurringAddOns,
  scheduleLines,
  validateDiscount,
} from '@/lib/recurring';
import { ADD_ONS } from '@/lib/pricing';

/**
 * A care plan's price changes twice — free, introductory, standard — and the
 * whole arrangement only works if the third change happens by itself. These
 * pin the arithmetic that decides when each phase starts and ends, because
 * every way of getting it wrong is a client either overcharged or discounted
 * forever, and neither is visible until months later.
 */

const HOSTING = 'hosting' as const;
const MAINTENANCE = 'maintenance' as const;

describe('the catalogue of recurring services', () => {
  it('is derived from the ongoing-care category, not listed twice', () => {
    for (const key of RECURRING_ADD_ON_KEYS) {
      expect(ADD_ONS[key].category).toBe('ongoing-care');
    }
    expect(RECURRING_ADD_ON_KEYS).toContain(HOSTING);
    expect(RECURRING_ADD_ON_KEYS).toContain(MAINTENANCE);
  });

  it('refuses one-off add-ons — a monthly charge for a logo is not a plan', () => {
    expect(isRecurringAddOn('brand-identity')).toBe(false);
    expect(isRecurringAddOn('seo')).toBe(false);
    expect(isRecurringAddOn(HOSTING)).toBe(true);
  });

  it('reads a project\'s add-on column back as only its recurring services', () => {
    expect(parseRecurringAddOns('seo,hosting,analytics,maintenance')).toEqual([HOSTING, MAINTENANCE]);
    expect(parseRecurringAddOns('')).toEqual([]);
    expect(parseRecurringAddOns(null)).toEqual([]);
  });

  it('never counts the same service twice', () => {
    expect(parseRecurringAddOns('hosting,hosting')).toEqual([HOSTING]);
  });

  it('sums the monthly rate off the catalogue', () => {
    expect(monthlyRateCents([HOSTING, MAINTENANCE])).toBe(
      ADD_ONS[HOSTING].price + ADD_ONS[MAINTENANCE].price
    );
  });
});

describe('the introductory rate', () => {
  it('takes a percentage off', () => {
    expect(discountedMonthlyCents(20000, 'percent', 25)).toBe(15000);
  });

  it('takes a fixed amount off', () => {
    expect(discountedMonthlyCents(20000, 'amount', 3000)).toBe(17000);
  });

  it('is the standard rate when no discount was set', () => {
    expect(discountedMonthlyCents(20000, 'percent', 0)).toBe(20000);
  });

  it('never goes negative, whatever it is handed', () => {
    expect(discountedMonthlyCents(20000, 'amount', 50000)).toBe(0);
  });
});

describe('what a discount is allowed to be', () => {
  it('accepts an ordinary one', () => {
    expect(validateDiscount(20000, 'percent', 15).ok).toBe(true);
    expect(validateDiscount(20000, 'amount', 3000).ok).toBe(true);
  });

  it('refuses more than the cap, as a percentage', () => {
    const check = validateDiscount(20000, 'percent', MAX_RECURRING_DISCOUNT_PERCENT + 1);
    expect(check.ok).toBe(false);
    expect(check.error).toMatch(new RegExp(`${MAX_RECURRING_DISCOUNT_PERCENT}%`));
  });

  it('refuses more than the cap when it is written as dollars instead', () => {
    // The same discount expressed the other way has to hit the same ceiling,
    // or the cap is one dropdown away from meaning nothing.
    expect(validateDiscount(20000, 'amount', 15000).ok).toBe(false);
  });

  it('refuses a discount that would make the plan free', () => {
    const check = validateDiscount(20000, 'amount', 20000);
    expect(check.ok).toBe(false);
    expect(check.error).toMatch(/free/i);
  });

  it('refuses a negative discount, which would be a surcharge', () => {
    expect(validateDiscount(20000, 'percent', -10).ok).toBe(false);
  });
});

describe('the schedule when the service was already in scope', () => {
  const schedule = buildSchedule({
    addOns: [HOSTING],
    monthlyCents: 20000,
    discountType: 'percent',
    discountValue: 25,
    freeMonths: COVERED_MONTHS,
    discountMonths: DISCOUNT_MONTHS,
  });

  it('bills nothing until month three', () => {
    expect(schedule.freeMonths).toBe(2);
    expect(schedule.firstBilledMonth).toBe(3);
  });

  it('runs twelve billed months at the introductory rate', () => {
    expect(schedule.discountedCents).toBe(15000);
    expect(schedule.standardRateFromMonth - schedule.firstBilledMonth).toBe(DISCOUNT_MONTHS);
  });

  it('reverts to the standard rate at month fifteen', () => {
    expect(schedule.standardRateFromMonth).toBe(15);
  });

  /**
   * The one that costs money silently. Stripe starts a repeating coupon's
   * clock when the subscription starts, not when billing starts — so a
   * fourteen-month plan with a twelve-month coupon gives ten discounted
   * invoices, not twelve, and the client quietly pays full price for two
   * months they were promised at the introductory rate.
   */
  it('lengthens the coupon by the free months so twelve billed months are actually discounted', () => {
    expect(schedule.couponDurationMonths).toBe(COVERED_MONTHS + DISCOUNT_MONTHS);
    expect(schedule.couponDurationMonths).not.toBe(DISCOUNT_MONTHS);
  });

  it('counts the free months in what the first year saves them', () => {
    // Two months at full rate never charged, plus twelve months of discount.
    expect(schedule.firstYearSavings).toBe(20000 * 2 + 5000 * 12);
  });
});

describe('the schedule for a cold upsell', () => {
  const schedule = buildSchedule({
    addOns: [HOSTING],
    monthlyCents: 20000,
    discountType: 'percent',
    discountValue: 25,
    freeMonths: 0,
    discountMonths: DISCOUNT_MONTHS,
  });

  it('bills from the first month, since nothing is prepaid', () => {
    expect(schedule.firstBilledMonth).toBe(1);
  });

  it('reverts a year later', () => {
    expect(schedule.standardRateFromMonth).toBe(13);
    expect(schedule.couponDurationMonths).toBe(DISCOUNT_MONTHS);
  });

  it('saves them the discount alone', () => {
    expect(schedule.firstYearSavings).toBe(5000 * 12);
  });
});

describe('what the client is shown', () => {
  it('names all three phases, ending with the standard rate', () => {
    const lines = scheduleLines(
      buildSchedule({
        addOns: [HOSTING],
        monthlyCents: 20000,
        discountType: 'percent',
        discountValue: 25,
        freeMonths: 2,
        discountMonths: 12,
      })
    );

    expect(lines).toHaveLength(3);
    expect(lines[0].period).toBe('Months 1–2');
    expect(lines[0].detail).toMatch(/no charge/i);
    expect(lines[1].period).toBe('Months 3–14');
    expect(lines[1].detail).toContain('$150');
    expect(lines[2].period).toBe('Month 15 onward');
    // The phase people forget to mention. If this line ever goes missing,
    // nobody agreed to the price they end up paying.
    expect(lines[2].detail).toContain('$200');
  });

  it('says nothing about free months when there are none', () => {
    const lines = scheduleLines(
      buildSchedule({
        addOns: [HOSTING],
        monthlyCents: 20000,
        discountType: 'percent',
        discountValue: 0,
        freeMonths: 0,
        discountMonths: 12,
      })
    );

    expect(lines).toHaveLength(2);
    expect(lines[0].period).toBe('Months 1–12');
  });

  it('still shows the standard rate when there is no discount at all', () => {
    const lines = scheduleLines(
      buildSchedule({
        addOns: [HOSTING],
        monthlyCents: 20000,
        discountType: 'percent',
        discountValue: 0,
        freeMonths: 0,
        discountMonths: 12,
      })
    );

    expect(lines[lines.length - 1].detail).toContain('$200');
  });
});

describe('turning calendar months into Stripe trial days', () => {
  it('counts the actual days in the months being given away', () => {
    // June and July: 30 + 31.
    expect(monthsAsDays(new Date(Date.UTC(2026, 5, 1)), 2)).toBe(61);
    // February and March in a non-leap year: 28 + 31.
    expect(monthsAsDays(new Date(Date.UTC(2026, 1, 1)), 2)).toBe(59);
  });

  it('clamps to the end of the month rather than overshooting it', () => {
    // The 31st of January plus one month is the 28th, not the 3rd of March —
    // otherwise "one month free" quietly becomes a month and three days.
    expect(monthsAsDays(new Date(Date.UTC(2026, 0, 31)), 1)).toBe(28);
  });

  it('is zero when nothing is being given away', () => {
    expect(monthsAsDays(new Date(), 0)).toBe(0);
  });
});

describe('how many months come free by default', () => {
  it('gives the covered months when every service was already in scope', () => {
    expect(defaultFreeMonths([HOSTING], [HOSTING, MAINTENANCE])).toBe(COVERED_MONTHS);
  });

  it('gives none for a service they never bought', () => {
    expect(defaultFreeMonths([HOSTING], [])).toBe(0);
  });

  it('gives none for a mixed offer, rather than free months on something new', () => {
    expect(defaultFreeMonths([HOSTING, MAINTENANCE], [HOSTING])).toBe(0);
  });

  it('gives none when nothing was selected', () => {
    expect(defaultFreeMonths([], [HOSTING])).toBe(0);
  });
});
