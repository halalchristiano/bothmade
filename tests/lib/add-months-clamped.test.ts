import { describe, expect, it } from 'vitest';
import { addMonthsClamped, invoiceDate } from '@/lib/money-dates';

/**
 * "One month later" on the 31st.
 *
 * `d.setMonth(d.getMonth() + 1)` does not mean next month. It means the 31st
 * of next month, and when that day does not exist the runtime rolls forward
 * into the month after — 31 January plus one becomes 3 March, February
 * skipped entirely. It is correct for 28 dates out of every 31, which is
 * exactly why nobody catches it reading the line.
 *
 * This was naming the first-charge date in the care-plan welcome email for
 * every plan that opens with free months. Stripe does not work that way: a
 * subscription anchored to the 31st bills on the last day of a short month.
 * So a client who accepted on the 31st was told a date Stripe was never going
 * to use, and in the worst case was told the wrong month.
 */

const at = (iso: string) => new Date(iso);
const day = (d: Date) => d.toISOString().slice(0, 10);

describe('adding a month to a date that has no equivalent next month', () => {
  it('clamps 31 January to the end of February, rather than landing in March', () => {
    // The one that matters most: the old arithmetic gave 2027-03-03.
    expect(day(addMonthsClamped(at('2027-01-31T12:00:00Z'), 1))).toBe('2027-02-28');
  });

  it('knows February has 29 days in a leap year', () => {
    expect(day(addMonthsClamped(at('2028-01-31T12:00:00Z'), 1))).toBe('2028-02-29');
  });

  it('clamps 31 August to 30 September, rather than 1 October', () => {
    expect(day(addMonthsClamped(at('2026-08-31T12:00:00Z'), 1))).toBe('2026-09-30');
  });

  it('clamps across a year boundary and several months at once', () => {
    // Old arithmetic: 2027-03-03.
    expect(day(addMonthsClamped(at('2026-12-31T12:00:00Z'), 2))).toBe('2027-02-28');
  });
});

describe('adding a month to an ordinary date', () => {
  it('keeps the day of the month', () => {
    expect(day(addMonthsClamped(at('2026-08-04T12:00:00Z'), 1))).toBe('2026-09-04');
    expect(day(addMonthsClamped(at('2026-05-30T12:00:00Z'), 3))).toBe('2026-08-30');
  });

  it('rolls the year over', () => {
    expect(day(addMonthsClamped(at('2026-11-15T12:00:00Z'), 3))).toBe('2027-02-15');
  });

  it('is a no-op for zero months, which is what a plan with no free months asks for', () => {
    expect(day(addMonthsClamped(at('2026-08-31T12:00:00Z'), 0))).toBe('2026-08-31');
  });

  it('keeps the time of day, so the label reads off the same instant', () => {
    const out = addMonthsClamped(at('2026-01-31T23:45:12.000Z'), 1);
    expect(out.toISOString()).toBe('2026-02-28T23:45:12.000Z');
  });

  it('does not mutate what it was given', () => {
    const original = at('2026-01-31T12:00:00Z');
    addMonthsClamped(original, 1);
    expect(original.toISOString()).toBe('2026-01-31T12:00:00.000Z');
  });
});

describe('the sentence a client actually reads', () => {
  it('names February, not March, for a plan started on 31 January', () => {
    const firstCharge = addMonthsClamped(at('2027-01-31T12:00:00Z'), 1);

    expect(invoiceDate(firstCharge)).toBe('February 28, 2027');
  });
});
