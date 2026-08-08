import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What the client's own Pay button actually CHARGES.
 *
 * Sibling to pay-balance-route.test.ts, which lands the rules — only your own
 * project, no leapfrogging a gate, never two live checkouts — by mocking
 * liveCheckoutUrl out. That is the right shape for those questions and the
 * wrong one for this: with the mint mocked, nothing can see the amount. This
 * file drives the real liveCheckoutUrl against a stubbed Stripe so the number
 * on the checkout is what gets asserted.
 *
 * Three things were wrong, and the first is the expensive one.
 *
 * 1. It charged the instalment's FACE VALUE. An instalment stays `due` until
 *    its invoice is settled in full, which is right, because the rest is
 *    still owed. But money can reach a bill without closing it: a client who
 *    transferred half of a $12,000 payment leaves a `due` row for $12,000
 *    with $6,000 outstanding. Pressing Pay charged them $12,000 again — and
 *    this is the one mint site with nobody from the studio in the loop.
 *
 * 2. The legacy lump-balance path had no idempotency key and stores nothing,
 *    so nothing could expire what it minted. Every POST was another live
 *    checkout for the whole balance — the largest single amount anybody sends
 *    us — and a double-tap left two of them payable.
 *
 * 3. A session Stripe returns without a URL came back as `{ success: true,
 *    url: null }`, which is a redirect to nowhere on the one button whose
 *    only job is reaching a checkout.
 */

const prisma = {
  project: { findUnique: vi.fn(async (_a: unknown) => null as unknown) },
  instalment: { findMany: vi.fn(async (_a: unknown) => [] as unknown[]), update: vi.fn(async () => ({})) },
  invoice: { findUnique: vi.fn(async (_a: unknown) => null as unknown) },
};

const sessionsCreate = vi.fn(
  async (..._a: unknown[]) => ({ id: 'cs_new', url: 'https://stripe.test/cs_new' }) as unknown
);
const sessionsRetrieve = vi.fn(async (_id: string) => ({ status: 'open' }) as unknown);
const sessionsExpire = vi.fn(async (_id: string) => ({}) as unknown);

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/site-url', () => ({ resolveSiteUrl: () => 'https://bothmade.test' }));
vi.mock('@/lib/middleware', () => ({
  requireClient: async () => ({ session: { clientId: 'client_1' }, response: null }),
  forbiddenResponse: () => new Response('{}', { status: 403 }),
}));
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: sessionsCreate, retrieve: sessionsRetrieve, expire: sessionsExpire } };
  },
}));

const { POST } = await import('@/app/api/projects/[projectId]/pay-balance/route');

const PROJECT = {
  id: 'proj_1',
  name: 'Acme Site',
  clientId: 'client_1',
  totalPrice: 1_200_000,
  client: { email: 'client@acme.test' },
  payments: [],
};

const DUE = {
  id: 'inst_1',
  projectId: 'proj_1',
  index: 2,
  label: 'Payment 2 of 3',
  amountCents: 1_200_000,
  status: 'due',
  paymentUrl: null as string | null,
  stripeSessionId: null as string | null,
  invoiceNumber: 'BM-2026-0007',
};

const go = async () =>
  POST(new Request('https://bothmade.test/x', { method: 'POST' }) as never, {
    params: Promise.resolve({ projectId: 'proj_1' }),
  });

/** What the minted Stripe session would have charged. */
const charged = (call = 0): number =>
  (sessionsCreate.mock.calls[call]![0] as {
    line_items: Array<{ price_data: { unit_amount: number } }>;
  }).line_items[0].price_data.unit_amount;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  prisma.project.findUnique.mockResolvedValue(PROJECT);
  prisma.instalment.findMany.mockResolvedValue([DUE]);
  prisma.invoice.findUnique.mockResolvedValue({ id: 'invoice_1', status: 'open', payments: [] });
  sessionsCreate.mockResolvedValue({ id: 'cs_new', url: 'https://stripe.test/cs_new' });
  sessionsRetrieve.mockResolvedValue({ status: 'open' });
});

