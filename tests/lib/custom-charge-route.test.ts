import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Raising a custom charge is the one action here that takes money from a real
 * customer, so what's pinned is the set of ways it could go wrong quietly:
 * a charge with no record behind it, a record with no invoice, a client
 * billed twice because a button was clicked twice, and info@ not getting its
 * copy because the client's send failed.
 */

const prisma = {
  project: { findUnique: vi.fn() },
  invoice: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  user: { findUnique: vi.fn() },
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
  sendInvoiceRecordEmail: vi.fn(async () => true),
}));

const { POST } = await import('@/app/api/admin/billing/charges/route');
const { sendCustomChargeEmail, sendInvoiceRecordEmail } = await import('@/lib/email');
const { buildCustomChargeInvoicePdf } = await import('@/lib/invoice-pdf');

function request(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

const CHARGE = {
  projectId: 'proj_1',
  description: 'Second round of homepage design',
  lineItems: [{ label: 'Design round', priceCents: 120000 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  requireStaff.mockResolvedValue({ userId: 'user_evan', type: 'user', role: 'sales' });
  prisma.project.findUnique.mockResolvedValue({
    id: 'proj_1',
    clientId: 'client_1',
    name: 'Acme — Website',
    client: {
      id: 'client_1',
      company: 'Acme Dental',
      contactName: 'Priya Raman',
      email: 'priya@acme.test',
      archivedAt: null,
    },
  });
  prisma.invoice.findFirst.mockResolvedValue(null);
  prisma.invoice.count.mockResolvedValue(6);
  prisma.invoice.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'inv_1',
    createdAt: new Date('2026-08-04T10:00:00Z'),
    ...data,
  }));
  prisma.invoice.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'inv_1',
    number: 'BM-2026-0007',
    amountCents: 120000,
    ...data,
  }));
  prisma.user.findUnique.mockResolvedValue({ name: 'Evan', email: 'evan@bothmade.studio' });
  put.mockResolvedValue({ url: 'https://blob.test/invoices/custom/inv_1-abc.pdf' });
  paymentLinksCreate.mockResolvedValue({ id: 'plink_1', url: 'https://pay.stripe.test/plink_1' });
});

describe('authorisation', () => {
  it('refuses anyone who is not staff', async () => {
    requireStaff.mockResolvedValue(null);

    const res = await POST(request(CHARGE));

    expect(res.status).toBe(401);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  /**
   * Sales is deliberately allowed here while it is denied the client and
   * project routes — billing a customer for extra work is Evan's job, and
   * this is the whole reason the feature exists.
   */
  it('lets a sales account raise a charge', async () => {
    const res = await POST(request(CHARGE));
    expect(res.status).toBe(201);
  });
});

describe('raising the charge', () => {
  it('records the invoice, stores the PDF, and creates a payable link', async () => {
    const res = await POST(request(CHARGE));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.warnings).toEqual([]);

    expect(prisma.invoice.create.mock.calls[0][0].data).toMatchObject({
      number: 'BM-2026-0007', // six already this year, so this is the seventh
      clientId: 'client_1',
      projectId: 'proj_1',
      amountCents: 120000,
      status: 'open',
      issuedById: 'user_evan',
    });

    expect(buildCustomChargeInvoicePdf).toHaveBeenCalledOnce();
    // A guessable blob path is a directory listing of who was charged what.
    expect(put.mock.calls[0][2]).toMatchObject({ access: 'public', addRandomSuffix: true });

    expect(prisma.invoice.update.mock.calls[0][0].data).toMatchObject({
      pdfUrl: 'https://blob.test/invoices/custom/inv_1-abc.pdf',
      paymentUrl: 'https://pay.stripe.test/plink_1',
      stripePaymentLinkId: 'plink_1',
      sentToEmail: 'priya@acme.test',
    });
  });

  it('carries the invoice on the Stripe metadata so the webhook can settle it', async () => {
    await POST(request(CHARGE));

    expect(paymentLinksCreate.mock.calls[0][0].metadata).toMatchObject({
      existingProjectId: 'proj_1',
      invoiceId: 'inv_1',
      paymentType: 'custom',
    });
  });

  it('emails the client and copies info@, both with the PDF attached', async () => {
    await POST(request(CHARGE));

    const clientCall = vi.mocked(sendCustomChargeEmail).mock.calls[0][0];
    expect(clientCall.toEmail).toBe('priya@acme.test');
    expect(clientCall.invoicePdf).toBeInstanceOf(Buffer);
    expect(clientCall.paymentUrl).toBe('https://pay.stripe.test/plink_1');

    const recordCall = vi.mocked(sendInvoiceRecordEmail).mock.calls[0][0];
    expect(recordCall.invoiceNumber).toBe('BM-2026-0007');
    expect(recordCall.invoicePdf).toBeInstanceOf(Buffer);
    expect(recordCall.clientDelivered).toBe(true);
  });

  it('still files the studio copy when the client send fails', async () => {
    vi.mocked(sendCustomChargeEmail).mockResolvedValue({ sent: false, reason: 'mailbox full' });

    const body = await (await POST(request(CHARGE))).json();

    expect(sendInvoiceRecordEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendInvoiceRecordEmail).mock.calls[0][0].clientDelivered).toBe(false);
    expect(body.warnings.join(' ')).toMatch(/mailbox full/);
  });

  it('raises it for the record only when the client copy is switched off', async () => {
    await POST(request({ ...CHARGE, sendToClient: false }));

    expect(sendCustomChargeEmail).not.toHaveBeenCalled();
    expect(sendInvoiceRecordEmail).toHaveBeenCalledOnce();
    expect(prisma.invoice.update.mock.calls[0][0].data.sentToEmail).toBeNull();
  });
});

