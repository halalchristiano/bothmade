import { describe, expect, it } from 'vitest';
import {
  analyticsRangeStart,
  billingThisMonthCents,
  conversionRate,
  dealValueCents,
  dealValueIsFirm,
  isAnalyticsRange,
  lostReasonBreakdown,
  monthBuckets,
  monthKey,
  monthsElapsed,
  runRateCents,
} from '@/lib/reporting';

/**
 * Every one of these pins a number that used to be reported wrongly on the
 * Analytics page. They are written as the situation, not as the formula —
 * the formula was never the hard part.
 */

describe('conversion rate', () => {
  it('measures wins against decided deals, not against every lead ever entered', () => {
    // 3 won, 1 lost, and 96 leads sitting in the pipeline. The old reading
    // called this 3% and fell further every time a list was imported.
    expect(conversionRate(3, 1)).toBeCloseTo(0.75);
  });

  it('is zero rather than NaN before anything has closed', () => {
    expect(conversionRate(0, 0)).toBe(0);
  });

  it('is a clean 1 when nothing has been lost', () => {
    expect(conversionRate(4, 0)).toBe(1);
  });
});

describe('what a deal is worth', () => {
  it('prefers what the client is actually billed', () => {
    const sold = new Map([['lead-1', 1_270_000]]);
    const lead = { id: 'lead-1', proposalTotalPrice: 900_000, estimatedValue: 300_000 };

    expect(dealValueCents(lead, sold)).toBe(1_270_000);
    expect(dealValueIsFirm(lead, sold)).toBe(true);
  });

  it('falls back to the quote before the guess', () => {
    const lead = { id: 'lead-2', proposalTotalPrice: 900_000, estimatedValue: 300_000 };

    expect(dealValueCents(lead, new Map())).toBe(900_000);
    expect(dealValueIsFirm(lead, new Map())).toBe(true);
  });

  it('uses the guess only when there is nothing better, and says so', () => {
    const lead = { id: 'lead-3', proposalTotalPrice: null, estimatedValue: 300_000 };

    expect(dealValueCents(lead, new Map())).toBe(300_000);
    expect(dealValueIsFirm(lead, new Map())).toBe(false);
  });

  it('is zero for a lead nobody has priced', () => {
    expect(dealValueCents({ id: 'lead-4' }, new Map())).toBe(0);
  });
});

describe('care plan revenue', () => {
  const plan = {
    acceptedAt: new Date('2026-01-15T00:00:00Z'),
    monthlyCents: 50_000,
    discountType: 'percent',
    discountValue: 20,
    freeMonths: 2,
    discountMonths: 12,
  };

  it('bills nothing during the free months', () => {
    expect(billingThisMonthCents(plan, new Date('2026-01-20T00:00:00Z'))).toBe(0);
    expect(billingThisMonthCents(plan, new Date('2026-02-20T00:00:00Z'))).toBe(0);
  });

  it('bills the introductory rate once the free months are up', () => {
    // Month 3 — first charge, 20% off.
    expect(billingThisMonthCents(plan, new Date('2026-03-20T00:00:00Z'))).toBe(40_000);
  });

  it('bills the standard rate once the introductory year runs out', () => {
    // 2 free + 12 discounted = month 15 onward.
    expect(billingThisMonthCents(plan, new Date('2027-03-20T00:00:00Z'))).toBe(50_000);
  });

  it('respects the billing anniversary rather than the calendar month', () => {
    // Accepted on the 15th, so on the 14th of the next month the plan is
    // still inside its first month — reporting it a month ahead would price
    // it at the wrong tier.
    expect(monthsElapsed(new Date('2026-01-15'), new Date('2026-02-14'))).toBe(0);
    expect(monthsElapsed(new Date('2026-01-15'), new Date('2026-02-15'))).toBe(1);
  });

  it('counts a plan with no acceptance date as billing nothing', () => {
    expect(billingThisMonthCents({ ...plan, acceptedAt: null }, new Date('2027-01-01'))).toBe(0);
  });

  it('reports the run rate at the standard rate, discounts aside', () => {
    expect(runRateCents([plan, { ...plan, monthlyCents: 30_000 }])).toBe(80_000);
  });
});

describe('the range', () => {
  const now = new Date('2026-08-05T12:00:00Z');

  it('has no start date for all time', () => {
    expect(analyticsRangeStart('all', now)).toBeNull();
  });

  it('counts back the right number of days', () => {
    const start = analyticsRangeStart('30d', now);

    expect(Math.round((now.getTime() - start!.getTime()) / 86_400_000)).toBe(30);
  });

  it('rejects anything that isn\'t a range', () => {
    expect(isAnalyticsRange('30d')).toBe(true);
    expect(isAnalyticsRange('forever')).toBe(false);
    expect(isAnalyticsRange(null)).toBe(false);
  });
});

describe('month buckets', () => {
  const now = new Date(2026, 7, 5); // August 2026, local

  it('ends on the current month', () => {
    const buckets = monthBuckets(analyticsRangeStart('12mo', now), now);

    expect(buckets[buckets.length - 1].key).toBe('2026-08');
  });

  it('shows one bucket per month for a short range', () => {
    const buckets = monthBuckets(new Date(2026, 5, 5), now);

    expect(buckets.map((b) => b.key)).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('spans both months when a 30-day range straddles a month boundary', () => {
    // 6 July to 5 August is under one whole month old but touches two of
    // them. One bar would leave July's money with nowhere to be drawn.
    const buckets = monthBuckets(new Date(2026, 6, 6), now);

    expect(buckets.map((b) => b.key)).toEqual(['2026-07', '2026-08']);
  });

  it('never runs past a year, however far back the range goes', () => {
    expect(monthBuckets(null, now)).toHaveLength(12);
    expect(monthBuckets(new Date(2019, 0, 1), now)).toHaveLength(12);
  });

  it('keys a timestamp to the bucket it belongs in', () => {
    expect(monthKey(new Date(2026, 0, 31))).toBe('2026-01');
    expect(monthKey(new Date(2026, 10, 1))).toBe('2026-11');
  });
});

describe('lost reasons', () => {
  it('ranks them commonest first', () => {
    const breakdown = lostReasonBreakdown([
      { lostReason: 'Too expensive' },
      { lostReason: 'Went with an agency' },
      { lostReason: 'Too expensive' },
    ]);

    expect(breakdown[0]).toEqual({ reason: 'Too expensive', count: 2 });
  });

  it('gathers blanks into one row instead of dropping them', () => {
    // "We lose deals and never write down why" is itself the finding, and
    // silently discarding those rows hides it.
    const breakdown = lostReasonBreakdown([{ lostReason: null }, { lostReason: '  ' }, {}]);

    expect(breakdown).toEqual([{ reason: 'No reason recorded', count: 3 }]);
  });

  it('is empty when nothing has been lost', () => {
    expect(lostReasonBreakdown([])).toEqual([]);
  });
});