describe('a client paying an instalment they have part paid', () => {
  const halfPaid = () =>
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice_1',
      status: 'open',
      payments: [{ amount: 600_000 }],
    });

  /** The one that takes money that was never owed. */
  it('charges the balance, not the face value', async () => {
    halfPaid();

    const res = await go();

    expect(res.status).toBe(201);
    expect(charged()).toBe(600_000);
  });

  it('calls the line a balance, so the checkout page agrees', async () => {
    halfPaid();

    await go();

    const name = (sessionsCreate.mock.calls[0]![0] as {
      line_items: Array<{ price_data: { product_data: { name: string } } }>;
    }).line_items[0].price_data.product_data.name;
    expect(name).toContain('balance');
  });

  /**
   * The stored link was minted for the face value, so once part of it has
   * been paid that session asks for more than is owed. Reusing it is the same
   * overcharge arriving by a slower route.
   */
  it('will not hand back the cached full-price link', async () => {
    halfPaid();
    prisma.instalment.findMany.mockResolvedValue([
      { ...DUE, paymentUrl: 'https://stripe.test/cs_old', stripeSessionId: 'cs_old' },
    ]);

    const res = await go();

    expect(await res.json()).toMatchObject({ url: 'https://stripe.test/cs_new' });
    expect(charged()).toBe(600_000);
  });

  it('refuses when the whole instalment has already arrived', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice_1',
      status: 'open',
      payments: [{ amount: 1_200_000 }],
    });

    const res = await go();

    expect(res.status).toBe(400);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  /**
   * A refund is a negative row against the same invoice. Money that came in
   * and went back out is not money we are holding, so it becomes owed again —
   * which summing the ledger gives for free.
   */
  it('counts a refunded part payment back as owed', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice_1',
      status: 'open',
      payments: [{ amount: 600_000 }, { amount: -600_000 }],
    });

    await go();

    expect(charged()).toBe(1_200_000);
  });
});

describe('a client paying an instalment nothing has been paid toward', () => {
  it('charges the whole thing, and reuses a live link rather than minting a rival', async () => {
    prisma.instalment.findMany.mockResolvedValue([
      { ...DUE, paymentUrl: 'https://stripe.test/cs_old', stripeSessionId: 'cs_old' },
    ]);

    const res = await go();

    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ url: 'https://stripe.test/cs_old' });
  });

  it('mints for the full amount when the stored session has died', async () => {
    sessionsRetrieve.mockResolvedValue({ status: 'expired' });
    prisma.instalment.findMany.mockResolvedValue([
      { ...DUE, paymentUrl: 'https://stripe.test/cs_old', stripeSessionId: 'cs_old' },
    ]);

    await go();

    expect(charged()).toBe(1_200_000);
  });
});

describe('a client whose schedule has nothing payable on it', () => {
  it('explains that the next payment is not invoiced yet', async () => {
    prisma.instalment.findMany.mockResolvedValue([{ ...DUE, status: 'scheduled' }]);

    const res = await go();

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Payment 2 of 3');
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});

/**
 * Projects raised before the instalment schedule existed still pay as one
 * lump. It is the least-travelled path and the one holding the biggest number.
 */
describe('the legacy lump-balance path', () => {
  beforeEach(() => {
    prisma.instalment.findMany.mockResolvedValue([]);
    prisma.project.findUnique.mockResolvedValue({
      ...PROJECT,
      payments: [{ amount: 300_000, type: 'deposit' }],
    });
  });

  it('charges what is left against the contracted price', async () => {
    await go();
    expect(charged()).toBe(900_000);
  });

  /** Two taps used to leave two live checkouts for the whole balance. */
  it('asks Stripe for the same session both times', async () => {
    await go();
    await go();

    expect(sessionsCreate).toHaveBeenCalledTimes(2);
    const first = sessionsCreate.mock.calls[0]![1] as { idempotencyKey?: string } | undefined;
    const second = sessionsCreate.mock.calls[1]![1] as { idempotencyKey?: string } | undefined;

    expect(first?.idempotencyKey, 'no idempotency key — Stripe will mint a second live checkout')
      .toBeTruthy();
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey);
    expect(first?.idempotencyKey).toMatch(/proj_1/);
    expect(first?.idempotencyKey).toMatch(/900000/);
  });

  it('treats a session with no URL as a failure, not a success', async () => {
    sessionsCreate.mockResolvedValue({ id: 'cs_new', url: null });

    const res = await go();

    expect(res.status).toBe(502);
    expect(await res.json()).not.toMatchObject({ success: true });
  });

  it('refuses when the project is already paid off', async () => {
    prisma.project.findUnique.mockResolvedValue({
      ...PROJECT,
      payments: [{ amount: 1_200_000, type: 'balance' }],
    });

    const res = await go();

    expect(res.status).toBe(400);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});

describe('somebody else\'s project', () => {
  it('is refused, whatever the id in the URL says', async () => {
    prisma.project.findUnique.mockResolvedValue({ ...PROJECT, clientId: 'client_2' });

    const res = await go();

    expect(res.status).toBe(403);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});
