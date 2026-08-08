import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Money that arrived some other way.
 *
 * Every invoice could only be settled by Stripe, while the invoice email
 * offers the alternative in as many words — "reply to this email if you'd
 * rather pay another way". So a client paid by transfer and the invoice
 * stayed open forever: on the outstanding total, in the chase queue, and
 * showing that same client a Pay button for money they had already sent.
 *
 * What's pinned here is the set of ways recording it could go wrong quietly:
 * a live payment link left up beside a settled invoice, a status flip with no
 * money behind it, a one-off charge paying down a project it was never part
 * of, and two people pressing the button at once.
 */

const prisma = {
  invoice: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  instalment: { findUnique: vi.fn(), updateMany: vi.fn() },
  payment: { create: vi.fn() },
  $transaction: vi.fn(),
};

const requireStaff = vi.fn();
const paymentLinksUpdate = vi.fn();
const sessionsExpire = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));
vi.mock('@/lib/invoice-dispatch', () => ({
  restoreInvoicePdfAsPaid: vi.fn(async () => 'https://blob.test/BM-2026-0007-paid.pdf'),
}));
vi.mock('@/lib/email', () => ({
  sendPaymentReceiptEmail: vi.fn(async () => ({ sent: true })),
}));
vi.mock('@/lib/project-standing', () => ({
  projectStanding: vi.fn(async () => ({ kind: 'settled' })),
}));
vi.mock('@/lib/site-url', () => ({ resolveSiteUrl: () => 'https://bothmade.test' }));
vi.mock('stripe', () => ({
  default: class {
    paymentLinks = { update: (...args: unknown[]) => paymentLinksUpdate(...args) };
    checkout = { sessions: { expire: (...args: unknown[]) => sessionsExpire(...args) } };
  },
}));

const { POST } = await import('@/app/api/admin/billing/invoices/[invoiceId]/mark-paid/route');
const { restoreInvoicePdfAsPaid } = await import('@/lib/invoice-dispatch');
const { sendPaymentReceiptEmail } = await import('@/lib/email');

function call(body: unknown = { method: 'Bank transfer, ref ACME0312' }, invoiceId = 'inv_1') {
  return POST({ json: async () => body } as never, { params: Promise.resolve({ invoiceId }) });
}

const OPEN_INVOICE = {
  id: 'inv_1',
  number: 'BM-2026-0007',
  projectId: 'proj_1',
  description: 'Second round of homepage design',
  amountCents: 120000,
  status: 'open',
  stripePaymentLinkId: 'plink_1',
  lineItems: [{ label: 'Design round', priceCents: 120000 }],
  createdAt: new Date('2026-02-01T10:00:00Z'),
  client: { id: 'c1', company: 'Acme Dental', email: 'owner@acme.test', contactName: 'Dana' },
  project: { id: 'proj_1', name: 'Acme — Website' },
  payments: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});

  requireStaff.mockResolvedValue({ userId: 'user_kiana', type: 'user', role: 'owner' });
  /*
   * Reset, not just cleared — this one carries a queue.
   *
   * The `$transaction` stub below queues a `mockResolvedValueOnce` so the
   * read-back inside the transaction sees a settled row. `vi.clearAllMocks()`
   * empties `mock.calls` and leaves that queue alone, so any test where the
   * route short-circuits before consuming it handed the *next* test a first
   * `findUnique` that answers "already paid" — and a route that returns early
   * never touches Stripe, so an unrelated case failed asserting the payment
   * link was taken down. Only visible under `--sequence.shuffle`.
   */
  prisma.invoice.findUnique.mockReset();
  prisma.invoice.findUnique.mockResolvedValue(OPEN_INVOICE);
  prisma.instalment.findUnique.mockResolvedValue(null);
  prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
  prisma.instalment.updateMany.mockResolvedValue({ count: 1 });
  prisma.payment.create.mockResolvedValue({ id: 'pay_1' });
  prisma.invoice.update.mockResolvedValue({ ...OPEN_INVOICE, status: 'paid' });
  paymentLinksUpdate.mockResolvedValue({ id: 'plink_1', active: false });
  sessionsExpire.mockResolvedValue({ id: 'cs_1' });

  // The route's second findUnique — the one inside the transaction that reads
  // the settled row back — is the same mock, so it answers with a paid row.
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
    prisma.invoice.findUnique.mockResolvedValueOnce({ ...OPEN_INVOICE, status: 'paid' });
    return fn(prisma);
  });
  vi.mocked(restoreInvoicePdfAsPaid).mockResolvedValue('https://blob.test/BM-2026-0007-paid.pdf');
  vi.mocked(sendPaymentReceiptEmail).mockResolvedValue({ sent: true });
});