describe('when half of it fails', () => {
  it('still emails a PDF it could not file, and flags the missing link', async () => {
    put.mockRejectedValue(new Error('blob down'));

    const res = await POST(request(CHARGE));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(prisma.invoice.create).toHaveBeenCalledOnce();
    expect(prisma.invoice.update.mock.calls[0][0].data.pdfUrl).toBeNull();
    // It rendered — the client and info@ get it as an attachment. Only the
    // dashboard link is missing, and that is what the warning has to say.
    expect(vi.mocked(sendCustomChargeEmail).mock.calls[0][0].invoicePdf).toBeInstanceOf(Buffer);
    expect(body.warnings.join(' ')).toMatch(/no PDF link/i);
  });

  it('tells the client without claiming an attachment when the PDF cannot be rendered', async () => {
    vi.mocked(buildCustomChargeInvoicePdf).mockRejectedValue(new Error('pdf-lib blew up'));

    const res = await POST(request(CHARGE));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(vi.mocked(sendCustomChargeEmail).mock.calls[0][0].invoicePdf).toBeNull();
    expect(body.warnings.join(' ')).toMatch(/couldn't be generated/i);
  });

  it('keeps the charge when Stripe will not make a link, and says so', async () => {
    paymentLinksCreate.mockRejectedValue(new Error('stripe down'));

    const body = await (await POST(request(CHARGE))).json();

    expect(prisma.invoice.update.mock.calls[0][0].data.paymentUrl).toBeNull();
    expect(body.warnings.join(' ')).toMatch(/pay this online/i);
  });

  it('gives up rather than issuing an unnumbered invoice', async () => {
    prisma.invoice.create.mockRejectedValue(Object.assign(new Error('taken'), { code: 'P2002' }));

    const res = await POST(request(CHARGE));

    expect(res.status).toBe(500);
    expect(paymentLinksCreate).not.toHaveBeenCalled();
    expect(sendCustomChargeEmail).not.toHaveBeenCalled();
  });

  it('retries a taken number instead of failing the charge', async () => {
    prisma.invoice.create
      .mockRejectedValueOnce(Object.assign(new Error('taken'), { code: 'P2002' }))
      .mockResolvedValueOnce({ id: 'inv_1', number: 'BM-2026-0008', createdAt: new Date() });

    const res = await POST(request(CHARGE));

    expect(res.status).toBe(201);
    expect(prisma.invoice.create).toHaveBeenCalledTimes(2);
  });
});

describe('guards', () => {
  it('refuses a second identical charge inside the double-click window', async () => {
    prisma.invoice.findFirst.mockResolvedValue({ number: 'BM-2026-0007' });

    const res = await POST(request(CHARGE));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.needsConfirmation).toBe(true);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('bills twice when that is genuinely what was meant', async () => {
    prisma.invoice.findFirst.mockResolvedValue({ number: 'BM-2026-0007' });

    const res = await POST(request({ ...CHARGE, confirmDuplicate: true }));

    expect(res.status).toBe(201);
    expect(prisma.invoice.create).toHaveBeenCalledOnce();
  });

  /*
   * The ordinary way a charge gets typed twice inside two minutes is that the
   * first one was wrong: raise it, spot the figure, cancel it, type it again.
   * A cancelled invoice has a dead pay link and a client who has been told to
   * ignore it, so it is not a twin of anything — and warning about it taught
   * whoever was doing the right thing to click through the warning.
   */
  it('does not treat a cancelled invoice as a duplicate', async () => {
    await POST(request(CHARGE));

    const where = prisma.invoice.findFirst.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: 'void' });
  });

  it('refuses to bill a decommissioned client', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'proj_1',
      clientId: 'client_1',
      name: 'Acme — Website',
      client: { id: 'client_1', company: 'Acme Dental', contactName: null, email: 'a@b.test', archivedAt: new Date() },
    });

    const res = await POST(request(CHARGE));

    expect(res.status).toBe(400);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('rejects a charge with no customer, no description, or no lines', async () => {
    expect((await POST(request({ ...CHARGE, projectId: '' }))).status).toBe(400);
    expect((await POST(request({ ...CHARGE, description: '' }))).status).toBe(400);
    expect((await POST(request({ ...CHARGE, lineItems: [] }))).status).toBe(400);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('404s on a project that no longer exists rather than inventing one', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    expect((await POST(request(CHARGE))).status).toBe(404);
  });
});
