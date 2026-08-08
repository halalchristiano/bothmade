import { describe, expect, it } from 'vitest';
import {
  canMarkPaid,
  manualPaymentType,
  readManualPayment,
  receivedCents,
} from '@/lib/invoice-settlement';

/**
 * Marking an invoice paid recorded the invoice's FULL amount, always.
 *
 * A client transferring six hundred against a twelve-hundred invoice — because
 * that is what they had, or because they are paying in two goes — left the
 * books saying twelve hundred arrived: the invoice closed, the payment link
 * came down, a receipt went out saying paid, and the six hundred still owed
 * dropped off every list that would have chased it. The one error in this area
 * that loses money rather than time.
 */

const INVOICE = { amountCents: 120_000 };

describe('how much of an invoice has arrived', () => {
  it('adds up the payments against it', () => {
    expect(receivedCents([{ amount: 60_000 }, { amount: 20_000 }])).toBe(80_000);
    expect(receivedCents([])).toBe(0);
  });
});

describe('reading a manual payment', () => {
  it('takes the whole invoice when no amount is given', () => {
    const read = readManualPayment(INVOICE, 0, {});
    expect(read).toEqual({
      ok: true,
      draft: { amountCents: 120_000, settles: true, remainingAfterCents: 0 },
    });
  });

  it('records part of it, and says the invoice is not settled', () => {
    const read = readManualPayment(INVOICE, 0, { amountCents: 60_000 });
    expect(read).toEqual({
      ok: true,
      draft: { amountCents: 60_000, settles: false, remainingAfterCents: 60_000 },
    });
  });

  it('closes the invoice when the last of it comes in', () => {
    const read = readManualPayment(INVOICE, 60_000, { amountCents: 60_000 });
    expect(read.ok && read.draft).toMatchObject({ settles: true, remainingAfterCents: 0 });
  });

  /*
   * The ceiling is what is LEFT, not the invoice total. Two partial payments
   * that each pass on their own can add up to more than the client ever sent,
   * and the second is only wrong in the presence of the first.
   */
  it('measures against the remainder, not the total', () => {
    const read = readManualPayment(INVOICE, 60_000, { amountCents: 70_000 });
    expect(read.ok).toBe(false);
    expect(read.ok === false && read.error).toContain('$600 is left');
    expect(read.ok === false && read.error).toContain('$600 has already come in');
  });

  it('refuses more than the invoice', () => {
    const read = readManualPayment(INVOICE, 0, { amountCents: 130_000 });
    expect(read.ok).toBe(false);
    expect(read.ok === false && read.error).toContain('more than the invoice');
  });

  it('refuses nothing, and refuses nonsense', () => {
    expect(readManualPayment(INVOICE, 0, { amountCents: 0 }).ok).toBe(false);
    expect(readManualPayment(INVOICE, 0, { amountCents: -500 }).ok).toBe(false);
    expect(readManualPayment(INVOICE, 0, { amountCents: 'lots' }).ok).toBe(false);
  });

  it('has nothing left to take once it is all in', () => {
    const read = readManualPayment(INVOICE, 120_000, {});
    expect(read.ok).toBe(false);
    expect(read.ok === false && read.error).toContain('already been received');
  });

  /* Cents are the unit; a fractional one is a rounding artefact, not money. */
  it('rounds to whole cents', () => {
    const read = readManualPayment(INVOICE, 0, { amountCents: 60_000.4 });
    expect(read.ok && read.draft.amountCents).toBe(60_000);
  });
});

describe('what may be settled by hand', () => {
  it('only an open invoice', () => {
    expect(canMarkPaid({ status: 'open' }).ok).toBe(true);
    expect(canMarkPaid({ status: 'paid' }).ok).toBe(false);
    expect(canMarkPaid({ status: 'void' }).ok).toBe(false);
  });
});

describe('whether it pays down the project', () => {
  /*
   * An instalment bills part of Project.totalPrice; a one-off charge is priced
   * outside it. Counting the second toward the first marks a build paid off
   * because somebody was separately billed for a change request.
   */
  it('keeps a one-off charge out of the project balance', () => {
    expect(manualPaymentType(null)).toBe('custom');
    expect(manualPaymentType({ index: 1 })).toBe('deposit');
    expect(manualPaymentType({ index: 3 })).toBe('balance');
  });
});

describe('reading payments off a row', () => {
  /*
   * This reads a Prisma relation, and a caller that forgets to include it
   * should get "nothing has arrived" — the safe answer, and the true one for
   * an invoice with no payment rows — rather than a 500 on the ledger.
   */
  it('treats a missing list as nothing received', () => {
    expect(receivedCents(undefined)).toBe(0);
    expect(receivedCents(null)).toBe(0);
  });
});
