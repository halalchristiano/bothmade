/**
 * One definition per number.
 *
 * "Conversion Rate" appeared on two screens computed two different ways,
 * in two different units:
 *
 *   /admin/dashboard  won / (won + lost),  a fraction, rendered × 100
 *   /admin/analytics  won / all leads,     already a percentage, rendered as-is
 *
 * With 12 won, 8 lost and 200 leads in the table, one screen said 60% and
 * the other said 6%, both labelled the same thing. Neither was wrong as a
 * formula; the mistake was giving two different metrics one name. They are
 * both kept here, named for what they actually measure, in one unit
 * (a 0..1 fraction — the UI does the ×100).
 */

/**
 * Of the deals that reached a decision, how many did we win?
 *
 * The one to judge a rep on: open leads haven't had their chance yet, so
 * including them in the denominator just measures how long the pipeline is.
 */
export function winRate(won: number, lost: number): number {
  const decided = won + lost;
  return decided > 0 ? won / decided : 0;
}

/**
 * Of everything that ever entered the pipeline, how many became customers?
 *
 * The one to judge a *lead source* on — it counts the leads that went
 * nowhere and were never formally marked lost, which is most of them.
 */
export function leadConversionRate(won: number, totalLeads: number): number {
  return totalLeads > 0 ? won / totalLeads : 0;
}

/**
 * What a won deal is actually worth, in cents.
 *
 * Preference order, most to least trustworthy:
 *   1. money genuinely received (Payment rows on the converted project)
 *   2. the price the client agreed to (frozen proposalTotalPrice)
 *   3. the rep's early guess (estimatedValue)
 *
 * Forecasts and won-revenue were built on (3) alone — a number typed in
 * before discovery, often before anyone knew the scope. So revenue reported
 * by sales disagreed with revenue reported by ops on the same deals, and
 * the discrepancy grew with every negotiated discount.
 */
export function dealValue(lead: {
  proposalTotalPrice?: number | null;
  estimatedValue?: number | null;
  paidTotal?: number | null;
}): number {
  if (lead.paidTotal && lead.paidTotal > 0) return lead.paidTotal;
  if (lead.proposalTotalPrice && lead.proposalTotalPrice > 0) return lead.proposalTotalPrice;
  return lead.estimatedValue ?? 0;
}

/**
 * An open deal's contribution to the forecast.
 *
 * Uses the agreed price once there is one — a deal at "contract sent" has a
 * real number attached and should not still be forecast off a guess.
 */
export function forecastValue(
  lead: { proposalTotalPrice?: number | null; estimatedValue?: number | null },
  stageWeight: number
): number {
  return dealValue(lead) * stageWeight;
}

/**
 * When a deal closed. Prefers the explicit stamp; falls back to updatedAt
 * for rows that predate it (the migration backfilled those, so this is
 * belt-and-braces for anything written in between).
 */
export function wonDate(lead: { wonAt?: Date | null; updatedAt: Date }): Date {
  return lead.wonAt ?? lead.updatedAt;
}
