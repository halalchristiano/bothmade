/**
 * Business days, because the contract counts in them.
 *
 * "five (5) Business Days" appears in Section 4's Review Period, Section 6's
 * Client Dependencies, Section 11's absence notice and Section 12's cure
 * period. Every one of those is a deadline that decides money or delivery, so
 * counting them as calendar days would quietly move dates the agreement fixed
 * — a design presented on a Thursday would be deemed approved on the Tuesday
 * instead of the following Thursday, and Payment 2 would fall due two days
 * before the contract says it can.
 *
 * Weekends only. Public holidays are deliberately not modelled: the studio
 * and its clients are not necessarily in the same country, the contract does
 * not name a holiday calendar, and a wrong holiday list produces confidently
 * wrong dates — which is worse than the honest small error of counting a bank
 * holiday as a working day. If that ever matters, it needs a named
 * jurisdiction in the contract first.
 */

/** Saturday or Sunday. */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isBusinessDay(date: Date): boolean {
  return !isWeekend(date);
}

/**
 * `count` business days after `from`.
 *
 * The start date is never counted, whether or not it is itself a business
 * day: "five Business Days from Thursday" means the following Thursday, not
 * the Wednesday. Time of day is carried through untouched, so a deadline
 * inherits the hour the clock started.
 */
export function addBusinessDays(from: Date, count: number): Date {
  const result = new Date(from);
  if (count <= 0) return result;

  let remaining = count;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result)) remaining--;
  }
  return result;
}

/**
 * How many business days have fully elapsed between two dates.
 *
 * Used for "has the review period lapsed" rather than for setting the
 * deadline itself — the deadline is computed once with addBusinessDays and
 * stored, so a change to this function can never retroactively move a date
 * somebody has already been told.
 */
export function businessDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let count = 0;
  const cursor = new Date(from);
  while (cursor < to) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor <= to && isBusinessDay(cursor)) count++;
  }
  return count;
}

/** Section 4's Review Period. Named rather than typed as a literal at each use. */
export const REVIEW_PERIOD_BUSINESS_DAYS = 5;
