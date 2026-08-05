import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  businessDaysBetween,
  isBusinessDay,
  isWeekend,
  REVIEW_PERIOD_BUSINESS_DAYS,
} from '@/lib/business-days';

/**
 * These decide when Payment 2 falls due, so they are written as dates rather
 * than as arithmetic. Counting in calendar days instead would move a deadline
 * the contract fixed — and it would move it earlier, in our favour, which is
 * the direction a client would notice.
 */

// 2026-08-05 is a Wednesday.
const wed = () => new Date(2026, 7, 5, 14, 30);
const fri = () => new Date(2026, 7, 7, 9, 0);
const sat = () => new Date(2026, 7, 8, 9, 0);

describe('what counts as a working day', () => {
  it('knows a weekend when it sees one', () => {
    expect(isWeekend(new Date(2026, 7, 8))).toBe(true); // Saturday
    expect(isWeekend(new Date(2026, 7, 9))).toBe(true); // Sunday
    expect(isWeekend(wed())).toBe(false);
    expect(isBusinessDay(wed())).toBe(true);
  });
});

describe('counting forward', () => {
  /**
   * Section 4's Review Period. A design presented on Wednesday is deemed
   * approved the following Wednesday — not the Monday, which is where
   * calendar-day counting lands and which would make Payment 2 due two days
   * early.
   */
  it('skips the weekend', () => {
    const deadline = addBusinessDays(wed(), 5);

    expect(deadline.getDay()).toBe(3); // Wednesday
    expect(deadline.getDate()).toBe(12);
  });

  it('carries a Friday start over both weekend days', () => {
    const deadline = addBusinessDays(fri(), 5);

    expect(deadline.getDate()).toBe(14); // the following Friday
    expect(deadline.getDay()).toBe(5);
  });

  it('never counts the starting day itself', () => {
    // One business day after Wednesday is Thursday, not Wednesday.
    expect(addBusinessDays(wed(), 1).getDate()).toBe(6);
  });

  it('starts counting from the next working day when it begins on a weekend', () => {
    // Saturday + 1 business day is Monday.
    expect(addBusinessDays(sat(), 1).getDay()).toBe(1);
  });

  it('keeps the time of day, so a deadline inherits the hour the clock started', () => {
    const deadline = addBusinessDays(wed(), 5);

    expect(deadline.getHours()).toBe(14);
    expect(deadline.getMinutes()).toBe(30);
  });

  it('returns the same instant for zero or a negative count', () => {
    expect(addBusinessDays(wed(), 0).getTime()).toBe(wed().getTime());
    expect(addBusinessDays(wed(), -3).getTime()).toBe(wed().getTime());
  });
});

describe('counting between', () => {
  it('ignores the weekend in the middle', () => {
    // Wednesday to the following Wednesday is five working days.
    expect(businessDaysBetween(wed(), new Date(2026, 7, 12, 14, 30))).toBe(5);
  });

  it('is zero when the end is not after the start', () => {
    expect(businessDaysBetween(wed(), wed())).toBe(0);
    expect(businessDaysBetween(wed(), new Date(2026, 7, 1))).toBe(0);
  });

  it('counts a weekend as nothing at all', () => {
    expect(businessDaysBetween(fri(), new Date(2026, 7, 9, 9, 0))).toBe(0); // Fri → Sun
  });
});

describe('the review period', () => {
  it('is the five business days the contract says it is', () => {
    expect(REVIEW_PERIOD_BUSINESS_DAYS).toBe(5);
  });
});
