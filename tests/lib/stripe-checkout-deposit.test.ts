import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What `createCheckoutSession` actually charges.
 *
 * `/api/checkout`'s own tests mock this function out, so nothing verified the
 * one number that leaves a customer's bank account. It matters because the
 * /start page promises "a 50% deposit to begin Discovery" while the session
 * was being created for the full project total — a $20,000 build billed at
 * $20,000 on a page saying $10,000 was due. These tests pin the amount, the
 * metadata the webhook branches on, and the arithmetic at the edges.
 */

const sessionsCreate = vi.fn();

vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: (...args: unknown[]) => sessionsCreate(...args) } };
    webhooks = { constructEvent: vi.fn() };
  },
}));

const { createCheckoutSession } = await import('@/lib/stripe');
const { calculatePrice, depositAmount, DEPOSIT_PERCENT } = await import('@/lib/pricing');

const INPUT = {
  baseService: 'website' as const,
  addOns: ['seo' as const],
  clientType: 'smb' as const,
  timeline: 'standard' as const,
  clientEmail: 'frell@linpotia.com',
  company: 'Linpotia Cafe',
};

/** The session argument Stripe was handed on the last call. */
function lastSession() {
  return sessionsCreate.mock.calls[0][0];
}

beforeEach(() => {
  sessionsCreate.mockReset().mockResolvedValue({
    id: 'cs_test_1',
    url: 'https://stripe.test/pay',
  });
});

describe('createCheckoutSession — the amount charged', () => {
  it('charges the deposit, not the full project total', async () => {
    const { totalPrice } = calculatePrice(INPUT);

    await createCheckoutSession(INPUT, 'https://x/ok', 'https://x/no');

    const charged = lastSession().line_items[0].price_data.unit_amount;
    expect(charged).toBe(depositAmount(totalPrice));
    // The regression this exists to catch.
    expect(charged).not.toBe(totalPrice);
  });

  it('charges exactly the advertised percentage', async () => {
    const { totalPrice } = calculatePrice(INPUT);

    await createCheckoutSession(INPUT, 'https://x/ok', 'https://x/no');

    const charged = lastSession().line_items[0].price_data.unit_amount;
    expect(charged).toBe(Math.round((totalPrice * DEPOSIT_PERCENT) / 100));
  });

  it('hands Stripe a whole number of cents', async () => {
    // An odd total halves to a fraction; Stripe rejects non-integer amounts.
    await createCheckoutSession(
      { ...INPUT, baseService: 'multi', addOns: [], clientType: 'enterprise', timeline: 'rush' },
      'https://x/ok',
      'https://x/no'
    );

    const charged = lastSession().line_items[0].price_data.unit_amount;
    expect(Number.isInteger(charged)).toBe(true);
    expect(charged).toBeGreaterThan(0);
  });
});

describe('createCheckoutSession — what the webhook reads back', () => {
  it('marks the payment as a deposit so it is not booked as paid in full', async () => {
    await createCheckoutSession(INPUT, 'https://x/ok', 'https://x/no');

    // The webhook branches on exactly this string to choose Payment.type.
    expect(lastSession().metadata.paymentType).toBe('deposit');
  });

  it('carries both the deposit taken and the total owed, so the balance is derivable', async () => {
    const { totalPrice } = calculatePrice(INPUT);

    await createCheckoutSession(INPUT, 'https://x/ok', 'https://x/no');

    const { metadata } = lastSession();
    expect(metadata.depositAmount).toBe(String(depositAmount(totalPrice)));
    // totalPrice stays the contract value — collect-balance subtracts from it.
    expect(metadata.totalPrice).toBe(String(totalPrice));
    expect(Number(metadata.totalPrice) - Number(metadata.depositAmount)).toBe(
      totalPrice - depositAmount(totalPrice)
    );
  });
});

describe('createCheckoutSession — what the customer is told', () => {
  it('says on the Stripe page that this is a deposit and a balance follows', async () => {
    await createCheckoutSession(INPUT, 'https://x/ok', 'https://x/no');

    const product = lastSession().line_items[0].price_data.product_data;
    expect(product.name).toContain('50% deposit');
    expect(product.description).toContain('Balance due before launch');
  });
});
