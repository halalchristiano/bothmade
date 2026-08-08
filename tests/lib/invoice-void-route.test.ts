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
const restoreInvoicePdfAsCancelled = vi.fn(async (..._a: unknown[]): Promise<string | null> => "https://blob.test/cancelled.pdf");

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ userId: 'user_1' }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));
vi.mock('@/lib/email', () => ({ sendInvoiceVoidedEmail }));
vi.mock('@/lib/invoice-dispatch', () => ({ restoreInvoicePdfAsCancelled }));
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
  lineItems: [{ label: 'Payment 2 of 3', priceCents: 300_000 }],
  createdAt: new Date('2026-08-04T00:00:00Z'),
  status: 'open',
  amountCents: 300_000,
  description: 'Payment 2 of 3 — Acme Site',
  projectId: 'proj_1',
  sentToEmail: 'client@acme.test',
  stripePaymentLinkId: null,
  client: { company: 'Acme', email: 'client@acme.test', contactName: 'Dana' },
  project: { id: 'proj_1', name: 'Acme Site', status: 'design' },
  // Nothing has arrived against it. An invoice can be part paid by transfer,
  // and the route now reads this to refuse cancelling one that money has come
  // in against.
  payments: [],
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
  restoreInvoicePdfAsCancelled.mockResolvedValue('https://blob.test/cancelled.pdf');
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

/**
 * The document, which is the part that leaves the app.
 *
 * A void puts a badge on two dashboards and a sentence in an email. The stored
 * PDF said "Amount due: $3,000" and went on saying it — and that file is what
 * a client forwards to their bookkeeper, who has neither dashboard nor email.
 */
describe('the PDF a cancelled invoice leaves behind', () => {
  it('is rebuilt as cancelled, with the reason the client was given', async () => {
    await voidIt({ reason: 'Billed the wrong stage.' });

    expect(restoreInvoicePdfAsCancelled).toHaveBeenCalledOnce();
    const [, inv, , reason] = restoreInvoicePdfAsCancelled.mock.calls[0] as unknown[];
    expect((inv as { number: string }).number).toBe('BM-2026-0007');
    expect(reason).toBe('Billed the wrong stage.');
  });

  /** After the write, and never able to undo it. */
  it('still voids when the PDF cannot be rebuilt', async () => {
    restoreInvoicePdfAsCancelled.mockRejectedValueOnce(new Error('blob down'));

    const res = await voidIt();

    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  /**
   * The document is the only part of this that leaves the app.
   *
   * A cancelled invoice puts a badge on two dashboards and a sentence in an
   * email. The PDF is what a client forwards to their bookkeeper, who has
   * neither — so when the rebuild fails, the file they file still reads
   * "Amount due: $1,200" on an invoice we have withdrawn.
   *
   * Failing quietly is the right call for the void itself: the ledger is the
   * fact and it has committed. Failing quietly for the person who pressed the
   * button is not. The settling path already warns them ("the receipt PDF
   * couldn't be rebuilt"); this one logged to a console nobody is reading and
   * returned success.
   */
  it('says so when the cancelled PDF could not be rebuilt', async () => {
    restoreInvoicePdfAsCancelled.mockResolvedValueOnce(null);

    const res = await voidIt();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.warnings.join(' ')).toMatch(/still reads/i);
    expect(body.warnings.join(' ')).toContain('BM-2026-0007');
  });

  it('says so when the rebuild threw, too', async () => {
    restoreInvoicePdfAsCancelled.mockRejectedValueOnce(new Error('blob down'));

    const body = await (await voidIt()).json();

    expect(body.warnings.join(' ')).toMatch(/still reads/i);
  });

  it('warns about nothing when it worked', async () => {
    const body = await (await voidIt()).json();

    expect(body.warnings).toEqual([]);
  });

  it('does not touch the PDF when the void was refused', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ ...INVOICE, status: 'paid' });

    await voidIt();

    expect(restoreInvoicePdfAsCancelled).not.toHaveBeenCalled();
  });
});

/**
 * Void means "this should never have existed": the pay link dies, the client
 * is told to ignore it, and both dashboards mark it cancelled. Doing that to
 * an invoice a client has already sent money against writes off a payment
 * that really happened — the exact thing the paid-invoice guard exists to
 * prevent, reached through the door that opened when invoices stopped being
 * all-or-nothing.
 */
describe('an invoice money has already come in against', () => {
  it('is not cancellable, and the refusal says how much arrived', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ ...INVOICE, payments: [{ amount: 90_000 }] });

    const res = await voidIt();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain('$900');
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  /*
   * And nothing is taken down on the way. The link is what the client would
   * use to send the rest.
   */
  it('leaves the way to pay it alone', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      ...INVOICE,
      stripePaymentLinkId: 'plink_1',
      payments: [{ amount: 90_000 }],
    });

    await voidIt();

    expect(paymentLinksUpdate).not.toHaveBeenCalled();
    expect(sessionsExpire).not.toHaveBeenCalled();
  });
});
