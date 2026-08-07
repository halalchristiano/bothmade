import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The client's own Invoices panel could not pay an instalment invoice.
 *
 * It renders `invoice.paymentUrl` as its Pay button, and falls back to "We'll
 * send a payment link for this shortly" when that is null. An instalment
 * invoice has no paymentUrl and never has: the checkout lives on the Instalment
 * row and dies after 24 hours, so storing it on the invoice would be storing a
 * corpse.
 *
 * So every instalment invoice on that panel read as unpayable, promising a
 * link that had already been emailed days earlier — directly below a payment
 * schedule offering to take the same money. The page contradicted itself about
 * a bill, which is the one subject where a client will not give you the
 * benefit of the doubt.
 *
 * /pay resolves a live session at click time and refuses for anything settled
 * or cancelled, so it is safe to hand over for any row still owed.
 */

const prisma = {
  project: { findUnique: vi.fn(async (_a: unknown) => null as unknown) },
  lead: { findUnique: vi.fn(async (_a: unknown) => null as unknown) },
};

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/auth', () => ({ getCurrentSession: async () => ({ type: 'client', clientId: 'client_1' }) }));
vi.mock('@/lib/middleware', () => ({
  requirePrincipal: async () => ({
    session: { type: 'client', clientId: 'client_1' },
    response: null,
  }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
  forbiddenResponse: () => new Response('{}', { status: 403 }),
}));
vi.mock('@/lib/instalments', () => ({
  ensureInstalments: async () => [],
  OWED_INSTALMENT_STATUSES: ['scheduled', 'due'],
}));

const { GET } = await import('@/app/api/projects/[projectId]/route');

const instalment = (over: Record<string, unknown> = {}) => ({
  id: 'inst_2',
  index: 2,
  count: 3,
  label: 'Payment 2 of 3',
  percent: 30,
  amountCents: 600_000,
  trigger: 'design-approval',
  status: 'due',
  invoiceNumber: 'BM-2026-0007',
  dueAt: null,
  paidAt: null,
  ...over,
});

const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'invoice_1',
  number: 'BM-2026-0007',
  description: 'Payment 2 of 3 — Acme Site',
  lineItems: [],
  amountCents: 600_000,
  status: 'open',
  pdfUrl: null,
  paymentUrl: null,
  createdAt: new Date(0),
  paidAt: null,
  refundedCents: 0,
  refundMethod: null,
  refundedAt: null,
  refundReason: null,
  voidReason: null,
  issuedBy: null,
  sentToEmail: null,
  ...over,
});

const projectWith = (invoices: unknown[], instalments: unknown[]) => ({
  id: 'proj_1',
  clientId: 'client_1',
  name: 'Acme Site',
  status: 'design',
  statusStage: 1,
  totalPrice: 2_000_000,
  basePrice: 2_000_000,
  baseService: 'website',
  addOns: '',
  customItems: [],
  timeline: null,
  description: null,
  estimatedCompletionDate: null,
  payments: [],
  messages: [],
  updates: [],
  onboardingQuestions: [],
  deliverables: null,
  contractUrl: null,
  convertedFromLeadId: null,
  client: { company: 'Acme', email: 'client@acme.test', contactName: 'Dana' },
  designDirection: null,
  designFeedback: [],
  designRound: 0,
  designPresentedAt: null,
  designReviewEndsAt: null,
  designApprovedAt: null,
  designApprovalDeemed: false,
  designUrl: null,
  liveUrl: null,
  invoices,
  instalments,
});

const read = async () => {
  const res = await GET(new Request('https://x/api') as never, {
    params: Promise.resolve({ projectId: 'proj_1' }),
  });
  const body = (await res.json()) as { project: { invoices: Array<{ number: string; paymentUrl: string | null }> } };
  return body.project.invoices;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('an instalment invoice still owed', () => {
  it('is payable, through the link that resolves a live session', async () => {
    prisma.project.findUnique.mockResolvedValue(projectWith([invoice()], [instalment()]));

    const [row] = await read();

    expect(row.paymentUrl).toBe('/pay/inst_2');
  });
});

describe('an instalment invoice that should not take money', () => {
  it('offers nothing once the instalment is paid', async () => {
    prisma.project.findUnique.mockResolvedValue(
      projectWith([invoice({ status: 'paid' })], [instalment({ status: 'paid' })])
    );

    const [row] = await read();

    expect(row.paymentUrl).toBeNull();
  });

  it('offers nothing once the invoice is void', async () => {
    prisma.project.findUnique.mockResolvedValue(
      projectWith([invoice({ status: 'void' })], [instalment({ status: 'scheduled' })])
    );

    const [row] = await read();

    expect(row.paymentUrl).toBeNull();
  });

  it('offers nothing for a voided instalment row', async () => {
    prisma.project.findUnique.mockResolvedValue(
      projectWith([invoice()], [instalment({ status: 'void' })])
    );

    const [row] = await read();

    expect(row.paymentUrl).toBeNull();
  });
});

describe('a one-off charge', () => {
  /**
   * These pay through a Stripe Payment Link, which is permanent and stored on
   * the invoice. No instalment claims their number, so the stored URL stands.
   */
  it('keeps its own stored payment link', async () => {
    prisma.project.findUnique.mockResolvedValue(
      projectWith(
        [invoice({ number: 'BM-2026-0009', paymentUrl: 'https://pay.stripe.test/plink_1' })],
        [instalment()]
      )
    );

    const [row] = await read();

    expect(row.paymentUrl).toBe('https://pay.stripe.test/plink_1');
  });
});
