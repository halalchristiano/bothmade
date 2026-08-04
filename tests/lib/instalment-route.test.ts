import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Sending an instalment is the action that asks a client for real money, so
 * the pinned failures are the quiet ones: sending Payment 3 while Payment 2
 * is unpaid (two invoices racing), a re-send minting a second invoice number
 * for the same payment, a stale checkout link left alive to double-collect,
 * and an email failure being reported as success.
 */

const prisma = {
  project: { findUnique: vi.fn() },
  $transaction: vi.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
  instalment: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(async () => ({})) },
  invoice: { count: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
  projectUpdate: { create: vi.fn() },
};

const requireStaff = vi.fn();
const sessionsCreate = vi.fn();
const sessionsExpire = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));
vi.mock('stripe', () => ({
  default: class {
    checkout = {
      sessions: {
        create: (...args: unknown[]) => sessionsCreate(...args),
        expire: (...args: unknown[]) => sessionsExpire(...args),
      },
    };
  },
}));
vi.mock('@/lib/invoice-pdf', () => ({
  buildInstalmentInvoicePdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));
vi.mock('@/lib/email', () => ({
  sendInstalmentEmail: vi.fn(async () => ({ sent: true })),
}));

const { POST, GET } = await import('@/app/api/admin/projects/[projectId]/instalments/route');
const { sendInstalmentEmail } = await import('@/lib/email');

function call(body: unknown) {
  return POST(
    { json: async () => body } as unknown as Parameters<typeof POST>[0],
    { params: Promise.resolve({ projectId: 'proj_1' }) }
  );
}

const SCHEDULE: any[] = [
  { id: 'i1', projectId: 'proj_1', index: 1, count: 3, label: 'Payment 1 of 3', percent: 40, amountCents: 800000, trigger: 'signing', status: 'paid', invoiceNumber: null, stripeSessionId: 'cs_signing', paymentUrl: null, invoicedAt: null, dueAt: null, paidAt: new Date(), emailSentAt: null },
  { id: 'i2', projectId: 'proj_1', index: 2, count: 3, label: 'Payment 2 of 3', percent: 30, amountCents: 600000, trigger: 'design-approval', status: 'scheduled', invoiceNumber: null, stripeSessionId: null, paymentUrl: null, invoicedAt: null, dueAt: null, paidAt: null, emailSentAt: null },
  { id: 'i3', projectId: 'proj_1', index: 3, count: 3, label: 'Payment 3 of 3', percent: 30, amountCents: 600000, trigger: 'ready-for-launch', status: 'scheduled', invoiceNumber: null, stripeSessionId: null, paymentUrl: null, invoicedAt: null, dueAt: null, paidAt: null, emailSentAt: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});

  requireStaff.mockResolvedValue({ userId: 'user_evan', type: 'user', role: 'sales' });
  prisma.project.findUnique.mockResolvedValue({
    id: 'proj_1',
    clientId: 'client_1',
    name: 'Northgate — Custom Website',
    totalPrice: 2000000,
    status: 'design',
    client: { id: 'client_1', email: 'priya@northgate.com', company: 'Northgate', contactName: 'Priya' },
  });
  prisma.instalment.findMany.mockResolvedValue(structuredClone(SCHEDULE));
  prisma.instalment.update.mockResolvedValue({});
  prisma.instalment.updateMany.mockResolvedValue({ count: 1 });
  prisma.invoice.count.mockResolvedValue(6);
  prisma.invoice.findUnique.mockResolvedValue(null);
  prisma.invoice.create.mockImplementation(async ({ data }: any) => ({ id: 'inv_1', ...data }));
  prisma.projectUpdate.create.mockResolvedValue({});
  sessionsCreate.mockResolvedValue({ id: 'cs_new', url: 'https://checkout.stripe.com/pay/cs_new' });
  sessionsExpire.mockResolvedValue({});
});

