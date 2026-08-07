import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Voiding an invoice, which had no test on the route at all.
 *
 * canVoid() is covered in invoice-lifecycle.test.ts and passes, which made the
 * feature look tested. It is a four-line pure function about a status string;
 * everything that can actually cost money lives out here.
 *
 * The route's own docstring says the important half is not the database write
 * but taking the payment link down, and that a failure to take it down blocks
 * the void rather than being logged and shrugged at. That was true only of
 * custom charges, which pay through a Stripe Payment Link. The invoices the
 * studio sends most — the instalments — pay through a Checkout Session held on
 * the Instalment row, and voiding one took nothing down.
 *
 * The live link was the smaller half. The instalment stayed `due`, and
 * payment-clock chases every `due` instalment, minting a fresh Stripe session
 * each time. So the client received an email saying the invoice was cancelled
 * and there was nothing to pay, and a working payment link for it the next
 * morning, and every few days after that, forever.
 */

const prisma = {
  invoice: { findUnique: vi.fn(async (_a: unknown) => null as unknown), update: vi.fn(async (_a: unknown) => ({})) },
  instalment: { findUnique: vi.fn(async (_a: unknown) => null as unknown), update: vi.fn(async (_a: unknown) => ({})) },
  projectUpdate: { create: vi.fn(async (_a: unknown) => ({})) },
  $transaction: vi.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
};

const sessionsExpire = vi.fn(async (_id: string) => ({}) as unknown);
const paymentLinksUpdate = vi.fn(async (_id: string, _a: unknown) => ({}) as unknown);
const sendInvoiceVoidedEmail = vi.fn(async (_a: unknown) => ({ sent: true }));

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ userId: 'user_1' }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));
vi.mock('@/lib/email', () => ({ sendInvoiceVoidedEmail }));
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { expire: sessionsExpire } };
    paymentLinks = { update: paymentLinksUpdate };
  },
}));

const { POST } = await import('@/app/api/admin/billing/invoices/[invoiceId]/void/route');

const INVOICE = {
  id: 'invoice_1',
  number: 'BM-2026-0007',
  status: 'open',
  amountCents: 300_000,
  description: 'Payment 2 of 3 — Acme Site',
  projectId: 'proj_1',
  sentToEmail: 'client@acme.test',
  stripePaymentLinkId: null,
  client: { company: 'Acme', email: 'client@acme.test', contactName: 'Dana' },
  project: { id: 'proj_1', name: 'Acme Site', status: 'design' },
};

const INSTALMENT = { id: 'inst_1', label: 'Payment 2 of 3', stripeSessionId: 'cs_live' };

const voidIt = async (body: Record<string, unknown> = { reason: 'Billed the wrong stage.' }) =>
  POST(
    new Request('https://x/void', { method: 'POST', body: JSON.stringify(body) }) as never,
    { params: Promise.resolve({ invoiceId: 'invoice_1' }) }
  );

/** The single update applied to the instalment row, if any. */
const instalmentPatch = () =>
  (prisma.instalment.update.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined)?.data;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  prisma.invoice.findUnique.mockResolvedValue(INVOICE);
  prisma.invoice.update.mockResolvedValue({ ...INVOICE, status: 'void' });
  prisma.instalment.findUnique.mockResolvedValue(INSTALMENT);
  prisma.instalment.update.mockResolvedValue({});
  prisma.projectUpdate.create.mockResolvedValue({});
  sessionsExpire.mockResolvedValue({});
  sendInvoiceVoidedEmail.mockResolvedValue({ sent: true });
});

describe('voiding an instalment invoice', () => {
  it('expires the checkout session the client was emailed', async () => {
    await voidIt();

    expect(sessionsExpire).toHaveBeenCalledWith('cs_live');
  });

  it('takes the instalment off the chase list', async () => {
    const res = await voidIt();
    expect(res.status).toBe(200);

    // payment-clock selects on `status: 'due'`. Anything else stops the chase.
    expect(instalmentPatch()).toMatchObject({ status: 'scheduled' });
  });

  /**
   * Not `void`. Every balance calculation skips void instalments, so marking
   * it void would delete the money from the project's remaining balance —
   * turning "we sent the wrong invoice" into "the client owes 30% less".
   */
  it('keeps the money owed rather than erasing it from the schedule', async () => {
    await voidIt();

    expect(instalmentPatch()?.status).not.toBe('void');
  });

  it('clears the invoice number so a re-send cannot re-issue a voided invoice', async () => {
    await voidIt();

    expect(instalmentPatch()).toMatchObject({ invoiceNumber: null });
  });

  it('drops the dead link and session from the row', async () => {
    await voidIt();

    expect(instalmentPatch()).toMatchObject({ paymentUrl: null, stripeSessionId: null });
  });

  /** A re-invoiced payment gets the full fourteen days, not an inherited schedule. */
  it('resets the chase clock', async () => {
    await voidIt();

    expect(instalmentPatch()).toMatchObject({ chaseCount: 0, lastChasedAt: null, invoicedAt: null });
  });

  it('marks the invoice void and says why', async () => {
    await voidIt({ reason: 'Billed the wrong stage.' });

    expect((prisma.invoice.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data)
      .toMatchObject({ status: 'void', voidReason: 'Billed the wrong stage.', paymentUrl: null });
  });

  it('writes the invoice and the instalment in one transaction', async () => {
    await voidIt();

    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

describe('when Stripe will not let go of the session', () => {
  it('refuses the void rather than recording one the client can still pay', async () => {
    sessionsExpire.mockRejectedValue(Object.assign(new Error('nope'), { code: 'api_error' }));

    const res = await voidIt();

    expect(res.status).toBe(502);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(sendInvoiceVoidedEmail).not.toHaveBeenCalled();
  });

  /** A session already gone is not a reason to block — there is nothing to pay. */
  it('proceeds when the session was already expired or missing', async () => {
    sessionsExpire.mockRejectedValue(Object.assign(new Error('gone'), { code: 'resource_missing' }));

    const res = await voidIt();

    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

describe('a custom charge, which pays by payment link', () => {
  beforeEach(() => {
    prisma.invoice.findUnique.mockResolvedValue({ ...INVOICE, stripePaymentLinkId: 'plink_1' });
    prisma.instalment.findUnique.mockResolvedValue(null);
  });

  it('deactivates the link and touches no instalment', async () => {
    const res = await voidIt();

    expect(res.status).toBe(200);
    expect(paymentLinksUpdate).toHaveBeenCalledWith('plink_1', { active: false });
    expect(prisma.instalment.update).not.toHaveBeenCalled();
  });
});

describe('what it refuses', () => {
  it('will not void a paid invoice', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ ...INVOICE, status: 'paid' });

    const res = await voidIt();

    expect(res.status).toBe(409);
    expect(sessionsExpire).not.toHaveBeenCalled();
  });

  it('will not void without a reason', async () => {
    const res = await voidIt({});

    expect(res.status).toBe(400);
    expect(sessionsExpire).not.toHaveBeenCalled();
  });
});
