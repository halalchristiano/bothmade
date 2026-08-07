import { describe, expect, it } from 'vitest';
import {
  MAX_CHARGE_CENTS,
  amountPaidTowardProject,
  describeChargeBlocker,
  dollarsToCents,
  formatInvoiceNumber,
  gateReached,
  invoiceFilename,
  invoiceNumberPrefix,
  projectBalance,
  readChargeDraft,
} from '@/lib/billing';

/**
 * Everything here decides how much a real person gets charged, so the tests
 * are about the ways a number can be wrong rather than the ways it can be
 * right: a typed amount that floats, a line the sanitizer silently dropped,
 * and a one-off charge quietly counting as money toward a build.
 */

describe('dollarsToCents', () => {
  it('converts the amounts floating-point maths gets wrong', () => {
    // 12.35 * 100 is 1234.9999999999998 in IEEE 754. This is the whole reason
    // the function exists.
    expect(dollarsToCents('12.35')).toBe(1235);
    expect(dollarsToCents('1.10')).toBe(110);
    expect(dollarsToCents('0.29')).toBe(29);
    expect(dollarsToCents('8.11')).toBe(811);
  });

  it('accepts what a person actually types', () => {
    expect(dollarsToCents('1,500')).toBe(150000);
    expect(dollarsToCents('$450.50')).toBe(45050);
    expect(dollarsToCents(' 20 ')).toBe(2000);
    expect(dollarsToCents('7.5')).toBe(750);
  });

  it('refuses anything that is not a plain amount', () => {
    // Null means "don't charge this" — never zero, which would be a silent
    // free invoice.
    expect(dollarsToCents('')).toBeNull();
    expect(dollarsToCents('.')).toBeNull();
    expect(dollarsToCents('abc')).toBeNull();
    expect(dollarsToCents('1.999')).toBeNull();
    expect(dollarsToCents('-50')).toBeNull();
    expect(dollarsToCents('1e5')).toBeNull();
  });
});

