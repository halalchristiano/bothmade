/**
 * Dates on documents about money.
 *
 * Every one of these had the same shape — `d.toLocaleDateString('en-US', …)` —
 * and every one of them therefore rendered in whatever timezone the process
 * happened to be running in. On Vercel that is UTC and they are all correct
 * today, which is exactly why it went unnoticed: the bug is invisible until
 * something moves, and then it moves a date on a client's invoice.
 *
 * A billing date is not a local date. Stripe hands over period boundaries as
 * UTC instants; an instalment's due date is compared against `now` as a raw
 * instant by the chase schedule; an invoice's issue date is a fact about a
 * document rather than about where the reader is standing. Rendering any of
 * them in a runtime-dependent zone lets a date on paper disagree with the
 * arithmetic that produced it — the email says the 3rd, the system counts from
 * the 4th, and the client is the one holding the email.
 *
 * So: one zone, fixed, everywhere. UTC, because it is what the stored instants
 * already mean.
 *
 * These are deliberately NOT for dates a person reads about their own day —
 * a rep's follow-up list, "3 calls today", the call sheet. Those are local on
 * purpose and have their own handling in lib/day-window.
 */

const ZONE = 'UTC';

/** "4 August 2026" as "August 4, 2026" — the long form used on invoices. */
export function invoiceDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: ZONE,
  });
}

/**
 * "August 4" — the short form, for a line already carrying the year in
 * context. Used in the chase emails, where the year would be noise.
 */
export function invoiceDayMonth(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: ZONE,
  });
}

/** A billing period, both ends. "August 4, 2026 – September 4, 2026". */
export function billingPeriod(startSeconds: number, endSeconds: number): string {
  return `${invoiceDate(new Date(startSeconds * 1000))} – ${invoiceDate(new Date(endSeconds * 1000))}`;
}

/**
 * The same day-of-month, `months` later — clamped rather than overflowed.
 *
 * `d.setMonth(d.getMonth() + 1)` on the 31st does not give you "next month".
 * It gives you the 31st *of* next month, which does not exist, so the runtime
 * rolls it forward: 31 January plus one month is 3 March, skipping February
 * altogether. 31 August plus one is 1 October. It is right for 28 days out of
 * every 31 and wrong for the rest, which is how it survives review.
 *
 * That arithmetic was naming the first-charge date in the care-plan welcome
 * email — "your first payment is due on ..." — for every plan that starts
 * with free months. Stripe does not do this: a subscription anchored to the
 * 31st bills on the last day of a short month. So on roughly one start date
 * in ten the email promised a date Stripe was never going to use, and the one
 * case it got most wrong was a whole month out.
 *
 * Clamping to the last day of the target month is what Stripe does and what
 * anybody reading "one month later" means.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getUTCDate();
  // Day 1 can never overflow, so the month lands where it is asked to.
  const target = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}
