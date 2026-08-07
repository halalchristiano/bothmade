/**
 * Revenue over a window, summed in memory.
 *
 * Every revenue figure on the ops dashboard — the six chart bars, the period
 * total, the prior-period total behind the trend arrow — is a sum of the same
 * column over a different window of one span. They used to be eight separate
 * findMany calls returning whole Payment rows so that a reduce could add up
 * one integer from each, six of them sequential inside the chart's map.
 *
 * One query fetches the span; these bucket it.
 */

export interface DatedAmount {
  amount: number;
  createdAt: Date;
}

/**
 * Payments in `[from, to)` — inclusive of the start, exclusive of the end,
 * matching the `gte`/`lt` pair these windows were queried with. Omit `to` for
 * an open-ended window running to the present.
 *
 * A refund is a Payment with a negative amount — the same ledger running the
 * other way — so plain addition nets it out, which is the intent.
 */
export function sumPaymentsBetween(payments: DatedAmount[], from: Date, to?: Date): number {
  return payments.reduce(
    (sum, p) => (p.createdAt >= from && (!to || p.createdAt < to) ? sum + p.amount : sum),
    0
  );
}