describe('readChargeDraft', () => {
  const LINES = [{ label: 'Extra design round', priceCents: 120000 }];

  it('totals the line items rather than trusting a submitted amount', () => {
    const result = readChargeDraft({
      description: 'Extra work',
      lineItems: [
        { label: 'Design round', priceCents: 120000 },
        { label: 'Copywriting', priceCents: 45000 },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.amountCents).toBe(165000);
  });

  it('demands a description — it is the invoice heading', () => {
    expect(readChargeDraft({ description: '   ', lineItems: LINES }).ok).toBe(false);
  });

  it('demands at least one line', () => {
    expect(readChargeDraft({ description: 'Extra work', lineItems: [] }).ok).toBe(false);
    expect(readChargeDraft({ description: 'Extra work' }).ok).toBe(false);
  });

  /**
   * The sanitizer drops malformed items rather than throwing, which is right
   * for a proposal (send the rest) and dangerous here — dropping a line
   * silently bills a different total than the one on the rep's screen.
   */
  it('refuses the whole charge when any line is unusable', () => {
    const result = readChargeDraft({
      description: 'Extra work',
      lineItems: [
        { label: 'Design round', priceCents: 120000 },
        { label: '', priceCents: 45000 },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/every line/i);
  });

  it('refuses a line priced at zero or below', () => {
    expect(readChargeDraft({ description: 'x', lineItems: [{ label: 'Freebie', priceCents: 0 }] }).ok).toBe(false);
    expect(readChargeDraft({ description: 'x', lineItems: [{ label: 'Refund', priceCents: -500 }] }).ok).toBe(false);
  });

  it('refuses a total below what a card will take', () => {
    const result = readChargeDraft({ description: 'x', lineItems: [{ label: 'Tiny', priceCents: 40 }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at least \$1/i);
  });

  it('catches the extra-zero typo before it reaches a client', () => {
    const result = readChargeDraft({
      description: 'x',
      lineItems: [{ label: 'Retainer', priceCents: MAX_CHARGE_CENTS + 1 }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/extra zero/i);
  });

  it('refuses more lines than an invoice can carry, rather than dropping the overflow', () => {
    const result = readChargeDraft({
      description: 'Extra work',
      lineItems: Array.from({ length: 21 }, (_, i) => ({ label: `Line ${i}`, priceCents: 1000 })),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at most 20 lines/i);
  });

  it('trims the description to what fits on the invoice', () => {
    const result = readChargeDraft({ description: 'x'.repeat(500), lineItems: LINES });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.description).toHaveLength(200);
  });
});

describe('amountPaidTowardProject', () => {
  it('counts deposits, balances and full payments', () => {
    expect(
      amountPaidTowardProject([
        { amount: 225000, type: 'deposit' },
        { amount: 225000, type: 'balance' },
        { amount: 100000, type: 'full' },
      ])
    ).toBe(550000);
  });

  /**
   * The failure this exists to prevent: a $2,000 change request making a
   * $20,000 build look part-paid, and the client never being chased for it.
   */
  it('ignores one-off charges, which are billed outside the project price', () => {
    expect(
      amountPaidTowardProject([
        { amount: 225000, type: 'deposit' },
        { amount: 200000, type: 'custom' },
      ])
    ).toBe(225000);
  });

  it('ignores a payment type it has never heard of rather than guessing', () => {
    expect(amountPaidTowardProject([{ amount: 500, type: 'refund' }])).toBe(0);
  });
});

describe('invoice numbering', () => {
  it('pads the sequence so numbers sort as text', () => {
    expect(formatInvoiceNumber(2026, 7)).toBe('BM-2026-0007');
    expect(formatInvoiceNumber(2026, 1234)).toBe('BM-2026-1234');
  });

  it('shares a prefix with every other invoice from the same year', () => {
    expect(formatInvoiceNumber(2026, 7).startsWith(invoiceNumberPrefix(2026))).toBe(true);
    expect(formatInvoiceNumber(2027, 1).startsWith(invoiceNumberPrefix(2026))).toBe(false);
  });

  it('makes a filename that cannot escape its directory', () => {
    expect(invoiceFilename('BM-2026-0007')).toBe('BM-2026-0007.pdf');
    expect(invoiceFilename('../../etc/passwd')).toBe('etcpasswd.pdf');
  });
});

describe('what a project actually owes', () => {
  const schedule = (statuses: string[]) =>
    statuses.map((status, i) => ({
      status,
      amountCents: [40_000, 30_000, 30_000][i],
      trigger: ['signing', 'design-approval', 'ready-for-launch'][i],
    }));

  it('does not count a one-off charge against the project price', () => {
    // The bug this replaces: a client billed $5,000 for a change request and
    // paying it looked like they had paid down the project itself, so the
    // project fell off the chase list still owing the money.
    const balance = projectBalance({
      totalPrice: 100_000,
      statusStage: 0,
      payments: [
        { amount: 40_000, type: 'deposit' },
        { amount: 5_000, type: 'custom' },
      ],
      instalments: schedule(['paid', 'scheduled', 'scheduled']),
    });

    expect(balance.remainingCents).toBe(60_000);
  });

  it('does not chase money the schedule is deliberately holding back', () => {
    // Signed and paid the 40% this morning. Nothing is owed. Before this,
    // every live project showed "$60,000 outstanding" from day one.
    const balance = projectBalance({
      totalPrice: 100_000,
      statusStage: 0,
      payments: [{ amount: 40_000, type: 'deposit' }],
      instalments: schedule(['paid', 'scheduled', 'scheduled']),
    });

    expect(balance.dueNowCents).toBe(0);
    expect(balance.gatedCents).toBe(60_000);
    expect(balance.unbilledCents).toBe(0);
  });

  it('chases only what has been invoiced', () => {
    const balance = projectBalance({
      totalPrice: 100_000,
      statusStage: 2,
      payments: [{ amount: 40_000, type: 'deposit' }],
      instalments: schedule(['paid', 'due', 'scheduled']),
    });

    expect(balance.dueNowCents).toBe(30_000);
    expect(balance.gatedCents).toBe(30_000);
  });

  it('separates money nobody has asked for from money nobody has paid', () => {
    // Design was approved — payment 2 could have gone out and didn't. That is
    // our failure, not the client's, and it belongs on a different list.
    const balance = projectBalance({
      totalPrice: 100_000,
      statusStage: 2,
      payments: [{ amount: 40_000, type: 'deposit' }],
      instalments: schedule(['paid', 'scheduled', 'scheduled']),
    });

    expect(balance.unbilledCents).toBe(30_000);
    expect(balance.dueNowCents).toBe(0);
    expect(balance.gatedCents).toBe(30_000);
  });

  it('treats a project with no schedule as owing whatever is left', () => {
    // Pre-instalment projects are still on the lump-balance flow, where there
    // is no gate to be behind.
    const balance = projectBalance({
      totalPrice: 100_000,
      statusStage: 1,
      payments: [{ amount: 50_000, type: 'deposit' }],
      instalments: [],
    });

    expect(balance.dueNowCents).toBe(50_000);
    expect(balance.remainingCents).toBe(50_000);
  });

  it('ignores a voided schedule the same way', () => {
    const balance = projectBalance({
      totalPrice: 100_000,
      statusStage: 1,
      payments: [],
      instalments: schedule(['void', 'void', 'void']),
    });

    expect(balance.dueNowCents).toBe(100_000);
  });

  it('owes nothing once every instalment has settled', () => {
    const balance = projectBalance({
      totalPrice: 100_000,
      statusStage: 4,
      payments: [
        { amount: 40_000, type: 'deposit' },
        { amount: 60_000, type: 'balance' },
      ],
      instalments: schedule(['paid', 'paid', 'paid']),
    });

    expect(balance).toEqual({
      remainingCents: 0,
      dueNowCents: 0,
      unbilledCents: 0,
      gatedCents: 0,
    });
  });

  it('never reports a negative remainder when someone overpays', () => {
    const balance = projectBalance({
      totalPrice: 100_000,
      statusStage: 4,
      payments: [{ amount: 120_000, type: 'full' }],
      instalments: [],
    });

    expect(balance.remainingCents).toBe(0);
  });
});

describe('instalment gates', () => {
  it('treats signing as always passed', () => {
    expect(gateReached('signing', 0)).toBe(true);
  });

  it('opens design approval once the project is past Design', () => {
    expect(gateReached('design-approval', 1)).toBe(false);
    expect(gateReached('design-approval', 2)).toBe(true);
  });

  it('opens the final payment at Launch', () => {
    expect(gateReached('ready-for-launch', 2)).toBe(false);
    expect(gateReached('ready-for-launch', 3)).toBe(true);
  });
});

/**
 * The Charge button used to go dead and say nothing.
 *
 * Every one of the five reasons it could be disabled is a sentence
 * readChargeDraft() already writes well, and none of them was ever seen —
 * because the thing that would have submitted the request was the thing
 * switched off. A disabled control with no reason reads as a broken page
 * rather than as an unfinished form.
 */
describe('describeChargeBlocker', () => {
  const ready = {
    hasCustomer: true,
    description: 'Second round of homepage design',
    lines: [{ label: 'Design round', amount: '1200' }],
  };

  it('says nothing when the charge is ready to go', () => {
    expect(describeChargeBlocker(ready)).toBeNull();
  });

  /*
   * Ordered the way the form is filled, so it names the next thing to do
   * rather than the worst thing wrong. An empty form has three problems and
   * only one useful sentence.
   */
  it('names the next thing to do, not every thing wrong', () => {
    expect(
      describeChargeBlocker({ hasCustomer: false, description: '', lines: [{ label: '', amount: '' }] })
    ).toContain('Pick the customer');

    expect(
      describeChargeBlocker({ ...ready, description: '   ', lines: [{ label: '', amount: '' }] })
    ).toContain('what the charge is for');
  });

  /*
   * A number that won't parse is a different problem from a number that is
   * missing, and "amount above zero" sends somebody hunting for a zero they
   * never typed. Three decimal places and a stray letter both land here.
   */
  it('tells the difference between a bad amount and a missing one', () => {
    expect(describeChargeBlocker({ ...ready, lines: [{ label: 'Design', amount: '250.999' }] })).toContain(
      'at most two decimal places'
    );
    expect(describeChargeBlocker({ ...ready, lines: [{ label: 'Design', amount: '12o0' }] })).toContain(
      'at most two decimal places'
    );
    expect(describeChargeBlocker({ ...ready, lines: [{ label: 'Design', amount: '' }] })).toContain(
      'description and an amount above zero'
    );
    expect(describeChargeBlocker({ ...ready, lines: [{ label: '', amount: '250' }] })).toContain(
      'description and an amount above zero'
    );
  });

  it('repeats the floor and the ceiling in the same words the server uses', () => {
    expect(describeChargeBlocker({ ...ready, lines: [{ label: 'Tiny', amount: '0.50' }] })).toContain(
      'at least $1'
    );

    const tooBig = describeChargeBlocker({
      ...ready,
      lines: [{ label: 'Typo', amount: '500000' }],
    });
    expect(tooBig).toContain('$500,000');
    expect(tooBig).toContain('extra zero');
  });

  /*
   * A thousands separator is how anybody actually types four figures, and
   * dollarsToCents already strips it. Rejecting it here would be the form
   * disagreeing with the parser that accepts it.
   */
  it('accepts an amount typed the way a person types it', () => {
    expect(describeChargeBlocker({ ...ready, lines: [{ label: 'Design', amount: '$1,200.00' }] })).toBeNull();
  });
});
