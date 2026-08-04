import { describe, expect, it } from 'vitest';
import {
  MAX_CHARGE_CENTS,
  amountPaidTowardProject,
  dollarsToCents,
  formatInvoiceNumber,
  invoiceFilename,
  invoiceNumberPrefix,
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
