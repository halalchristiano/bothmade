import { formatCentsExact } from '@/lib/pricing';

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

/**
 * How much of an invoice has actually arrived.
 *
 * Derived from the payment rows against it rather than stored, because that
 * is what every other money figure in the app reads and a second number would
 * eventually disagree with the first. An invoice's own `status` says settled
 * or not; this says how much.
 */
export function receivedCents(payments: Array<{ amount: number }> | null | undefined): number {
  // Tolerant of an absent list rather than assuming one. This reads a Prisma
  // relation, and a caller that forgets to include it should get "nothing has
  // arrived" — which is both the safe answer and the true one for an invoice
  // with no payment rows — rather than a 500 on the ledger.
  if (!Array.isArray(payments)) return 0;
  return payments.reduce((sum, payment) => sum + (payment?.amount ?? 0), 0);
}

export interface ManualPayment {
  amountCents: number;
  /** True when this payment closes the invoice; false when money is still owed. */
  settles: boolean;
  remainingAfterCents: number;
}

export type ManualPaymentDraft =
  | { ok: true; draft: ManualPayment }
  | { ok: false; error: string };

/**
 * Reads how much of an invoice a payment covers, or says why it isn't one.
 *
 * ## Why this exists
 *
 * Marking an invoice paid recorded the invoice's FULL amount, always. A
 * client who transfers six hundred against a twelve-hundred invoice — because
 * that is what they had, or because they are paying in two goes — left the
 * books saying twelve hundred arrived. The invoice closed, the payment link
 * came down, the receipt went out saying "paid in full", and the six hundred
 * still owed vanished from every list that would have chased it. The one
 * error in this whole area that loses money rather than time.
 *
 * The ceiling is what is LEFT, not the invoice total: two partial payments
 * that each pass on their own can add up to more than the client ever sent,
 * and the second is only wrong in the presence of the first. Same argument as
 * the refund reader, and the same shape.
 */
export function readManualPayment(
  invoice: { amountCents: number },
  alreadyReceivedCents: number,
  input: { amountCents?: unknown }
): ManualPaymentDraft {
  const remaining = invoice.amountCents - alreadyReceivedCents;
  if (remaining <= 0) {
    return { ok: false, error: 'Everything on that invoice has already been received.' };
  }

  // Absent means "all of it", which is the ordinary case and what the button
  // did before there was a choice.
  if (input.amountCents === undefined || input.amountCents === null) {
    return { ok: true, draft: { amountCents: remaining, settles: true, remainingAfterCents: 0 } };
  }

  const amountCents =
    typeof input.amountCents === 'number' ? Math.round(input.amountCents) : NaN;
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, error: 'Enter an amount above zero.' };
  }
  if (amountCents > remaining) {
    return {
      ok: false,
      error:
        alreadyReceivedCents > 0
          ? `Only ${formatCentsExact(remaining)} is left on that invoice — ${formatCentsExact(alreadyReceivedCents)} has already come in.`
          : `That's more than the invoice. The most you can record is ${formatCentsExact(remaining)}.`,
    };
  }

  const remainingAfterCents = remaining - amountCents;
  return {
    ok: true,
    draft: { amountCents, settles: remainingAfterCents === 0, remainingAfterCents },
  };
}
