import { describe, expect, it } from 'vitest';
import {
  canVoid,
  displayState,
  isRefundMethod,
  readReason,
  readRefundRequest,
  settlement,
} from '@/lib/invoice-lifecycle';

/**
 * These all guard money that has already moved, so they are written as the
 * ways an invoice can be changed wrongly rather than the ways it can be
 * changed: a paid invoice erased, a refund larger than the payment, two
 * partial refunds that are each fine and together are not.
 */

const paid = { status: 'paid', amountCents: 250_000, refundedCents: 0 };

describe('voiding', () => {
  it('cancels an invoice that was never paid', () => {
    expect(canVoid({ status: 'open' })).toEqual({ ok: true });
  });

  /**
   * The one thing an accounting record must never do is erase a payment that
   * really happened. A client who paid and then sees the invoice vanish has
   * no evidence they paid it.
   */
  it('refuses to void a paid invoice, and says what to do instead', () => {
    const result = canVoid({ status: 'paid' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/refund or credit/i);
  });

  it('refuses to void the same invoice twice', () => {
    expect(canVoid({ status: 'void' }).ok).toBe(false);
  });
});

describe('reading a refund request', () => {
  it('takes an amount, a method and a reason', () => {
    const result = readRefundRequest(paid, {
      amountCents: 100_000,
      method: 'stripe',
      reason: 'Removed the SEO add-on before work started',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toEqual({
      amountCents: 100_000,
      method: 'stripe',
      reason: 'Removed the SEO add-on before work started',
    });
  });

  it('refuses to refund more than the invoice', () => {
    const result = readRefundRequest(paid, { amountCents: 300_000, method: 'stripe', reason: 'x' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/\$2,500/);
  });

  /**
   * The case neither refund catches on its own. $1,500 back, then $1,500
   * back, is $3,000 out against a $2,500 invoice — and the second request is
   * only wrong because the first one happened.
   */
  it('counts what has already gone back', () => {
    const result = readRefundRequest(
      { status: 'paid', amountCents: 250_000, refundedCents: 150_000 },
      { amountCents: 150_000, method: 'stripe', reason: 'x' }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/\$1,000 is left/);
      expect(result.error).toMatch(/\$1,500 has already gone back/);
    }
  });

  it('refuses once the invoice is fully refunded', () => {
    const result = readRefundRequest(
      { status: 'paid', amountCents: 250_000, refundedCents: 250_000 },
      { amountCents: 100, method: 'stripe', reason: 'x' }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already been refunded in full/i);
  });

  it('refuses to refund an invoice nobody paid', () => {
    const result = readRefundRequest(
      { status: 'open', amountCents: 250_000, refundedCents: 0 },
      { amountCents: 1000, method: 'stripe', reason: 'x' }
    );

    expect(result.ok).toBe(false);
    // "Cancel", because that is the word on the button that does it.
    if (!result.ok) expect(result.error).toMatch(/cancel it instead/i);
  });

  /**
   * An open invoice with the client's money on it.
   *
   * The dead end this closes: part payment made `open` a state an invoice can
   * hold real money in, and both exits were shut. Refunding refused it for
   * not being paid; cancelling refused it, rightly, for having a payment on
   * it — and the cancel refusal's own advice was "record the rest and refund
   * it, or raise a credit", which described a route that did not exist. Nine
   * hundred dollars of somebody else's money sat on a row with no way out of
   * it that did not involve a database console.
   */
  describe('refunding an invoice that is only part paid', () => {
    const partPaid = { status: 'open', amountCents: 250_000, refundedCents: 0 };

    it('gives back money that actually came in', () => {
      const result = readRefundRequest(
        partPaid,
        { amountCents: 90_000, method: 'manual', reason: 'Project cancelled' },
        90_000
      );

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.draft.amountCents).toBe(90_000);
    });

    /* The face value is what was ASKED for. Refunding it would send back
       $160,000 that never arrived. */
    it('will not give back more than arrived', () => {
      const result = readRefundRequest(
        partPaid,
        { amountCents: 250_000, method: 'manual', reason: 'Project cancelled' },
        90_000
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/\$900 of that invoice has been paid/i);
    });

    /*
     * The second half of a refund that went out in two parts.
     *
     * A money-moving refund writes a negative row into the same ledger the
     * payments live in, so "what is still sitting here" has already dropped by
     * the first $400. Capping against that figure AND subtracting
     * refundedCents takes the same $400 off twice, and the client's remaining
     * $500 becomes $100 they cannot have.
     */
    it('counts money in, not money still here, so a second partial refund is not blocked', () => {
      const result = readRefundRequest(
        { status: 'open', amountCents: 250_000, refundedCents: 40_000 },
        { amountCents: 50_000, method: 'manual', reason: 'The rest of it' },
        90_000
      );

      expect(result.ok).toBe(true);
    });

    it('still refuses a void invoice, whatever came in', () => {
      const result = readRefundRequest(
        { status: 'void', amountCents: 250_000, refundedCents: 0 },
        { amountCents: 1000, method: 'manual', reason: 'x' },
        90_000
      );

      expect(result.ok).toBe(false);
    });

    /* A settled invoice's ceiling is its face value, exactly as before —
       payment rows are not consulted and cannot lower it. */
    it('leaves a paid invoice reading off its own face value', () => {
      const result = readRefundRequest(
        { status: 'paid', amountCents: 250_000, refundedCents: 0 },
        { amountCents: 250_000, method: 'stripe', reason: 'x' },
        0
      );

      expect(result.ok).toBe(true);
    });
  });

  it('refuses a refund of nothing, or of a negative amount', () => {
    expect(readRefundRequest(paid, { amountCents: 0, method: 'stripe', reason: 'x' }).ok).toBe(false);
    expect(readRefundRequest(paid, { amountCents: -500, method: 'stripe', reason: 'x' }).ok).toBe(false);
  });

  it('demands a reason', () => {
    const result = readRefundRequest(paid, { amountCents: 1000, method: 'stripe', reason: '   ' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/say why/i);
  });

  it('demands a method it recognises', () => {
    expect(readRefundRequest(paid, { amountCents: 1000, method: 'bank', reason: 'x' }).ok).toBe(false);
    expect(isRefundMethod('credit')).toBe(true);
    expect(isRefundMethod('cheque')).toBe(false);
  });

  it('trims a reason to what fits on the record', () => {
    expect(readReason('  spaces  ')).toBe('spaces');
    expect(readReason('x'.repeat(500))).toHaveLength(300);
    expect(readReason('')).toBeNull();
    expect(readReason(42)).toBeNull();
  });
});

/**
 * Section 8(l): "Every settlement under this Section is stated as two lines —
 * amount due from the Client, and amount returned to the Client — at least
 * one of which is always zero."
 */
describe('the settlement statement', () => {
  it('always states two lines, one of them zero', () => {
    const result = settlement({ refundCents: 250_000 });

    expect(result.lines).toHaveLength(2);
    expect(result.lines.some((l) => l.amountCents === 0)).toBe(true);
    expect(result.returnedToClientCents).toBe(250_000);
    expect(result.dueFromClientCents).toBe(0);
  });

  it('takes deductions off what goes back, and itemises them', () => {
    // 8(d): processor fees and the administration charge. 8(f): third-party
    // costs, "itemized in writing".
    const result = settlement({
      refundCents: 250_000,
      deductions: [
        { label: 'Administration charge', amountCents: 25_000 },
        { label: 'Domain registration (non-recoverable)', amountCents: 1_800 },
      ],
    });

    expect(result.returnedToClientCents).toBe(223_200);
    expect(result.dueFromClientCents).toBe(0);
    expect(result.deductions).toHaveLength(2);
  });

  /**
   * Deductions can exceed the refund — a client who prepaid very little and
   * committed us to a year of hosting. That is money owed to us, and the
   * contract's two lines already have somewhere to put it.
   */
  it('flips to money owed when the deductions outrun the refund', () => {
    const result = settlement({
      refundCents: 20_000,
      deductions: [{ label: 'Administration charge', amountCents: 25_000 }],
    });

    expect(result.returnedToClientCents).toBe(0);
    expect(result.dueFromClientCents).toBe(5_000);
    expect(result.lines.some((l) => l.amountCents === 0)).toBe(true);
  });

  it('ignores a deduction of zero rather than printing an empty line', () => {
    const result = settlement({
      refundCents: 1000,
      deductions: [{ label: 'Processor fees', amountCents: 0 }],
    });

    expect(result.deductions).toEqual([]);
  });
});

describe('what the badge says', () => {
  it('calls a partly refunded invoice part refunded, and still paid underneath', () => {
    expect(displayState({ status: 'paid', amountCents: 250_000, refundedCents: 100_000 })).toBe('part-refunded');
  });

  it('calls a fully refunded invoice refunded', () => {
    expect(displayState({ status: 'paid', amountCents: 250_000, refundedCents: 250_000 })).toBe('refunded');
  });

  it('distinguishes a credit from money that actually went back', () => {
    expect(
      displayState({ status: 'paid', amountCents: 250_000, refundedCents: 250_000, refundMethod: 'credit' })
    ).toBe('credited');
  });

  it('leaves untouched invoices exactly as they were', () => {
    expect(displayState({ status: 'open', amountCents: 1000, refundedCents: 0 })).toBe('open');
    expect(displayState({ status: 'paid', amountCents: 1000, refundedCents: 0 })).toBe('paid');
    expect(displayState({ status: 'void', amountCents: 1000, refundedCents: 0 })).toBe('void');
  });
});

/**
 * Voiding must never erase a payment that really happened — that is the whole
 * reason the paid check exists. It read `status` alone, which was exactly
 * right while an invoice was all-or-nothing, and stopped being right the day
 * one could be part paid by transfer: a client who sends $900 against $1,200
 * leaves an invoice that is still `open` with real money against it.
 */
describe('cancelling an invoice money has arrived against', () => {
  it('refuses, and says how much came in', () => {
    const check = canVoid({ status: 'open' }, 90_000);

    expect(check.ok).toBe(false);
    expect(check.ok === false && check.error).toContain('$900');
    expect(check.ok === false && check.error).toContain('money the client really sent');
  });

  it('still allows one nobody has paid anything towards', () => {
    expect(canVoid({ status: 'open' }, 0).ok).toBe(true);
    expect(canVoid({ status: 'open' }).ok).toBe(true);
  });

  it('keeps refusing a settled or already-cancelled one', () => {
    expect(canVoid({ status: 'paid' }, 0).ok).toBe(false);
    expect(canVoid({ status: 'void' }, 0).ok).toBe(false);
  });
});

/**
 * Open, and money has moved in both directions.
 *
 * Impossible until an invoice could be part paid and then refunded off, so
 * nothing had ever had to draw it. Reading `status` before `refundedCents`
 * gave it the badge for an invoice nothing has ever happened to.
 */
describe('what the badge says once a part-paid invoice has been refunded', () => {
  const base = { status: 'open', amountCents: 250_000, receivedCents: 0 };

  it('says the money went back rather than calling the row untouched', () => {
    expect(displayState({ ...base, refundedCents: 90_000 })).toBe('part-refunded');
  });

  it('distinguishes a credit here too', () => {
    expect(displayState({ ...base, refundedCents: 90_000, refundMethod: 'credit' })).toBe('credited');
  });

  it('leaves a cancelled invoice cancelled', () => {
    expect(displayState({ ...base, status: 'void', refundedCents: 90_000 })).toBe('void');
  });

  it('changes nothing for an open invoice nothing has come off', () => {
    expect(displayState({ ...base, refundedCents: 0, receivedCents: 90_000 })).toBe('part-paid');
    expect(displayState({ ...base, refundedCents: 0 })).toBe('open');
  });
});

describe('what the badge says about an invoice with some of the money in', () => {
  const OPEN = { status: 'open', amountCents: 120_000, refundedCents: 0 };

  /*
   * "Open" was the whole truth while an invoice was all-or-nothing. It is now
   * the badge on a row that might have nine hundred of a client's twelve
   * hundred against it — a different thing to chase, and a different thing to
   * say on the phone.
   */
  it('reads part paid once anything has arrived', () => {
    expect(displayState({ ...OPEN, receivedCents: 60_000 })).toBe('part-paid');
  });

  it('still reads open when nothing has', () => {
    expect(displayState({ ...OPEN, receivedCents: 0 })).toBe('open');
    expect(displayState(OPEN)).toBe('open');
  });

  /* Settled and cancelled are unchanged — money in does not move either. */
  it('leaves the settled states alone', () => {
    expect(displayState({ ...OPEN, status: 'paid', receivedCents: 120_000 })).toBe('paid');
    expect(displayState({ ...OPEN, status: 'void', receivedCents: 60_000 })).toBe('void');
  });
});
