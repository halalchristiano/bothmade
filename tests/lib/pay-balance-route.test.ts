import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A client opening a Stripe checkout against their own project.
 *
 * Money, started from a client session rather than a staff one, and covered
 * by nothing. Three rules matter here and each fails expensively:
 *
 *   1. Only your own project. The cross-tenant check is the whole security
 *      boundary — past it, one client can open a payment session naming
 *      another client's project and email address.
 *   2. No leapfrogging a gate. On the instalment schedule only the invoiced
 *      instalment is payable; a `scheduled` one has not fallen due, and
 *      letting somebody pay for work whose milestone has not been reached is
 *      how a schedule stops meaning anything.
 *   3. Never two live checkouts for one payment. A stored Stripe URL is
 *      reused only while Stripe still honours it, and minting a second
 *      session for an instalment that already has a live one is the case
 *      that ends with a client charged twice.
 */

const projectFindUnique = vi.fn();
const instalmentFindMany = vi.fn();
const instalmentUpdate = vi.fn();
const invoiceFindUnique = vi.fn();
const liveCheckoutUrl = vi.fn();
const sessionsCreate = vi.fn();
let principal: { session: unknown; response: unknown };

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: { findUnique: (...a: unknown[]) => projectFindUnique(...a) },
    instalment: {
      findMany: (...a: unknown[]) => instalmentFindMany(...a),
      update: (...a: unknown[]) => instalmentUpdate(...a),
    },
    invoice: { findUnique: (...a: unknown[]) => invoiceFindUnique(...a) },
  },
}));
vi.mock('@/lib/middleware', () => ({
  requireClient: async () => principal,
  forbiddenResponse: () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
}));
vi.mock('@/lib/instalment-checkout', () => ({
  liveCheckoutUrl: (...a: unknown[]) => liveCheckoutUrl(...a),
}));
vi.mock('@/lib/site-url', () => ({ resolveSiteUrl: () => 'https://bothmade.studio' }));
vi.mock('@/lib/billing', () => ({ amountPaidTowardProject: (p: Array<{ amount: number }>) =>
  p.reduce((s, x) => s + x.amount, 0) }));
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: (...a: unknown[]) => sessionsCreate(...a) } };
  },
}));

const { POST } = await import('@/app/api/projects/[projectId]/pay-balance/route');

const PROJECT = {
  id: 'proj_1',
  name: 'Linpotia Dental — Site & Booking',
  clientId: 'client_1',
  totalPrice: 850000,
  client: { email: 'sam@linpotia.test' },
  payments: [],
};

const call = () =>
  POST({} as Parameters<typeof POST>[0], { params: Promise.resolve({ projectId: 'proj_1' }) });

beforeEach(() => {
  principal = { session: { type: 'client', clientId: 'client_1' }, response: null };
  projectFindUnique.mockReset().mockResolvedValue(PROJECT);
  instalmentFindMany.mockReset().mockResolvedValue([]);
  instalmentUpdate.mockReset().mockResolvedValue({});
  invoiceFindUnique.mockReset().mockResolvedValue(null);
  liveCheckoutUrl.mockReset();
  sessionsCreate.mockReset().mockResolvedValue({ url: 'https://stripe.test/legacy' });
});

describe('somebody else’s project', () => {
  it('is refused', async () => {
    principal = { session: { type: 'client', clientId: 'someone_else' }, response: null };

    expect((await call()).status).toBe(403);
  });

  it('opens no checkout on the way out', async () => {
    principal = { session: { type: 'client', clientId: 'someone_else' }, response: null };

    await call();

    // The boundary is worthless if a session is minted before it is checked —
    // that session would carry another client's project and email.
    expect(liveCheckoutUrl).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('404s a project that does not exist', async () => {
    projectFindUnique.mockResolvedValue(null);

    expect((await call()).status).toBe(404);
  });
});

describe('the instalment schedule', () => {
  it('will not let a client pay for a milestone that has not fallen due', async () => {
    instalmentFindMany.mockResolvedValue([
      { id: 'i1', index: 0, status: 'paid', label: 'Deposit' },
      { id: 'i2', index: 1, status: 'scheduled', label: 'On design approval' },
    ]);

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(400);
    // And says why, naming the instalment — "no" without a reason on a
    // payment screen reads as the site being broken.
    expect(body.error).toContain('On design approval');
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('says plainly when nothing is owed at all', async () => {
    instalmentFindMany.mockResolvedValue([{ id: 'i1', index: 0, status: 'paid', label: 'Deposit' }]);

    const body = await (await call()).json();

    expect(body.error).toMatch(/nothing is currently owed/i);
  });

  it('reuses a live link rather than minting a second checkout for one payment', async () => {
    instalmentFindMany.mockResolvedValue([
      { id: 'i2', index: 1, status: 'due', label: 'On design approval', invoiceNumber: null },
    ]);
    liveCheckoutUrl.mockResolvedValue({ url: 'https://stripe.test/existing', minted: false });

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe('https://stripe.test/existing');
    // Nothing stored, because nothing new was created.
    expect(instalmentUpdate).not.toHaveBeenCalled();
  });

  it('stores the new link when it does have to mint one', async () => {
    instalmentFindMany.mockResolvedValue([
      { id: 'i2', index: 1, status: 'due', label: 'On design approval', invoiceNumber: null },
    ]);
    liveCheckoutUrl.mockResolvedValue({ url: 'https://stripe.test/fresh', minted: true, sessionId: 'cs_1' });

    const res = await call();

    expect(res.status).toBe(201);
    expect(instalmentUpdate.mock.calls[0][0].data).toMatchObject({
      paymentUrl: 'https://stripe.test/fresh',
      stripeSessionId: 'cs_1',
    });
  });

  it('answers 502 rather than a dead button when Stripe cannot be reached', async () => {
    instalmentFindMany.mockResolvedValue([
      { id: 'i2', index: 1, status: 'due', label: 'On design approval', invoiceNumber: null },
    ]);
    liveCheckoutUrl.mockResolvedValue(null);

    expect((await call()).status).toBe(502);
  });
});

describe('a legacy project with no schedule', () => {
  it('charges the balance actually outstanding, not the whole price', async () => {
    projectFindUnique.mockResolvedValue({ ...PROJECT, payments: [{ amount: 425000 }] });

    await call();

    const line = sessionsCreate.mock.calls[0][0].line_items[0];
    expect(line.price_data.unit_amount).toBe(425000);
  });

  it('refuses when the project is already settled', async () => {
    projectFindUnique.mockResolvedValue({ ...PROJECT, payments: [{ amount: 850000 }] });

    const res = await call();

    expect(res.status).toBe(400);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});
