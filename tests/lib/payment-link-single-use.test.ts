import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A Stripe Payment Link collects every time it is opened.
 *
 * Unlike a Checkout Session — single use, dead in 24 hours — a Payment Link
 * never expires and has no usage limit unless one is set. Nothing here set
 * one. So a client could pay the same invoice twice: a forwarded email, a back
 * button, a bookmark opened next month. Each completion is its own Checkout
 * Session with its own id, so the webhook's idempotency guard (keyed on the
 * session) does not see a duplicate, and a second Payment row is written
 * against a card that has genuinely been charged again.
 *
 * The invoice is only ever marked paid once, because that update is scoped to
 * a still-open row. That is the shape of the failure: the books settle once
 * and the money moves twice, so nothing in the app looks wrong.
 *
 * This codebase closes exactly this window with great care wherever it uses
 * Checkout Sessions — "two live links for one instalment is the
 * double-collection window this flow exists to close" — and all three Payment
 * Link call sites were left open.
 *
 * One test per route, holding the restriction rather than the wiring.
 */

const paymentLinksCreate = vi.fn(async (_a: unknown) => ({ id: 'plink_1', url: 'https://pay.stripe.test/plink_1' }));
const checkoutSessionsCreate = vi.fn(async (_a: unknown) => ({ id: 'cs_1', url: 'https://stripe.test/cs_1' }));

const prisma = {
  project: { findUnique: vi.fn(async (_a: unknown) => null as unknown), update: vi.fn(async (_a: unknown) => ({})) },
  instalment: { count: vi.fn(async (_a: unknown) => 0), findMany: vi.fn(async (_a: unknown) => [] as unknown[]) },
  invoice: {
    count: vi.fn(async (_a: unknown) => 0),
    // The duplicate guard: a twin raised in the last few minutes blocks the
    // charge, so it has to answer "no twin" for the link to be reached.
    findFirst: vi.fn(async (_a: unknown) => null as unknown),
    create: vi.fn(async (_a: unknown) => ({ id: 'invoice_1', number: 'BM-2026-0001', createdAt: new Date(0) })),
    update: vi.fn(async (_a: unknown) => ({})),
  },
  payment: { findMany: vi.fn(async (_a: unknown) => [] as unknown[]) },
  projectUpdate: { create: vi.fn(async (_a: unknown) => ({})) },
};

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ userId: 'user_1' }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));
vi.mock('@/lib/authz', () => ({ ANY_STAFF: [], requireRole: () => null }));
vi.mock('@/lib/site-url', () => ({ resolveSiteUrl: () => 'https://bothmade.test' }));
vi.mock('@vercel/blob', () => ({ put: async () => ({ url: 'https://blob.test/i.pdf' }) }));
vi.mock('@/lib/invoice-pdf', () => ({
  buildCustomChargeInvoicePdf: async () => new Uint8Array([1]),
  buildInstalmentInvoicePdf: async () => new Uint8Array([1]),
}));
vi.mock('@/lib/email', () => ({
  sendCustomChargeEmail: async () => ({ sent: true }),
  sendInvoiceRecordEmail: async () => ({ sent: true }),
  sendPaymentLinkEmail: async () => true,
}));
vi.mock('stripe', () => ({
  default: class {
    paymentLinks = { create: paymentLinksCreate };
    checkout = { sessions: { create: checkoutSessionsCreate } };
  },
}));

const charges = await import('@/app/api/admin/billing/charges/route');
const collectBalance = await import('@/app/api/admin/projects/[projectId]/collect-balance/route');
const reminder = await import('@/app/api/admin/projects/[projectId]/payment-reminder/route');

const PROJECT = {
  id: 'proj_1',
  clientId: 'client_1',
  name: 'Acme Site',
  status: 'design',
  totalPrice: 2_000_000,
  payments: [],
  client: { id: 'client_1', company: 'Acme', email: 'client@acme.test', contactName: 'Dana' },
};

const params = { params: Promise.resolve({ projectId: 'proj_1' }) };
const post = (body: unknown) =>
  new Request('https://x/api', { method: 'POST', body: JSON.stringify(body) }) as never;

/** What Stripe was actually asked to build. */
const linkArgs = () => paymentLinksCreate.mock.calls[0]![0] as {
  restrictions?: { completed_sessions?: { limit?: number } };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  prisma.project.findUnique.mockResolvedValue(PROJECT);
  prisma.instalment.count.mockResolvedValue(0);
  prisma.invoice.count.mockResolvedValue(0);
  prisma.invoice.findFirst.mockResolvedValue(null);
  prisma.invoice.create.mockResolvedValue({ id: 'invoice_1', number: 'BM-2026-0001', createdAt: new Date(0) });
  paymentLinksCreate.mockResolvedValue({ id: 'plink_1', url: 'https://pay.stripe.test/plink_1' });
});

describe('a one-off charge', () => {
  it('mints a link Stripe will only take money through once', async () => {
    await charges.POST(
      post({
        projectId: 'proj_1',
        description: 'Extra page',
        lineItems: [{ label: 'Extra page', priceCents: 50_000 }],
      })
    );

    expect(paymentLinksCreate).toHaveBeenCalledOnce();
    expect(linkArgs().restrictions?.completed_sessions?.limit).toBe(1);
  });
});

describe('collecting a legacy balance', () => {
  it('mints a link Stripe will only take money through once', async () => {
    await collectBalance.POST(post({}), params);

    expect(paymentLinksCreate).toHaveBeenCalledOnce();
    expect(linkArgs().restrictions?.completed_sessions?.limit).toBe(1);
  });
});

describe('the one-click payment reminder', () => {
  it('mints a link Stripe will only take money through once', async () => {
    await reminder.POST(post({}), params);

    expect(paymentLinksCreate).toHaveBeenCalledOnce();
    expect(linkArgs().restrictions?.completed_sessions?.limit).toBe(1);
  });

  /**
   * Not new, but worth holding next to the above: this whole lump-balance path
   * is refused for a project that bills by schedule, because its payments
   * never settle instalment rows — pay here today, invoiced "Payment 2 of 3"
   * tomorrow. Same double-collection failure by a different route.
   */
  it('refuses a project that bills by instalment schedule', async () => {
    prisma.instalment.count.mockResolvedValue(3);

    const res = await reminder.POST(post({}), params);

    expect(res.status).toBe(400);
    expect(paymentLinksCreate).not.toHaveBeenCalled();
  });
});
