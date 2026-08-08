import { formatCentsExact } from '@/lib/pricing';

/**
 * What can happen to an invoice after it has been raised.
 *
 * Until now: nothing. An invoice was written, sent, and then permanent —
 * there was no way to cancel one raised in error, and no way to give money
 * back. The Invoice model has carried a `voidedAt` column and the billing
 * page has rendered a "Void" badge for as long as both have existed, and
 * nothing in the system could ever set either. Half a feature is a worse
 * place to be than none, because the interface promises the other half.
 *
 * Three distinct things, deliberately not merged into one "cancel" button:
 *
 *   Void    — an open invoice that should never have existed. Nothing was
 *             paid, so nothing moves. The Stripe link must die with it, or a
 *             client can still pay an invoice we have written off.
 *   Refund  — money paid, money going back. Section 8(l) of the contract says
 *             to the original payment method, so a card refund runs through
 *             Stripe for real.
 *   Credit  — money paid, staying paid, but the client is owed the value.
 *             Recorded against the invoice so the books show why the next one
 *             is smaller.
 *
 * A paid invoice is never voided. Voiding one would erase a payment that
 * genuinely happened, which is the one thing an accounting record must never
 * do.
 */

/** How the money actually moved (or didn't). */
export type RefundMethod = 'stripe' | 'manual' | 'credit';

export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  stripe: 'Refunded to the original card',
  manual: 'Refunded outside Stripe',
  credit: 'Credited against future work',
};

export function isRefundMethod(value: unknown): value is RefundMethod {
  return value === 'stripe' || value === 'manual' || value === 'credit';
}

export const MAX_REASON_LENGTH = 300;

/**
 * Why an invoice was voided or refunded, in the words that go on the client's
 * email and stay in the books.
 *
 * Required, not optional. An invoice that changed for no recorded reason is
 * the single hardest thing to explain a year later, to a client or to an
 * accountant — and the person who can explain it is always the person who is
 * not in the room.
 */
export function readReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, MAX_REASON_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

export type VoidCheck = { ok: true } | { ok: false; error: string };

/** Only an open invoice can be voided. See the note above on why. */
export function canVoid(invoice: { status: string }, receivedCents = 0): VoidCheck {
  if (invoice.status === 'void') {
    return { ok: false, error: 'That invoice is already void.' };
  }
  if (invoice.status === 'paid') {
    return {
      ok: false,
      error:
        'That invoice has been paid, so voiding it would erase a payment that really happened. Refund or credit it instead.',
    };
  }
  if (invoice.status !== 'open') {
    return { ok: false, error: 'Only an open invoice can be voided.' };
  }
  /*
   * Open, but not empty.
   *
   * This check used to read `status` alone, which was exactly right while an
   * invoice was all-or-nothing: open meant nothing had arrived. It stopped
   * being true the day one could be part paid by transfer — a client who
   * sends $900 against $1,200 leaves an invoice that is still `open` and has
   * real money sitting against it.
   *
   * So the guard above, whose whole reason for existing is that voiding must
   * never erase a payment that really happened, would have let you erase one.
   * Void means "this should never have existed": the pay link dies, the
   * client is told to ignore it, and both dashboards mark it cancelled —
   * while $900 of theirs stays in the account attached to a cancelled row.
   */
  if (receivedCents > 0) {
    return {
      ok: false,
      error: `${formatCentsExact(receivedCents)} has already come in against that invoice, so cancelling it would write off money the client really sent. Refund that ${formatCentsExact(receivedCents)} or raise a credit for it — cancelling is only for an invoice nobody has paid anything towards.`,
    };
  }
  return { ok: true };
}

export interface RefundRequest {
  amountCents: number;
  method: RefundMethod;
  reason: string;
}

export type RefundDraft = { ok: true; draft: RefundRequest } | { ok: false; error: string };

/**
 * The most that may go back on an invoice.
 *
 * On a settled invoice this is what it has always been: face value less
 * whatever has already gone back. The interesting case is the one that did
 * not exist until an invoice could be part paid by transfer — `open`, with
 * real money of the client's sitting against it.
 *
 * That money had nowhere to go. Refunding refused it for not being paid;
 * cancelling refused it, correctly, for having a payment on it. The advice
 * on the cancel refusal — "record the rest and refund it, or raise a credit"
 * — described a route that did not exist, and $900 of somebody else's money
 * sat on a row with no way out of it but a database console.
 *
 * `grossReceived` is money in before anything went back out, because
 * `refundedCents` is subtracted here and taking the same refund off twice
 * would refuse the second half of one.
 */
export function refundCeilingCents(
  invoice: { status: string; amountCents: number; refundedCents: number },
  grossReceived = 0
): number {
  if (invoice.status === 'void') return 0;
  // Never more than the invoice: an overpayment is a different conversation,
  // and refunding one through here would misreport what the invoice was for.
  const held = invoice.status === 'paid' ? invoice.amountCents : Math.min(invoice.amountCents, grossReceived);
  return Math.max(0, held - invoice.refundedCents);
}

/**
 * Reads a refund request, or says why it isn't one.
 *
 * The ceiling is what is left on the invoice, not the invoice total: two
 * partial refunds that each pass on their own can add up to more than the
 * client ever paid, and the second one is only wrong in the presence of the
 * first. So the already-refunded amount is an input here rather than a check
 * somewhere downstream — and on a part-paid invoice, so is what came in.
 */
