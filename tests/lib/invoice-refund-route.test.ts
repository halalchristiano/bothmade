import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Refunding is the only action in this system that sends money out, and it
 * cannot be undone. So what is pinned here is the ordering: Stripe moves the
 * money first, and nothing is written down until it confirms.
 *
 * The other order — record it, then call Stripe — produces the one failure
 * that cannot be cleaned up afterwards: books saying the client was refunded
 * while the money is still sitting in the account, and nobody looking into it
 * because every screen says it is done.
 */

const prisma = {
  invoice: {
    findUnique: vi.fn(),
    update: vi.fn(async (args: { data: Record<string, unknown> }) => args.data),
  },
  payment: { create: vi.fn() },
  projectUpdate: { create: vi.fn(async () => ({})) },
  $transaction: vi.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
};

const requireStaff = vi.fn();
const sessionsRetrieve = vi.fn();
const refundsCreate = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { retrieve: (...a: unknown[]) => sessionsRetrieve(...a) } };
    refunds = { create: (...a: unknown[]) => refundsCreate(...a) };
  },
}));
vi.mock('@/lib/email', () => ({
  sendInvoiceRefundedEmail: vi.fn(async () => ({ sent: true })),
}));

const { POST } = await import('@/app/api/admin/billing/invoices/[invoiceId]/refund/route');

const INVOICE = {
  id: 'inv_1',
  number: 'BM-2026-0007',
  description: 'Third-party integration',
  amountCents: 250_000,
  refundedCents: 0,
  status: 'paid',
  projectId: 'proj_1',
  sentToEmail: 'ana@ridgeline.test',
  stripeRefundId: null,
  client: { company: 'Ridgeline Dental', email: 'ana@ridgeline.test', contactName: 'Ana' },
  project: { id: 'proj_1', name: 'Ridgeline site', status: 'build' },
  payments: [{ id: 'pay_1', stripeSessionId: 'cs_test_1', amount: 250_000, type: 'custom' }],
};

const call = (body: Record<string, unknown>) =>
  POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never, {
    params: Promise.resolve({ invoiceId: 'inv_1' }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireStaff.mockResolvedValue({ userId: 'user_1', role: 'owner' });
  prisma.invoice.findUnique.mockResolvedValue({ ...INVOICE });
  prisma.invoice.update.mockImplementation(async (args: { data: Record<string, unknown> }) => args.data);
  sessionsRetrieve.mockResolvedValue({ payment_intent: 'pi_test_1' });
  refundsCreate.mockResolvedValue({ id: 're_test_1' });
});

describe('refunding through Stripe', () => {
  it('refunds the payment intent behind the checkout session', async () => {
    // The Payment row stores a Checkout Session; only the session knows which
    // PaymentIntent actually took the money.
    const res = await call({ amountCents: 100_000, method: 'stripe', reason: 'Descoped' });

    expect(res.status).toBe(200);
    expect(sessionsRetrieve).toHaveBeenCalledWith('cs_test_1');
    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_test_1', amount: 100_000 }),
      expect.objectContaining({ idempotencyKey: expect.stringContaining('inv_1') })
    );
  });

  it('refunds the net, not the gross, when something is withheld', async () => {
    // Section 8(d)/(f): deductions are withheld from the refund, not refunded
    // and then re-invoiced.
    await call({
      amountCents: 100_000,
      method: 'stripe',
      reason: 'Descoped',
      deductions: [{ label: 'Domain registration', amountCents: 1_800 }],
    });

    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 98_200 }),
      expect.anything()
    );
  });

  /**
   * The whole reason the route is ordered the way it is. A refund Stripe
   * refused must leave no trace, or the books claim money went back that
   * never did.
   */
  it('writes nothing when Stripe refuses', async () => {
    refundsCreate.mockRejectedValue(new Error('charge_already_refunded'));

    const res = await call({ amountCents: 100_000, method: 'stripe', reason: 'Descoped' });

    expect(res.status).toBe(502);
    expect(prisma.invoice.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes nothing when Stripe cannot be reached at all', async () => {
    sessionsRetrieve.mockRejectedValue(new Error('network'));

    const res = await call({ amountCents: 100_000, method: 'stripe', reason: 'Descoped' });

    expect(res.status).toBe(502);
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it('refuses a card refund when no Stripe payment was ever recorded', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      ...INVOICE,
      payments: [{ id: 'pay_1', stripeSessionId: null, amount: 250_000, type: 'custom' }],
    });

    const res = await call({ amountCents: 1_000, method: 'stripe', reason: 'x' });

    expect(res.status).toBe(409);
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it('refuses when the checkout never completed, rather than guessing', async () => {
    sessionsRetrieve.mockResolvedValue({ payment_intent: null });

    const res = await call({ amountCents: 1_000, method: 'stripe', reason: 'x' });

    expect(res.status).toBe(409);
    expect(refundsCreate).not.toHaveBeenCalled();
  });
});

describe('the refund ledger', () => {
  /**
   * Every balance calculation in the system reads Payment rows. Without a
   * negative one, a refunded deposit goes on reading as money received and
   * the project reads as paid down by an amount sitting back in the client's
   * account.
   */
  it('writes a negative payment carrying the original type', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      ...INVOICE,
      description: 'Payment 1 of 3',
      amountCents: 800_000,
      payments: [{ id: 'pay_1', stripeSessionId: 'cs_test_1', amount: 800_000, type: 'deposit' }],
    });

    await call({ amountCents: 800_000, method: 'manual', reason: 'Cancelled under 8(g)' });

    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: -800_000, type: 'deposit', projectId: 'proj_1' }),
    });
  });

  /**
   * A credit is the case where nothing moves: the client is owed value, the
   * studio still holds the cash. A ledger row would say money left.
   */
  it('writes no ledger row for a credit', async () => {
    await call({ amountCents: 100_000, method: 'credit', reason: 'Goodwill on the delay' });

    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it('records the running total rather than the latest amount', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ ...INVOICE, refundedCents: 100_000 });

    await call({ amountCents: 50_000, method: 'manual', reason: 'More descoped' });

    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ refundedCents: 150_000 }) })
    );
  });
});

describe('who may refund', () => {
  it('turns away anyone not signed in', async () => {
    requireStaff.mockResolvedValue(null);

    expect((await call({ amountCents: 1000, method: 'manual', reason: 'x' })).status).toBe(401);
  });
});
