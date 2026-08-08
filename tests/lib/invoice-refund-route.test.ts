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
    updateMany: vi.fn(async (_a: unknown) => ({ count: 1 })),
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
const restoreInvoicePdfAsPartPaid = vi.fn(
  async (..._a: unknown[]): Promise<string | null> => 'https://blob.test/part.pdf'
);
vi.mock('@/lib/invoice-dispatch', () => ({ restoreInvoicePdfAsPartPaid }));

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
  prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
  sessionsRetrieve.mockResolvedValue({ payment_intent: 'pi_test_1' });
  refundsCreate.mockResolvedValue({ id: 're_test_1' });
  restoreInvoicePdfAsPartPaid.mockResolvedValue('https://blob.test/part.pdf');
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
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes nothing when Stripe cannot be reached at all', async () => {
    sessionsRetrieve.mockRejectedValue(new Error('network'));

    const res = await call({ amountCents: 100_000, method: 'stripe', reason: 'Descoped' });

    expect(res.status).toBe(502);
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
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

    expect(prisma.invoice.updateMany).toHaveBeenCalledWith(
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

/**
 * Two people pressing Refund at once — or one person pressing it twice.
 *
 * The idempotency key already stops Stripe sending the money twice: both
 * requests compute the same key from the invoice and the amount, and Stripe
 * replays the first refund for the second. That covered the visible half and
 * left the expensive one open.
 *
 * Both requests read `refundedCents: 0`, both measured the ceiling against
 * it, and both then wrote `0 + amount` and created a NEGATIVE PAYMENT ROW.
 * The invoice came out right by luck — last writer wins on the same number —
 * and the ledger came out saying twice as much money went back as actually
 * did. That is the half that matters, because every balance figure in the app
 * is derived from Payment rows rather than from invoice fields, so the
 * phantom row reopens a paid-off project and understates revenue with nothing
 * on screen to contradict it.
 *
 * `refundedCents` in the WHERE is the version check. A request that lost the
 * race matches nothing and stops before writing.
 */
describe('two refunds racing each other', () => {
  it('claims the invoice against the exact figure the ceiling was measured on', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ ...INVOICE, refundedCents: 100_000 });

    await call({ amountCents: 50_000, method: 'manual', reason: 'More descoped' });

    expect(prisma.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'inv_1', refundedCents: 100_000 } })
    );
  });

  it('writes no second ledger row when it lost the race', async () => {
    prisma.invoice.updateMany.mockResolvedValue({ count: 0 });

    const res = await call({ amountCents: 100_000, method: 'stripe', reason: 'Descoped' });

    expect(res.status).toBe(409);
    // The money is fine — Stripe replayed rather than re-sent. What must not
    // happen is a second -£1,000 appearing in the ledger for it.
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(prisma.projectUpdate.create).not.toHaveBeenCalled();
  });

  it('still records the winner normally', async () => {
    const res = await call({ amountCents: 100_000, method: 'stripe', reason: 'Descoped' });

    expect(res.status).toBe(200);
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: -100_000 }) })
    );
  });
});


/**
 * A refund on an invoice that stays open.
 *
 * Refunding moves `refundedCents`, not `status`, so an invoice part paid by
 * transfer and then refunded is still open — and its stored PDF, the copy a
 * client's bookkeeper files, went on asking for the full amount from somebody
 * we had just sent money back to. Nothing rebuilt it, because the only two
 * rebuilds were "as paid" and "as cancelled".
 */
describe('the document a refunded, still-open invoice leaves behind', () => {
  const OPEN = {
    ...INVOICE,
    status: 'open',
    payments: [{ id: 'pay_1', stripeSessionId: null, amount: 90_000, type: 'custom' }],
  };

  beforeEach(() => {
    prisma.invoice.findUnique.mockResolvedValue({ ...OPEN });
  });

  it('is rebuilt with what is left here and what went back', async () => {
    await call({ amountCents: 40_000, method: 'manual', reason: 'Shoot cancelled' });

    expect(restoreInvoicePdfAsPartPaid).toHaveBeenCalledOnce();
    expect(restoreInvoicePdfAsPartPaid.mock.calls[0][2]).toEqual({
      receivedCents: 50_000,
      refundedCents: 40_000,
    });
  });

  /*
   * A credit moves no money — it writes no negative Payment row, which is the
   * whole distinction between the two. Taking it off what is sitting here
   * would print a document claiming less of the client's money is here than
   * actually is, on the one path where the cash never left the account.
   */
  it('takes nothing off what is here when the money was credited, not sent', async () => {
    await call({ amountCents: 40_000, method: 'credit', reason: 'Against the next invoice' });

    expect(restoreInvoicePdfAsPartPaid.mock.calls[0][2]).toEqual({
      receivedCents: 90_000,
      refundedCents: 40_000,
    });
  });

  it('says so when the rebuild fails, rather than reporting a clean refund', async () => {
    restoreInvoicePdfAsPartPaid.mockResolvedValueOnce(null);

    const body = await (await call({ amountCents: 40_000, method: 'manual', reason: 'x' })).json();

    expect(body.success).toBe(true);
    expect(body.warnings.join(' ')).toMatch(/still has a PDF asking for the full/i);
  });

  /* A settled invoice's PDF says "Paid", which stays true after a refund —
     and the refund email carries the settlement in the shape Section 8(l)
     requires. Rewriting a receipt into something else is a different
     document, not a corrected one. */
  it('leaves a settled invoice receipt alone', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ ...INVOICE });

    const body = await (await call({ amountCents: 40_000, method: 'stripe', reason: 'x' })).json();

    expect(restoreInvoicePdfAsPartPaid).not.toHaveBeenCalled();
    expect(body.warnings).toEqual([]);
  });
});