export function readRefundRequest(
  invoice: { status: string; amountCents: number; refundedCents: number },
  input: { amountCents?: unknown; method?: unknown; reason?: unknown },
  grossReceived = 0
): RefundDraft {
  if (invoice.status === 'void') {
    return { ok: false, error: 'That invoice is void — there is nothing to refund.' };
  }
  const ceiling = refundCeilingCents(invoice, grossReceived);
  if (invoice.status !== 'paid' && ceiling <= 0) {
    return {
      ok: false,
      error: "Nothing has come in against that invoice, so there's nothing to give back. Cancel it instead.",
    };
  }

  if (!isRefundMethod(input.method)) {
    return { ok: false, error: 'Say how the money is going back: card, manual, or a credit.' };
  }

  const reason = readReason(input.reason);
  if (!reason) {
    return { ok: false, error: 'Say why. It goes on the client\'s email and stays in the books.' };
  }

  const amountCents = typeof input.amountCents === 'number' ? Math.round(input.amountCents) : NaN;
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, error: 'Enter an amount above zero.' };
  }

  const remaining = ceiling;
  if (remaining <= 0) {
    return { ok: false, error: 'That invoice has already been refunded in full.' };
  }
  if (amountCents > remaining) {
    return {
      ok: false,
      error:
        invoice.refundedCents > 0
          ? `Only ${formatCentsExact(remaining)} is left on that invoice — ${formatCentsExact(invoice.refundedCents)} has already gone back.`
          : invoice.status !== 'paid'
            ? `Only ${formatCentsExact(remaining)} of that invoice has been paid, so that's the most that can go back.`
            : `That's more than the invoice. The most you can refund is ${formatCentsExact(remaining)}.`,
    };
  }

  return { ok: true, draft: { amountCents, method: input.method, reason } };
}

/**
 * The settlement, in the exact shape Section 8(l) of the contract requires:
 *
 *   "Every settlement under this Section is stated as two lines — amount due
 *    from the Client, and amount returned to the Client — at least one of
 *    which is always zero."
 *
 * Written as one function so the email, the PDF and the screen cannot each
 * arrive at their own version of it. Deductions (processor fees under 8(d),
 * non-recoverable third-party costs under 8(f)) reduce what goes back and are
 * itemised separately, because 8(f) requires them itemised in writing.
 */
export interface SettlementLine {
  label: string;
  amountCents: number;
}

export interface Settlement {
  dueFromClientCents: number;
  returnedToClientCents: number;
  deductions: SettlementLine[];
  lines: SettlementLine[];
}

export function settlement(input: {
  refundCents: number;
  deductions?: SettlementLine[];
}): Settlement {
  const deductions = (input.deductions ?? []).filter((d) => d.amountCents > 0);
  const withheld = deductions.reduce((sum, d) => sum + d.amountCents, 0);
  const net = input.refundCents - withheld;

  // The two lines are mutually exclusive by construction: a negative net means
  // the deductions outran the refund, which is money owed to us rather than a
  // refund of a negative amount.
  const returnedToClientCents = Math.max(0, net);
  const dueFromClientCents = Math.max(0, -net);

  return {
    dueFromClientCents,
    returnedToClientCents,
    deductions,
    lines: [
      { label: 'Amount due from the Client', amountCents: dueFromClientCents },
      { label: 'Amount returned to the Client', amountCents: returnedToClientCents },
    ],
  };
}

/**
 * What an invoice's state actually is, once refunds are taken into account.
 *
 * `status` stays open | paid | void on purpose — every existing reader in the
 * system understands those three and none of them should have to learn a
 * fourth. Refund state is derived from the amounts, so a partly refunded
 * invoice is still a paid invoice, which is exactly what it is.
 */
export type InvoiceDisplayState =
  | 'open'
  | 'part-paid'
  | 'paid'
  | 'void'
  | 'refunded'
  | 'part-refunded'
  | 'credited';

/**
 * Known limitation, written down rather than discovered: only the most recent
 * refund's method is stored, so an invoice part-refunded to a card and then
 * part-credited reads as "Credited" in full. Both amounts are correct and the
 * money is right either way — only the one-word label is approximate, and the
 * fix is a refund-events table that this does not yet earn.
 */

export function displayState(invoice: {
  status: string;
  amountCents: number;
  refundedCents: number;
  refundMethod?: string | null;
  /** Summed from the payment rows against it. Absent means none have been read. */
  receivedCents?: number;
}): InvoiceDisplayState {
  if (invoice.status === 'void') return 'void';
  /*
   * Refunds first, and no longer only on settled invoices.
   *
   * Part payment made an `open` invoice something money can go back off, so
   * "open with a refund on it" went from impossible to reachable. Reading
   * `status` before `refundedCents` would have drawn that row as plain Open —
   * the badge for an invoice nothing has ever happened to — on the one row
   * where money has moved in both directions.
   */
  if (invoice.refundedCents > 0) {
    if (invoice.refundMethod === 'credit') return 'credited';
    return invoice.refundedCents >= invoice.amountCents ? 'refunded' : 'part-refunded';
  }
  {
    if (invoice.status === 'paid') return 'paid';
    /*
     * Open, with some of it already in.
     *
     * "Open" was the whole truth while an invoice was all-or-nothing. It is
     * now the badge on a row that might have nine hundred of a client's
     * twelve hundred sitting against it, which is a different thing to chase
     * and a different thing to say on the phone. The figures were already on
     * the row; the badge was still calling it untouched.
     */
    return (invoice.receivedCents ?? 0) > 0 ? 'part-paid' : 'open';
  }
}

export const DISPLAY_STATE_LABELS: Record<InvoiceDisplayState, string> = {
  open: 'Open',
  'part-paid': 'Part paid',
  paid: 'Paid',
  void: 'Void',
  refunded: 'Refunded',
  'part-refunded': 'Part refunded',
  credited: 'Credited',
};
