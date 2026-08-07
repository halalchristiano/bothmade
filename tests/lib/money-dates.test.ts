import { describe, expect, it } from 'vitest';
import { billingPeriod, invoiceDate, invoiceDayMonth } from '@/lib/money-dates';

/**
 * Dates on documents about money, which must not depend on where the process
 * ran.
 *
 * Every one of these call sites was `d.toLocaleDateString('en-US', …)` and so
 * rendered in the runtime's zone. On Vercel that is UTC and they were all
 * correct, which is precisely why it survived: the bug is invisible until
 * something moves, and then it moves a date on a client's invoice.
 *
 * The instants chosen below are the ones that expose it — midnight UTC, which
 * is the previous day anywhere west of Greenwich, and late evening UTC, which
 * is the next day anywhere far enough east. The suite runs these under whatever
 * TZ the machine has; the assertions are absolute, so a machine in Denver or
 * Auckland fails them if the zone ever leaks back in.
 */

/** Midnight UTC on 4 August — "the 3rd" to most of the Americas. */
const MIDNIGHT_UTC = new Date('2026-08-04T00:00:00Z');
/** Late evening UTC on 4 August — "the 5th" across most of Asia and Oceania. */
const LATE_UTC = new Date('2026-08-04T23:30:00Z');

describe('an invoice date', () => {
  it('names the UTC day at midnight, not the day before', () => {
    expect(invoiceDate(MIDNIGHT_UTC)).toBe('August 4, 2026');
  });

  it('names the UTC day late at night, not the day after', () => {
    expect(invoiceDate(LATE_UTC)).toBe('August 4, 2026');
  });

  it('carries the year, because an invoice is kept', () => {
    expect(invoiceDate(MIDNIGHT_UTC)).toMatch(/2026/);
  });
});

describe('a due date in a chase email', () => {
  /**
   * The short form. chaseState computes daysPastDue from the raw instant, so
   * this label naming a different day than that arithmetic is the failure —
   * the email says one date and the system counts from another.
   */
  it('agrees with the instant the schedule reasons about', () => {
    expect(invoiceDayMonth(MIDNIGHT_UTC)).toBe('August 4');
    expect(invoiceDayMonth(LATE_UTC)).toBe('August 4');
  });

  it('leaves the year out, which would be noise on that line', () => {
    expect(invoiceDayMonth(MIDNIGHT_UTC)).not.toMatch(/2026/);
  });
});

describe('a billing period', () => {
  /**
   * Stripe sends these as UTC instants on day boundaries, so this is the one
   * that was actually wrong in production west of Greenwich: a period opening
   * midnight UTC on the 4th printed as the 3rd on the client's invoice.
   */
  it('reads both ends as the days Stripe meant', () => {
    const start = Math.floor(Date.UTC(2026, 7, 4) / 1000);
    const end = Math.floor(Date.UTC(2026, 8, 4) / 1000);

    expect(billingPeriod(start, end)).toBe('August 4, 2026 – September 4, 2026');
  });

  it('spans a year boundary without losing either year', () => {
    const start = Math.floor(Date.UTC(2026, 11, 15) / 1000);
    const end = Math.floor(Date.UTC(2027, 0, 15) / 1000);

    expect(billingPeriod(start, end)).toBe('December 15, 2026 – January 15, 2027');
  });
});
