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
vi.mock('@/lib/site-url', () => ({ resolveSiteUrl: () => 'https://bothmade.test' }));
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
  /*
   * statusStage 2 — Build, which is to say the design has been approved.
   *
   * It was absent, and the project sat at 'design' while the tests below sent
   * Payment 2, whose trigger is design approval. That is the send the
   * agreement does not allow yet, and four of these cases asserted it worked:
   * the fixture described a project that could not legitimately be billed and
   * the route agreed with it, because the route never consulted the gate.
   *
   * A project being asked for Payment 2 is a project whose design is signed
   * off. That is what this now says.
   */
  prisma.project.findUnique.mockResolvedValue({
    id: 'proj_1',
    clientId: 'client_1',
    name: 'Northgate — Custom Website',
    totalPrice: 2000000,
    status: 'build',
    statusStage: 2,
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
      statusStage: 2,
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

  /**
   * The panel offers "Copy link" on every due payment — the natural thing to
   * reach for when chasing somebody by hand. It was copying `paymentUrl`, the
   * Stripe Checkout Session itself, which dies 24 hours after it was minted.
   * So whatever ops pasted into a message worked that day and was a Stripe
   * error page the next.
   */
  it('carries a durable link to hand to a client, beside the perishable one', async () => {
    const res = await GET({} as Parameters<typeof GET>[0], {
      params: Promise.resolve({ projectId: 'proj_1' }),
    });
    const data = await res.json();

    const rows = data.instalments as Array<{ id: string; payUrl: string }>;
    for (const row of rows) {
      expect(row.payUrl).toBe(`https://bothmade.test/pay/${row.id}`);
    }
  });

  it('gives an absolute link, because it is going into another inbox', async () => {
    const res = await GET({} as Parameters<typeof GET>[0], {
      params: Promise.resolve({ projectId: 'proj_1' }),
    });
    const data = await res.json();

    expect((data.instalments as Array<{ payUrl: string }>)[0].payUrl.startsWith('https://')).toBe(true);
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


/**
 * The gate the agreement writes, which the send path never asked about.
 *
 * Every instalment carries a trigger — "on signing", "on design approval",
 * "when ready for launch" — and the project's stage records whether that
 * moment arrived. gateReached() has been in lib/billing.ts the whole time,
 * and the ops list uses it to surface money sitting past its gate. The one
 * path that actually invoices a client did not consult it, so Payment 3
 * could be sent, with "When ready to launch" printed on the PDF, at a
 * project still in Design.
 *
 * Refused rather than blocked outright: an early payment is occasionally
 * agreed, and the route takes it on a second, explicit press.
 */
describe('the trigger each payment is for', () => {
  it('refuses Payment 2 while the design is not approved', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'proj_1',
      clientId: 'client_1',
      name: 'Northgate — Custom Website',
      totalPrice: 2000000,
      status: 'design',
      statusStage: 1,
      client: { id: 'client_1', email: 'priya@northgate.com', company: 'Northgate', contactName: 'Priya' },
    });

    const res = await call({ index: 2 });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.gateNotReached).toBe(true);
    // The sentence names both halves: what it is for, and where they are.
    expect(data.error).toMatch(/design approval/i);
    expect(data.error).toMatch(/Design/);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('refuses Payment 3 at a project that is nowhere near launch', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'proj_1',
      clientId: 'client_1',
      name: 'Northgate — Custom Website',
      totalPrice: 2000000,
      status: 'build',
      statusStage: 2,
      client: { id: 'client_1', email: 'priya@northgate.com', company: 'Northgate', contactName: 'Priya' },
    });
    prisma.instalment.findMany.mockResolvedValue(
      structuredClone(SCHEDULE).map((i: { index: number; status: string }) =>
        i.index === 2 ? { ...i, status: 'paid' } : i
      )
    );

    const res = await call({ index: 3 });

    expect(res.status).toBe(409);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('sends it anyway on a second, explicit press', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'proj_1',
      clientId: 'client_1',
      name: 'Northgate — Custom Website',
      totalPrice: 2000000,
      status: 'design',
      statusStage: 1,
      client: { id: 'client_1', email: 'priya@northgate.com', company: 'Northgate', contactName: 'Priya' },
    });

    const res = await call({ index: 2, acknowledgeGate: true });

    // An agreed early payment has to remain possible; it just cannot happen
    // on the same press that sends a routine one.
    expect(res.status).toBe(200);
    expect(prisma.invoice.create).toHaveBeenCalled();
  });

  /**
   * The gate reads the record, not just the dropdown.
   *
   * Confirming a project Ready for Launch on the launch board IS the moment
   * Section 1 defines, and Section 7 makes it what Payment 3 is due on. It
   * stamps readyForLaunchAt and tells the client the final invoice follows.
   * Moving the stage is a separate, later act that emails them again — so
   * requiring it here made the studio confirm readiness, promise the invoice,
   * and then be refused by the only route that can send it.
   */
  it('sends Payment 3 once the launch is confirmed in writing, whatever the stage says', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'proj_1',
      clientId: 'client_1',
      name: 'Northgate — Custom Website',
      totalPrice: 2000000,
      status: 'build',
      statusStage: 2,
      readyForLaunchAt: new Date('2026-08-01T09:00:00.000Z'),
      client: { id: 'client_1', email: 'priya@northgate.com', company: 'Northgate', contactName: 'Priya' },
    });
    prisma.instalment.findMany.mockResolvedValue(
      structuredClone(SCHEDULE).map((i: { index: number; status: string }) =>
        i.index === 2 ? { ...i, status: 'paid' } : i
      )
    );

    const res = await call({ index: 3 });

    expect(res.status).toBe(200);
    expect(prisma.invoice.create).toHaveBeenCalled();
  });

  it('sends Payment 2 once the design approval is on the record', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'proj_1',
      clientId: 'client_1',
      name: 'Northgate — Custom Website',
      totalPrice: 2000000,
      // Still in Design: a review period that lapsed under Section 4 approves
      // the design without anybody moving a dropdown on the client's behalf.
      status: 'design',
      statusStage: 1,
      designApprovedAt: new Date('2026-08-01T09:00:00.000Z'),
      client: { id: 'client_1', email: 'priya@northgate.com', company: 'Northgate', contactName: 'Priya' },
    });

    const res = await call({ index: 2 });

    expect(res.status).toBe(200);
  });

  it('never stands in the way of the signing payment', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'proj_1',
      clientId: 'client_1',
      name: 'Northgate — Custom Website',
      totalPrice: 2000000,
      status: 'discovery',
      statusStage: 0,
      client: { id: 'client_1', email: 'priya@northgate.com', company: 'Northgate', contactName: 'Priya' },
    });
    prisma.instalment.findMany.mockResolvedValue(
      structuredClone(SCHEDULE).map((i: { index: number; status: string }) =>
        i.index === 1 ? { ...i, status: 'scheduled', stripeSessionId: null } : i
      )
    );

    // "On signing" is true the moment the project exists — a gate that
    // stopped Payment 1 would stop every project from starting.
    const res = await call({ index: 1 });

    expect(res.status).toBe(200);
  });
});