describe('sending an instalment', () => {
  it('sends the next due instalment with a sequential invoice number and the instalment id in metadata', async () => {
    const res = await call({ index: 2 });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.instalment.invoiceNumber).toMatch(/^BM-\d{4}-0007$/);
    const sessionArgs = sessionsCreate.mock.calls[0][0];
    expect(sessionArgs.metadata.instalmentId).toBe('i2');
    expect(sessionArgs.metadata.paymentType).toBe('balance');
    expect(sessionArgs.line_items[0].price_data.unit_amount).toBe(600000);
    expect(sendInstalmentEmail).toHaveBeenCalledOnce();
  });

  it('refuses to send Payment 3 while Payment 2 is unpaid — two open invoices race each other', async () => {
    const res = await call({ index: 3 });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Payment 2 of 3');
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('refuses to re-bill a paid instalment', async () => {
    const res = await call({ index: 1 });

    expect(res.status).toBe(400);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('reuses the invoice identity on a re-send instead of minting a second number', async () => {
    const schedule = structuredClone(SCHEDULE);
    schedule[1] = { ...schedule[1], status: 'due', invoiceNumber: 'BM-2026-0004', stripeSessionId: 'cs_old' };
    prisma.instalment.findMany.mockResolvedValue(schedule);
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv_existing',
      number: 'BM-2026-0004',
      projectId: 'proj_1',
      amountCents: 600000,
    });

    const res = await call({ index: 2 });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.instalment.invoiceNumber).toBe('BM-2026-0004');
    expect(prisma.invoice.create).not.toHaveBeenCalled();
    // The old checkout dies before the new one is minted — that stale link
    // was the double-collection window.
    expect(sessionsExpire).toHaveBeenCalledWith('cs_old');
  });

  it('reports an email failure instead of dressing it as success', async () => {
    vi.mocked(sendInstalmentEmail).mockResolvedValueOnce({ sent: false, reason: 'Mailbox rejected it' });

    const res = await call({ index: 2 });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.emailSent).toBe(false);
    expect(data.emailReason).toBe('Mailbox rejected it');
    // The payment link still exists — a failed email is recoverable by hand.
    expect(data.instalment.paymentUrl).toContain('checkout.stripe.com');
  });

  /**
   * A project with no rows used to be told to use the balance flow. That flow
   * is exactly what a schedule stands down, so the answer now is to give it
   * the schedule it should have had — and only refuse when there is genuinely
   * nothing to bill.
   */
  it('refuses only when there is no price to build a schedule from', async () => {
    prisma.instalment.findMany.mockResolvedValue([]);
    prisma.project.findUnique.mockResolvedValue({
      id: 'proj_1',
      clientId: 'client_1',
      name: 'Northgate — Custom Website',
      totalPrice: 0,
      status: 'design',
      client: { id: 'client_1', email: 'ops@northgate.test', company: 'Northgate', contactName: 'Priya' },
      payments: [],
    });

    const res = await call({ index: 2 });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('no price');
  });

  it('locks the door to unauthenticated callers', async () => {
    requireStaff.mockResolvedValue(null);

    const res = await call({ index: 2 });

    expect(res.status).toBe(401);
  });
});

describe('listing the schedule', () => {
  it('returns the rows in order for any staff session', async () => {
    const res = await GET({} as Parameters<typeof GET>[0], {
      params: Promise.resolve({ projectId: 'proj_1' }),
    });
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.instalments.map((i: { index: number }) => i.index)).toEqual([1, 2, 3]);
  });
});


describe('the hardened claims', () => {
  it('409s when someone else is sending the same instalment concurrently', async () => {
    prisma.instalment.updateMany.mockResolvedValue({ count: 0 });

    const res = await call({ index: 2 });

    expect(res.status).toBe(409);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("mints a fresh number when the stored invoice turns out to be another project's", async () => {
    const schedule = structuredClone(SCHEDULE);
    schedule[1] = { ...schedule[1], status: 'due', invoiceNumber: 'BM-2026-0004' };
    prisma.instalment.findMany.mockResolvedValue(schedule);
    // Same number, different project: the reuse must be refused.
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv_foreign',
      number: 'BM-2026-0004',
      projectId: 'someone_elses_project',
      amountCents: 600000,
    });

    const res = await call({ index: 2 });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.instalment.invoiceNumber).not.toBe('BM-2026-0004');
    expect(prisma.invoice.create).toHaveBeenCalledOnce();
  });
});
