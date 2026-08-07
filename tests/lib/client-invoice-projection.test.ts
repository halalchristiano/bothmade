import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * One endpoint, two audiences.
 *
 * The client dashboard and the admin project page read the same invoice list
 * on purpose — a client and the studio looking at the same invoice number
 * should never be looking at two different stories. But "the same story" is
 * about the invoice, not about how we have been handling it, and the row has
 * grown a chase log since: how many times we emailed them, when, and the
 * reconciliation note somebody typed when money turned up by bank transfer.
 *
 * Both directions of that had gone wrong at once. The client's copy would
 * have carried the chase log the moment anything spread the row wholesale;
 * the studio's copy did not carry it at all, so the project page's Send
 * confirmation told whoever was about to press it that an invoice chased
 * three times had never been emailed.
 */

const prisma = {
  project: { findUnique: vi.fn(async (_a: unknown) => null as unknown) },
  lead: { findUnique: vi.fn(async (_a: unknown) => null as unknown) },
};

const principal = { type: 'client' as 'client' | 'user', clientId: 'client_1', userId: 'user_1' };

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requirePrincipal: async () => ({ session: principal, response: null }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
  forbiddenResponse: () => new Response('{}', { status: 403 }),
}));
vi.mock('@/lib/site-url', () => ({ resolveSiteUrl: () => 'https://bothmade.test' }));
vi.mock('@/lib/instalments', () => ({
  ensureInstalments: async () => [],
  OWED_INSTALMENT_STATUSES: ['scheduled', 'due'],
}));

const { GET } = await import('@/app/api/projects/[projectId]/route');

const CHASED_INVOICE = {
  id: 'invoice_1',
  number: 'BM-2026-0007',
  description: 'Second round of homepage design',
  lineItems: [],
  amountCents: 120_000,
  status: 'open',
  pdfUrl: null,
  paymentUrl: 'https://pay.test/abc',
  createdAt: new Date('2026-02-01T10:00:00Z'),
  paidAt: null,
  refundedCents: 0,
  refundMethod: null,
  refundedAt: null,
  refundReason: null,
  voidReason: null,
  issuedBy: { name: 'Evan', email: 'evan@bothmade.studio' },
  sentToEmail: 'owner@acme.test',
  sendCount: 3,
  lastSentAt: new Date('2026-02-20T10:00:00Z'),
  paidMethod: 'Bank transfer, ref ACME0312',
};

const PROJECT = {
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
  invoices: [CHASED_INVOICE],
  instalments: [],
};

async function readInvoice() {
  const res = await GET(new Request('https://x/api') as never, {
    params: Promise.resolve({ projectId: 'proj_1' }),
  });
  const body = (await res.json()) as {
    project: { invoices: Array<Record<string, unknown>> };
  };
  return body.project.invoices[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  principal.type = 'client';
  prisma.project.findUnique.mockResolvedValue(PROJECT);
});

describe('what the client is shown', () => {
  it('gets the invoice, not the chase log', async () => {
    const row = await readInvoice();

    expect(row.number).toBe('BM-2026-0007');
    expect(row.amountCents).toBe(120_000);

    // How many times we have asked them for money is our business, and
    // reading it back is faintly insulting.
    expect(row.sendCount).toBeUndefined();
    expect(row.lastSentAt).toBeUndefined();
    expect(row.sentToEmail).toBeUndefined();
    // A reconciliation note typed for our own books, in our own words.
    expect(row.paidMethod).toBeUndefined();
    // The org chart is not part of the bill.
    expect(row.issuedBy).toBeUndefined();
  });

  /*
   * The reasons an invoice changed ARE written for the client — they are what
   * goes in their email, and the dashboard renders them on the row. Withholding
   * those would leave a cancelled invoice with no explanation on it.
   */
  it('still gets told why an invoice changed', async () => {
    prisma.project.findUnique.mockResolvedValue({
      ...PROJECT,
      invoices: [
        {
          ...CHASED_INVOICE,
          status: 'void',
          voidReason: 'Raised against the wrong project',
          refundReason: null,
        },
      ],
    });

    const row = await readInvoice();

    expect(row.voidReason).toBe('Raised against the wrong project');
  });
});

describe('what the studio is shown', () => {
  beforeEach(() => {
    principal.type = 'user';
  });

  /*
   * The project page renders the same invoice actions as the billing ledger,
   * and the Send confirmation reads these. Without them it told whoever was
   * about to press send that an invoice chased three times had never been
   * emailed — not a missing detail, but the wrong answer to the question the
   * confirmation exists to ask.
   */
  it('gets the chase log the Send confirmation depends on', async () => {
    const row = await readInvoice();

    expect(row.sendCount).toBe(3);
    expect(row.lastSentAt).toBeTruthy();
    expect(row.sentToEmail).toBe('owner@acme.test');
  });

  it('gets how money that skipped Stripe actually arrived', async () => {
    const row = await readInvoice();

    // Once the badge just reads "Paid", this note is the only place a bank
    // transfer is recoverable from.
    expect(row.paidMethod).toBe('Bank transfer, ref ACME0312');
  });

  it('gets who raised it', async () => {
    const row = await readInvoice();

    expect(row.issuedBy).toBe('Evan');
  });
});
