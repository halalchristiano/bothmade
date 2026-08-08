import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * An invoice could be raised and then never sent again.
 *
 * Raised with "email the client" off, or with it on and the send failing, or
 * sent fine and lost at the other end — all three left an invoice in the
 * ledger the client had never received, and the only actions on the row were
 * Cancel and Refund. So the answer to "they say they never got it" was to
 * cancel a good invoice and raise the same charge under a new number.
 *
 * What's pinned here is the set of ways sending again could go wrong quietly:
 * chasing money that has already been paid, minting a second way to pay an
 * instalment the schedule is already tracking, replacing a PDF the client is
 * holding, and counting a chase that never left the building.
 */

const prisma = {
  invoice: { findUnique: vi.fn(), update: vi.fn() },
  instalment: { findUnique: vi.fn() },
};

const requireStaff = vi.fn();
const put = vi.fn();
const paymentLinksCreate = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));
vi.mock('@vercel/blob', () => ({ put: (...args: unknown[]) => put(...args) }));
vi.mock('stripe', () => ({
  default: class {
    paymentLinks = { create: (...args: unknown[]) => paymentLinksCreate(...args) };
  },
}));
vi.mock('@/lib/invoice-pdf', () => ({
  buildCustomChargeInvoicePdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));
vi.mock('@/lib/email', () => ({
  sendCustomChargeEmail: vi.fn(async () => ({ sent: true })),
}));

const { POST } = await import('@/app/api/admin/billing/invoices/[invoiceId]/send/route');
const { sendCustomChargeEmail } = await import('@/lib/email');
const { buildCustomChargeInvoicePdf } = await import('@/lib/invoice-pdf');

function call(invoiceId = 'inv_1') {
  return POST({} as never, { params: Promise.resolve({ invoiceId }) });
}

const OPEN_INVOICE = {
  id: 'inv_1',
  number: 'BM-2026-0007',
  description: 'Second round of homepage design',
  amountCents: 120000,
  status: 'open',
  lineItems: [{ label: 'Design round', priceCents: 120000 }],
  pdfUrl: null,
  paymentUrl: null,
  stripePaymentLinkId: null,
  sentToEmail: null,
  sendCount: 0,
  createdAt: new Date('2026-02-01T10:00:00Z'),
  client: { company: 'Acme Dental', email: 'owner@acme.test', contactName: 'Dana', archivedAt: null },
  project: { id: 'proj_1', name: 'Acme — Website' },
  refundedCents: 0,
  payments: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});

  requireStaff.mockResolvedValue({ userId: 'user_kiana', type: 'user', role: 'owner' });
  prisma.invoice.findUnique.mockResolvedValue(OPEN_INVOICE);
  prisma.invoice.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...OPEN_INVOICE,
    ...data,
  }));
  prisma.instalment.findUnique.mockResolvedValue(null);
  put.mockResolvedValue({ url: 'https://blob.test/BM-2026-0007.pdf' });
  paymentLinksCreate.mockResolvedValue({ url: 'https://pay.test/abc', id: 'plink_1' });
  vi.mocked(sendCustomChargeEmail).mockResolvedValue({ sent: true });
});

describe('sending an invoice again', () => {
  it('emails the client and counts the chase', async () => {
    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sentTo).toBe('owner@acme.test');
    expect(vi.mocked(sendCustomChargeEmail).mock.calls[0][0]).toMatchObject({
      toEmail: 'owner@acme.test',
      invoiceNumber: 'BM-2026-0007',
      paymentUrl: 'https://pay.test/abc',
    });

    const written = prisma.invoice.update.mock.calls[0][0].data;
    expect(written.sentToEmail).toBe('owner@acme.test');
    expect(written.sendCount).toEqual({ increment: 1 });
    expect(written.lastSentAt).toBeInstanceOf(Date);
  });

  /*
   * The charge route deliberately survives Stripe being unreachable, which
   * left invoices raised in that window with no way to be paid online, ever.
   * Pressing send is the retry — that is half the point of the button.
   */
  it('mints the missing payment link before sending', async () => {
    await call();

    expect(paymentLinksCreate).toHaveBeenCalledOnce();
    expect(paymentLinksCreate.mock.calls[0][0].metadata).toMatchObject({
      existingProjectId: 'proj_1',
      invoiceId: 'inv_1',
      paymentType: 'custom',
    });
    // A Payment Link collects every time it is opened unless restricted, and
    // this route is a fourth place one gets minted. See
    // tests/lib/payment-link-single-use.test.ts for the whole story.
    expect(paymentLinksCreate.mock.calls[0][0].restrictions).toEqual({
      completed_sessions: { limit: 1 },
    });
    expect(prisma.invoice.update.mock.calls[0][0].data.paymentUrl).toBe('https://pay.test/abc');
  });

  /*
   * A stored PDF is fetched, not rebuilt. The client may be holding the first
   * copy, and a second render at a second URL is two documents claiming to be
   * the same invoice.
   */
  it('does not re-render a PDF that is already filed', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      ...OPEN_INVOICE,
      pdfUrl: 'https://blob.test/existing.pdf',
      paymentUrl: 'https://pay.test/existing',
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(new Uint8Array([9, 9])) as never);

    await call();

    expect(fetchMock).toHaveBeenCalledWith('https://blob.test/existing.pdf');
    expect(buildCustomChargeInvoicePdf).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(paymentLinksCreate).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('rebuilds the PDF when the stored one cannot be fetched', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ ...OPEN_INVOICE, pdfUrl: 'https://blob.test/gone.pdf' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('404'));

    await call();

    expect(buildCustomChargeInvoicePdf).toHaveBeenCalledOnce();
    expect(vi.mocked(sendCustomChargeEmail).mock.calls[0][0].invoicePdf).toBeInstanceOf(Buffer);
    fetchMock.mockRestore();
  });

  /*
   * A failed send is not a chase. The counters answer "how many times have we
   * asked them for this money", and an attempt that never left the building
   * is not an ask — but a pay link minted on that attempt is still real and
   * still belongs on the client's dashboard.
   */
  it('keeps what it repaired but does not count a send that failed', async () => {
    vi.mocked(sendCustomChargeEmail).mockResolvedValue({ sent: false, reason: 'mailbox full' });

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toContain('mailbox full');

    const written = prisma.invoice.update.mock.calls[0][0].data;
    expect(written.paymentUrl).toBe('https://pay.test/abc');
    expect(written.sendCount).toBeUndefined();
    expect(written.lastSentAt).toBeUndefined();
  });

  it('warns rather than lying when Stripe still will not give a link', async () => {
    paymentLinksCreate.mockRejectedValue(new Error('Stripe down'));

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.warnings.join(' ')).toContain("can't pay it online");
  });
});

