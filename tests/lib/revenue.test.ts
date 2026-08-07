import { describe, expect, it } from 'vitest';
import { sumPaymentsBetween } from '@/lib/revenue';

/**
 * The six chart bars, the period total and the prior-period total behind the
 * trend arrow are all sums of one column over different windows of one span.
 * They were eight separate queries returning whole Payment rows so a reduce
 * could add up one integer from each — six of them sequential inside the
 * chart's map. One query fetches the span now and this buckets it.
 *
 * Which makes the window boundaries load-bearing: they decide which month a
 * payment lands in, and getting them wrong would move money between bars
 * rather than fail visibly.
 */

const at = (iso: string, amount: number) => ({ amount, createdAt: new Date(iso) });

const JULY = new Date('2026-07-01T00:00:00.000Z');
const AUGUST = new Date('2026-08-01T00:00:00.000Z');

const PAYMENTS = [
  at('2026-06-30T23:59:59.999Z', 100), // the instant before July
  at('2026-07-01T00:00:00.000Z', 200), // exactly July's start
  at('2026-07-15T12:00:00.000Z', 400),
  at('2026-08-01T00:00:00.000Z', 800), // exactly August's start
];

describe('summing a window', () => {
  it('includes the start instant and excludes the end', () => {
    // 200 + 400. The payment at exactly August's start belongs to August, and
    // the one a millisecond before July belongs to June — otherwise a payment
    // taken at midnight is counted in two bars or none.
    expect(sumPaymentsBetween(PAYMENTS, JULY, AUGUST)).toBe(600);
  });

  it('runs to the present when given no end', () => {
    expect(sumPaymentsBetween(PAYMENTS, JULY)).toBe(1400);
  });

  it('puts every payment in exactly one bucket', () => {
    const june = sumPaymentsBetween(PAYMENTS, new Date('2026-06-01T00:00:00.000Z'), JULY);
    const july = sumPaymentsBetween(PAYMENTS, JULY, AUGUST);
    const august = sumPaymentsBetween(PAYMENTS, AUGUST);
    expect(june + july + august).toBe(1500);
  });

  it('nets a refund out rather than adding its magnitude', () => {
    // A refund is a Payment with a negative amount — the same ledger running
    // the other way.
    const withRefund = [...PAYMENTS, at('2026-07-20T00:00:00.000Z', -250)];
    expect(sumPaymentsBetween(withRefund, JULY, AUGUST)).toBe(350);
  });

  it('is zero over a window with nothing in it', () => {
    expect(sumPaymentsBetween(PAYMENTS, new Date('2026-09-01T00:00:00.000Z'))).toBe(0);
    expect(sumPaymentsBetween([], JULY, AUGUST)).toBe(0);
  });
});