describe('recording a payment that did not come through Stripe', () => {
  it('settles the invoice and writes a real payment behind it', async () => {
    const res = await call();

    expect(res.status).toBe(200);

    const settled = prisma.invoice.updateMany.mock.calls[0][0];
    expect(settled.data).toMatchObject({
      status: 'paid',
      paidMethod: 'Bank transfer, ref ACME0312',
      paidById: 'user_kiana',
    });

    /*
     * A Payment row, not only a status. Every revenue figure in the app reads
     * payments rather than invoice statuses, so flipping the status alone
     * would settle the invoice and leave the money invisible to all of them.
     */
    expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({
      projectId: 'proj_1',
      amount: 120000,
      invoiceId: 'inv_1',
      stripeSessionId: null,
    });
  });

  /*
   * The dangerous half. A settled invoice with a live payment link is an
   * invoice the client can pay a second time — the same window the void route
   * closes, in the same order: Stripe first, and a failure there stops
   * everything rather than being logged and shrugged at.
   */
  it('takes the payment link down before recording anything', async () => {
    await call();

    expect(paymentLinksUpdate).toHaveBeenCalledWith('plink_1', { active: false });
  });

  it('changes nothing when Stripe will not take the link down', async () => {
    paymentLinksUpdate.mockRejectedValue(new Error('Stripe down'));

    const res = await call();

    expect(res.status).toBe(502);
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  /*
   * A one-off charge is priced outside Project.totalPrice. Counting it toward
   * the project would mark a build paid off because somebody was separately
   * billed for a change request.
   */
  it('does not let a one-off charge pay down the project', async () => {
    await call();

    expect(prisma.payment.create.mock.calls[0][0].data.type).toBe('custom');
  });

  it('settles the instalment too, and counts it toward the project', async () => {
    prisma.instalment.findUnique.mockResolvedValue({ id: 'inst_2', index: 2, stripeSessionId: 'cs_1' });

    await call();

    // The client's "Payment 2 of 3 — paid" has to move with the money.
    expect(prisma.instalment.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'inst_2', status: { not: 'paid' } },
    });
    expect(prisma.payment.create.mock.calls[0][0].data.type).toBe('balance');
    // Instalments are paid through a checkout session, so that is what has to
    // come down rather than a payment link.
    expect(sessionsExpire).toHaveBeenCalledWith('cs_1');
  });

  it('treats a session Stripe has already finished with as nothing to do', async () => {
    prisma.instalment.findUnique.mockResolvedValue({ id: 'inst_1', index: 1, stripeSessionId: 'cs_1' });
    sessionsExpire.mockRejectedValue(Object.assign(new Error('gone'), { code: 'resource_missing' }));

    const res = await call();

    expect(res.status).toBe(200);
    expect(prisma.payment.create.mock.calls[0][0].data.type).toBe('deposit');
  });

  /*
   * Two people pressing this at once settle it once. The update is scoped to
   * a still-open row, so the second matches nothing and the second payment is
   * never written.
   */
  it('records the money once when two people press it together', async () => {
    prisma.invoice.updateMany.mockResolvedValue({ count: 0 });

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain('somebody else');
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
});

describe('what it refuses', () => {
  /*
   * "Paid" with nothing beside it is the record nobody can reconcile against
   * a bank statement a year later, and the person who could say which
   * transfer it was is never in the room.
   */
  it('will not record a payment with no way to find it again', async () => {
    const res = await call({ method: '   ' });

    expect(res.status).toBe(400);
    expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
  });

  it('will not settle an invoice that is already settled', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ ...OPEN_INVOICE, status: 'paid' });

    const res = await call();

    expect(res.status).toBe(409);
    expect(paymentLinksUpdate).not.toHaveBeenCalled();
  });

  /*
   * A void invoice was withdrawn from the client. Money against it means
   * something has gone wrong that a status flip would hide rather than fix.
   */
  it('will not settle a cancelled invoice', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ ...OPEN_INVOICE, status: 'void' });

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain('Raise a new charge');
  });

  it('turns away anybody not signed in', async () => {
    requireStaff.mockResolvedValue(null);

    const res = await call();

    expect(res.status).toBe(401);
    expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
  });
});

/**
 * A card payment gets both of these from the Stripe webhook. Money that
 * arrives by transfer used to get neither: no acknowledgement that it landed,
 * and an invoice PDF still headed "Amount due" for a bill already settled —
 * which is the copy the client's bookkeeper files.
 */
