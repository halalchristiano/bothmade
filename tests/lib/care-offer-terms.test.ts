import { describe, expect, it, vi } from 'vitest';

/**
 * The terms of a monthly charge, as the studio and the client each see them.
 *
 * lib/care-offers had no tests at all, and it is the module that decides what
 * a recurring plan costs, what the introductory discount is, and — in
 * `discountLabel` — the sentence describing that discount "on invoices and in
 * email", in its own words.
 *
 * `scheduleForOffer` is careful about a discount type it does not recognise:
 * a row written before the column existed, or edited by hand, is treated as a
 * percentage rather than allowed to become a silent 100% off. `discountLabel`
 * reads the same column and was not, so the two disagreed about the same row:
 * the schedule charged a percentage while the invoice described dollars.
 */

vi.mock('@/lib/email', () => ({ sendCarePlanOfferEmail: vi.fn(async () => ({ sent: true })) }));
vi.mock('@/lib/share-links', () => ({ buildCareOfferUrl: (t: string) => `https://bothmade.test/care/${t}` }));

const { discountLabel, scheduleForOffer, serializeOffer } = await import('@/lib/care-offers');

/** The columns these functions actually read. */
const offer = (over: Record<string, unknown> = {}) =>
  ({
    id: 'offer_1',
    token: 'tok_1',
    addOns: 'hosting-care',
    monthlyCents: 20_000,
    discountType: 'percent',
    discountValue: 25,
    freeMonths: 2,
    discountMonths: 6,
    status: 'sent',
    note: null,
    sentAt: new Date('2026-08-01T10:00:00Z'),
    acceptedAt: null,
    canceledAt: null,
    ...over,
  }) as never;

describe('describing the discount to a client', () => {
  it('says a percentage when the discount is a percentage', () => {
    expect(discountLabel(offer({ discountType: 'percent', discountValue: 25 }))).toBe(
      'Introductory rate (25% off)'
    );
  });

  it('says an amount when the discount is an amount', () => {
    expect(discountLabel(offer({ discountType: 'amount', discountValue: 5_000 }))).toBe(
      'Introductory rate ($50/month off)'
    );
  });

  it('says nothing at all when there is no discount', () => {
    expect(discountLabel(offer({ discountValue: 0 }))).toBeNull();
    expect(discountLabel(offer({ discountValue: -5 }))).toBeNull();
  });

  /**
   * The one that was wrong.
   *
   * `scheduleForOffer` falls back to 'percent' for anything it does not
   * recognise, and says why. This read the same column and treated everything
   * that was not exactly 'percent' as an amount — so a row carrying a legacy
   * or hand-written type produced a schedule discounted by 25 percent and an
   * invoice line reading "$0.25/month off" about it.
   */
  it('describes an unrecognised discount type the same way the schedule charges it', () => {
    const legacy = offer({ discountType: 'introductory', discountValue: 25 });

    // What the client is actually charged: 25% off 200.00 is 150.00.
    expect(scheduleForOffer(legacy).discountedCents).toBe(15_000);
    // So the sentence on the invoice has to say percent too.
    expect(discountLabel(legacy)).toBe('Introductory rate (25% off)');
  });

  it('is not fooled by an empty or missing type', () => {
    expect(discountLabel(offer({ discountType: '', discountValue: 10 }))).toBe(
      'Introductory rate (10% off)'
    );
  });
});

describe('the schedule read off a row', () => {
  it('applies a percentage discount to the monthly price', () => {
    expect(scheduleForOffer(offer()).discountedCents).toBe(15_000);
  });

  it('applies an amount discount as cents off', () => {
    const s = scheduleForOffer(offer({ discountType: 'amount', discountValue: 5_000 }));
    expect(s.discountedCents).toBe(15_000);
  });

  it('refuses to let an unknown type become a free plan', () => {
    // The failure this guard exists for: 'amount' semantics on a value of 100
    // would be $1 off; percent semantics is 100% off. Neither may happen by
    // accident, and the row must still cost something.
    const s = scheduleForOffer(offer({ discountType: 'nonsense', discountValue: 25 }));
    expect(s.discountedCents).toBeGreaterThan(0);
  });
});

describe('what the admin screen is handed', () => {
  it('carries the offer link, which is the credential for a monthly charge', () => {
    const s = serializeOffer(offer());
    expect(s.offerUrl).toBe('https://bothmade.test/care/tok_1');
  });

  it('sums what has been paid so far and names the latest payment', () => {
    const s = serializeOffer(
      offer({
        payments: [
          { amount: 15_000, createdAt: new Date('2026-10-01T10:00:00Z') },
          { amount: 15_000, createdAt: new Date('2026-09-01T10:00:00Z') },
        ],
      })
    );

    expect(s.paidToDate).toBe(30_000);
    expect(s.paymentCount).toBe(2);
    // Newest first — both callers order the relation that way, and this reads
    // the first row rather than scanning for a maximum.
    expect(s.lastPaidAt).toBe('2026-10-01T10:00:00.000Z');
  });

  it('reports nothing paid rather than throwing when there are no payments', () => {
    const s = serializeOffer(offer());
    expect(s.paidToDate).toBe(0);
    expect(s.lastPaidAt).toBeNull();
  });
});
