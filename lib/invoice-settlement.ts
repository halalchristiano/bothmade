/**
 * Settling an invoice with money that did not come through Stripe.
 *
 * The rules are here rather than in the route because both of them are the
 * kind that get quietly re-derived somewhere else and then disagree — one
 * about what may be settled by hand, one about whether the money counts
 * against a project's contracted price. The second is worth money.
 */

export type MarkPaidCheck = { ok: true } | { ok: false; error: string };

/**
 * Only an open invoice can be marked paid by hand.
 *
 * A void invoice is one that should never have existed and has been withdrawn
 * from the client — money against it means something has gone wrong that a
 * status flip would hide rather than fix. An already-paid one being marked
 * paid again is the double-entry this whole route is careful about.
 */
export function canMarkPaid(invoice: { status: string }): MarkPaidCheck {
  if (invoice.status === 'paid') {
    return { ok: false, error: 'That invoice is already settled.' };
  }
  if (invoice.status === 'void') {
    return {
      ok: false,
      error:
        'That invoice was cancelled, so recording a payment against it would settle something the client was told to ignore. Raise a new charge for the money that arrived.',
    };
  }
  if (invoice.status !== 'open') {
    return { ok: false, error: 'Only an open invoice can be marked paid.' };
  }
  return { ok: true };
}

/**
 * What kind of payment this is, which decides whether it pays down the
 * project.
 *
 * An instalment invoice bills part of `Project.totalPrice`, so settling one by
 * transfer has to count toward it exactly as a card payment would — the
 * client's "Payment 2 of 3" and the remaining balance both read payments of
 * these types. A one-off charge is priced outside that total, so counting it
 * would mark a project paid off because somebody was separately billed for a
 * change request. See PROJECT_SCOPE_PAYMENT_TYPES and
 * amountPaidTowardProject() in lib/billing.ts — every balance calculation
 * goes through them, and none of them re-derive this.
 *
 * The index split matches the webhook: instalment one is the deposit,
 * everything after it is balance.
 */
export function manualPaymentType(instalment: { index: number } | null): 'deposit' | 'balance' | 'custom' {
  if (!instalment) return 'custom';
  return instalment.index <= 1 ? 'deposit' : 'balance';
}