describe('what the client gets afterwards', () => {
  it('rebuilds the invoice as a receipt and emails one', async () => {
    const res = await call();
    const body = await res.json();

    expect(restoreInvoicePdfAsPaid).toHaveBeenCalledOnce();
    expect(vi.mocked(sendPaymentReceiptEmail).mock.calls[0][0]).toMatchObject({
      toEmail: 'owner@acme.test',
      invoiceNumber: 'BM-2026-0007',
      forLabel: 'Invoice BM-2026-0007',
      // A one-off charge says nothing about the build, so it claims nothing.
      standing: { kind: 'unrelated' },
    });
    expect(body.receiptSent).toBe(true);
    expect(body.invoice.pdfUrl).toBe('https://blob.test/BM-2026-0007-paid.pdf');
    expect(body.warnings).toEqual([]);
  });

  /*
   * Both are after the ledger and both best-effort. The money is recorded; a
   * receipt that fails to send is worth reporting, not worth undoing a
   * payment over.
   */
  it('still records the payment when the receipt will not send', async () => {
    vi.mocked(sendPaymentReceiptEmail).mockResolvedValue({ sent: false, reason: 'mailbox full' });

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(prisma.payment.create).toHaveBeenCalledOnce();
    expect(body.receiptSent).toBe(false);
    expect(body.warnings.join(' ')).toContain('tell them by hand');
  });

  it('says so rather than lying when the PDF cannot be rebuilt', async () => {
    vi.mocked(restoreInvoicePdfAsPaid).mockResolvedValue(null);

    const body = await (await call()).json();

    expect(body.warnings.join(' ')).toContain('still reads as unpaid');
  });
});

/**
 * A client transferring six hundred against a twelve-hundred invoice.
 *
 * The route recorded the invoice's full amount whatever arrived — so the
 * invoice closed, the pay link came down, a receipt went out saying paid, and
 * six hundred still owed dropped off every list that would have chased it.
 */
describe('money that only covers part of it', () => {
  it('records what arrived, not what was billed', async () => {
    await call({ method: 'Bank transfer, ref ACME0312', amountCents: 60000 });

    expect(prisma.payment.create.mock.calls[0][0].data.amount).toBe(60000);
  });

  it('leaves the invoice open, because it is', async () => {
    await call({ method: 'Transfer', amountCents: 60000 });

    const written = prisma.invoice.updateMany.mock.calls[0][0];
    expect(written.data.status).toBeUndefined();
    expect(written.data.paidAt).toBeUndefined();
    // How the most recent money arrived is still worth recording — it is the
    // only thing anybody wants from that field while reconciling.
    expect(written.data.paidMethod).toBe('Transfer');
  });

  /*
   * Killing the link would take away the client's way of sending the rest,
   * which is the opposite of what anybody wants after a part payment.
   */
  it('leaves the payment link working so they can send the rest', async () => {
    await call({ method: 'Transfer', amountCents: 60000 });

    expect(paymentLinksUpdate).not.toHaveBeenCalled();
  });

  it('does not settle an instalment on half of it', async () => {
    prisma.instalment.findUnique.mockResolvedValue({ id: 'inst_2', index: 2, stripeSessionId: 'cs_1' });

    await call({ method: 'Transfer', amountCents: 60000 });

    expect(prisma.instalment.updateMany).not.toHaveBeenCalled();
    expect(sessionsExpire).not.toHaveBeenCalled();
  });

  /*
   * A receipt says settled and the rebuilt PDF is headed "Paid in full". On a
   * half-settled invoice both are documents that contradict the money, handed
   * to the person most likely to file them.
   */
  it('sends no receipt and rebuilds no paid-in-full PDF', async () => {
    const res = await call({ method: 'Transfer', amountCents: 60000 });
    const body = await res.json();

    expect(sendPaymentReceiptEmail).not.toHaveBeenCalled();
    expect(restoreInvoicePdfAsPaid).not.toHaveBeenCalled();
    expect(body.settled).toBe(false);
    expect(body.remainingCents).toBe(60000);
    expect(body.warnings.join(' ')).toContain('$600 is still owed');
  });

  it('measures a second payment against what is left, not the total', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      ...OPEN_INVOICE,
      payments: [{ amount: 60000 }],
    });

    const res = await call({ method: 'Transfer', amountCents: 70000 });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('already come in');
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('closes it when the last of the money arrives', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      ...OPEN_INVOICE,
      payments: [{ amount: 60000 }],
    });

    const res = await call({ method: 'Transfer', amountCents: 60000 });
    const body = await res.json();

    expect(body.settled).toBe(true);
    expect(prisma.invoice.updateMany.mock.calls[0][0].data.status).toBe('paid');
    expect(paymentLinksUpdate).toHaveBeenCalledWith('plink_1', { active: false });
    expect(sendPaymentReceiptEmail).toHaveBeenCalledOnce();
  });
});