describe('what it refuses', () => {
  it('will not chase a paid invoice', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ ...OPEN_INVOICE, status: 'paid' });

    const res = await call();

    expect(res.status).toBe(409);
    expect(sendCustomChargeEmail).not.toHaveBeenCalled();
  });

  it('will not send a cancelled invoice', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ ...OPEN_INVOICE, status: 'void' });

    const res = await call();

    expect(res.status).toBe(409);
    expect(sendCustomChargeEmail).not.toHaveBeenCalled();
  });

  /*
   * The one that would have cost real money. An instalment is paid through a
   * Checkout Session held on the Instalment row; a payment link minted here
   * would be a second way to pay the same money that the schedule has never
   * heard of and would never mark settled.
   */
  it('sends nobody a second way to pay an instalment', async () => {
    prisma.instalment.findUnique.mockResolvedValue({ id: 'inst_1', label: 'On signing' });

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain('payment schedule');
    expect(paymentLinksCreate).not.toHaveBeenCalled();
    expect(sendCustomChargeEmail).not.toHaveBeenCalled();
  });

  /**
   * The one pointed at a client who has already paid some of it.
   *
   * A resend rebuilds the ORIGINAL demand — the invoice total in the PDF, the
   * invoice total in the email body, and a freshly minted fixed-amount
   * Payment Link if one is missing. Sent to somebody who transferred $600 of
   * $1,200 it asks for the whole $1,200 again and encloses a working way to
   * send it, on the one screen where "we have your money" is the thing the
   * client is checking.
   */
  it('will not re-demand an invoice money has already come in against', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      ...OPEN_INVOICE,
      payments: [{ amount: 60000 }],
    });

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain('$600');
    // Both halves matter: no email, and no new link minted on the way to not
    // sending one.
    expect(sendCustomChargeEmail).not.toHaveBeenCalled();
    expect(paymentLinksCreate).not.toHaveBeenCalled();
  });

  it('will not chase one we have refunded', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      ...OPEN_INVOICE,
      refundedCents: 60000,
      // What a refund leaves behind: the payment, and the row that took it back.
      payments: [{ amount: 60000 }, { amount: -60000 }],
    });

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain('refunded');
    expect(sendCustomChargeEmail).not.toHaveBeenCalled();
  });

  /* The ordinary case, held so the guard above cannot quietly widen. */
  it('still chases one nothing has come in against', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ ...OPEN_INVOICE, payments: [] });

    const res = await call();

    expect(res.status).toBe(200);
    expect(sendCustomChargeEmail).toHaveBeenCalled();
  });

  it('will not chase a decommissioned client', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      ...OPEN_INVOICE,
      client: { ...OPEN_INVOICE.client, archivedAt: new Date() },
    });

    const res = await call();

    expect(res.status).toBe(409);
    expect(sendCustomChargeEmail).not.toHaveBeenCalled();
  });

  /*
   * A row whose line items cannot be read cannot have a pay link built from
   * it. Stripe would be handed unit_amount: undefined and fail the whole
   * send; saying so is better than a 500 nobody can act on.
   */
  it('refuses a row it cannot rebuild', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ ...OPEN_INVOICE, lineItems: [{ label: '', priceCents: 0 }] });

    const res = await call();

    expect(res.status).toBe(409);
    expect(sendCustomChargeEmail).not.toHaveBeenCalled();
  });

  it('turns away anybody not signed in', async () => {
    requireStaff.mockResolvedValue(null);

    const res = await call();

    expect(res.status).toBe(401);
    expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
  });
});
