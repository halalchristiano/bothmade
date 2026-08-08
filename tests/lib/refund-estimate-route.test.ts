import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "If this ended today, what do they get back?"
 *
 * The arithmetic behind this is tested — refund-entitlement.test.ts covers
 * every clause of Section 8. The route that assembles it was not tested at
 * all: which form of the contract applies, what happens to the numbers a
 * caller types into the query string, and where the refundable money is
 * actually said to sit.
 *
 * That last one is the reason this file exists rather than being tidiness.
 * The entitlement is a fact about the project; a refund goes against one
 * invoice, so the pot has to be shared out before anybody can act on it — and
 * an invoice can now be part paid, which is a state the allocation was
 * written before.
 */

/*
 * The write methods are stubbed even though nothing should reach them —
 * that is the point. Asserting over the keys of a mock object only proves
 * what the mock was built with; asserting these were never CALLED is a fact
 * about the route.
 */
const prisma = {
  project: {
    findUnique: vi.fn(async (_a: unknown) => null as unknown),
    update: vi.fn(async (_a: unknown) => ({})),
  },
  lead: { findUnique: vi.fn(async (_a: unknown) => null as unknown) },
  invoice: {
    findMany: vi.fn(async (_a: unknown) => [] as unknown[]),
    create: vi.fn(async (_a: unknown) => ({})),
    update: vi.fn(async (_a: unknown) => ({})),
  },
  payment: { create: vi.fn(async (_a: unknown) => ({})) },
};

const requireStaff = vi.fn();
const requireRole = vi.fn(() => null as unknown);

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));
vi.mock('@/lib/authz', () => ({
  ANY_STAFF: ['owner', 'sales', 'admin'],
  requireRole: (...args: unknown[]) => requireRole(...(args as [])),
}));
vi.mock('@/lib/instalments', () => ({
  ensureInstalments: vi.fn(async () => [
    { index: 1, label: 'Payment 1 of 3', amountCents: 800_000, trigger: 'signing', status: 'paid' },
    { index: 2, label: 'Payment 2 of 3', amountCents: 600_000, trigger: 'design-approval', status: 'due' },
    { index: 3, label: 'Payment 3 of 3', amountCents: 600_000, trigger: 'ready-for-launch', status: 'scheduled' },
  ]),
}));

const { GET } = await import('@/app/api/admin/billing/refund-estimate/route');

function request(search: string) {
  return {
    url: `https://bothmade.test/api/admin/billing/refund-estimate${search}`,
  } as unknown as Parameters<typeof GET>[0];
}

const PROJECT = {
  id: 'proj_1',
  name: 'Acme — Website',
  status: 'design',
  statusStage: 1,
  totalPrice: 2_000_000,
  convertedFromLeadId: null,
  payments: [{ amount: 800_000, type: 'deposit' }],
  client: { company: 'Acme Dental' },
};

const PAID_INVOICE = {
  id: 'inv_1',
  number: 'BM-2026-0001',
  description: 'Payment 1 of 3',
  amountCents: 800_000,
  refundedCents: 0,
  status: 'paid',
  createdAt: new Date('2026-01-05T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  requireStaff.mockResolvedValue({ userId: 'user_kiana', type: 'user', role: 'owner' });
  requireRole.mockReturnValue(null);
  prisma.project.findUnique.mockResolvedValue(PROJECT);
  prisma.lead.findUnique.mockResolvedValue(null);
  prisma.invoice.findMany.mockResolvedValue([PAID_INVOICE]);
});

describe('who may ask', () => {
  it('turns away anybody not signed in', async () => {
    requireStaff.mockResolvedValue(null);

    const res = await GET(request('?projectId=proj_1'));

    expect(res.status).toBe(401);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it('defers to the role check rather than deciding for itself', async () => {
    requireRole.mockReturnValue(new Response('{}', { status: 403 }));

    const res = await GET(request('?projectId=proj_1'));

    expect(res.status).toBe(403);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });
});

describe('what it is asked about', () => {
  it('needs a project', async () => {
    const res = await GET(request(''));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Pick a customer');
  });

  it('says so when the project is gone', async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    const res = await GET(request('?projectId=missing'));

    expect(res.status).toBe(404);
  });

  /*
   * Section 8 has two forms and the consumer one is more generous. Which
   * applies lives on the Lead, because that is where the contract was
   * generated — and a project onboarded by hand has no lead, so the
   * contract's own default is the assumption.
   */
  it('reads the consumer form off the lead the contract came from', async () => {
    prisma.project.findUnique.mockResolvedValue({ ...PROJECT, convertedFromLeadId: 'lead_1' });
    prisma.lead.findUnique.mockResolvedValue({ isConsumer: true });

    const body = await (await GET(request('?projectId=proj_1'))).json();

    expect(body.consumer).toBe(true);
  });

  it('assumes the business form when there is no lead to ask', async () => {
    const body = await (await GET(request('?projectId=proj_1'))).json();

    expect(body.consumer).toBe(false);
    expect(prisma.lead.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to the client-cancels scenario rather than trusting the query string', async () => {
    const body = await (await GET(request('?projectId=proj_1&scenario=nonsense'))).json();

    expect(body.scenario).toBe('client-cancels');
  });

  it('takes the agency-ends scenario when it is a real one', async () => {
    const body = await (await GET(request('?projectId=proj_1&scenario=agency-ends'))).json();

    expect(body.scenario).toBe('agency-ends');
  });

  /*
   * Both of these arrive as text somebody typed. A negative fee would ADD to
   * a refund and a nonsense one would make the settlement claim the client
   * owes us a fortune, on the screen used to tell them what they are getting.
   */
  it('refuses to take nonsense hours or fees as numbers', async () => {
    const body = await (
      await GET(request('?projectId=proj_1&hours=-40&processorFee=lots'))
    ).json();

    expect(body.entitlement.timeEarnedCents).toBe(0);
    expect(body.entitlement.deductions.every((d: { amountCents: number }) => d.amountCents >= 0)).toBe(true);
  });

  it('caps the hours somebody can claim to have worked', async () => {
    const body = await (await GET(request('?projectId=proj_1&hours=999999'))).json();

    // 10,000 is the ceiling — five years of full-time on one website.
    expect(body.entitlement.timeEarnedCents).toBe(10_000 * body.agencyRateCents);
  });
});

describe('where the refundable money sits', () => {
  it('shares the pot across the paid invoices, oldest first', async () => {
    const body = await (await GET(request('?projectId=proj_1'))).json();

    const returned = body.entitlement.settlement.returnedToClientCents;
    const allocated = body.allocation.invoices.reduce(
      (sum: number, inv: { allocatedCents: number }) => sum + inv.allocatedCents,
      0
    );
    expect(allocated + body.allocation.unallocatedCents).toBe(returned);
  });

  /*
   * An open invoice was never paid, so there is nothing on it to give back —
   * except that an invoice can now be PART paid by transfer and stay open
   * with real money against it. That money is still owed to the client; it
   * just cannot go back through an invoice refund, and the route has to say
   * so rather than quietly leave it out of both halves.
   */
  it('does not pretend a part-paid invoice can carry a refund', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { ...PAID_INVOICE, id: 'inv_2', number: 'BM-2026-0002', status: 'open', amountCents: 300_000 },
    ]);

    const body = await (await GET(request('?projectId=proj_1'))).json();

    expect(body.allocation.invoices).toEqual([]);
    // Named as money with nowhere to go rather than rounded away.
    expect(body.allocation.unallocatedCents).toBe(
      body.entitlement.settlement.returnedToClientCents
    );
  });

  it('leaves nothing on an invoice already fully refunded', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { ...PAID_INVOICE, refundedCents: 800_000 },
    ]);

    const body = await (await GET(request('?projectId=proj_1'))).json();

    expect(body.allocation.invoices).toEqual([]);
  });
});

describe('a GET that changes nothing', () => {
  it('writes no invoice, payment or refund', async () => {
    await GET(request('?projectId=proj_1'));

    // The whole value is being able to check the number before committing to
    // it, so the only write it is allowed is the idempotent schedule seed —
    // which lives behind ensureInstalments and is mocked out above.
    expect(prisma.invoice.create).not.toHaveBeenCalled();
    expect(prisma.invoice.update).not.toHaveBeenCalled();
    expect(prisma.project.update).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
});
