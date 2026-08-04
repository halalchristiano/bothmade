import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * The one send in the whole app that a deal actually rides on.
 *
 * It went out with the invoice and no agreement — the client was asked to
 * agree and pay in one click, while the thing they were agreeing to existed
 * only behind a link. And when it didn't go at all, the rep was told "the
 * email failed to send", which does not distinguish "retry in a minute"
 * from "this deployment has no mail provider configured" — so the honest
 * conclusion was the one reported here: nothing happens when I press it.
 */

const sendSignAndPayEmail = vi.fn();
const buildProposalDocuments = vi.fn();

const prisma = {
  lead: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  leadActivity: { create: vi.fn(async () => ({})) },
};

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/middleware')>()),
  requireStaff: async () => ({ userId: 'u1', role: 'owner', type: 'user' }),
  canOverridePricing: () => true,
}));
vi.mock('@/lib/email', () => ({
  sendSignAndPayEmail: (...a: unknown[]) => sendSignAndPayEmail(...a),
}));
vi.mock('@/lib/proposal-documents', () => ({
  buildProposalDocuments: (...a: unknown[]) => buildProposalDocuments(...a),
  documentFilename: (company: string, kind: string) => `${company}-${kind}.pdf`,
}));
vi.mock('@/lib/share-links', () => ({
  buildSignUrl: (id: string) => `https://bothmade.studio/sign/${id}`,
}));

const { POST } = await import('@/app/api/admin/leads/[leadId]/proposal/route');

const SELECTION = {
  baseService: 'website',
  addOns: [],
  clientType: 'smb',
  timeline: 'standard',
  sendEmail: true,
};

function request(body: Record<string, unknown> = {}) {
  return {
    json: async () => ({ ...SELECTION, ...body }),
    headers: { get: () => null },
  } as unknown as NextRequest;
}

const params = Promise.resolve({ leadId: 'lead_1' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  prisma.lead.findUnique.mockResolvedValue({
    id: 'lead_1',
    company: 'Linpotia Cafe',
    contactName: 'Frell',
    email: 'frell@linpotia.com',
    shareToken: 'tok',
  });
  buildProposalDocuments.mockResolvedValue({
    invoice: Buffer.from('invoice-pdf'),
    contract: Buffer.from('contract-pdf'),
    failures: [],
  });
  sendSignAndPayEmail.mockResolvedValue({ sent: true });
});

/** The single options object the send is called with. */
const sendOptions = () =>
  sendSignAndPayEmail.mock.calls[0]?.[0] as
    | {
        attachments?: { filename: string; content: Buffer }[];
        schedule: Array<{ label: string; amount: string; triggerLabel: string }> | null;
        amountLabel: string;
        totalLabel: string;
      }
    | undefined;

const attachmentsSent = () => sendOptions()?.attachments;

describe('what the client receives', () => {
  it('attaches the agreement as well as the invoice', async () => {
    const res = await POST(request(), { params });

    expect(res.status).toBe(200);
    const names = attachmentsSent()!.map((a) => a.filename);
    expect(names).toEqual(['Linpotia Cafe-agreement.pdf', 'Linpotia Cafe-invoice.pdf']);
  });

  it('leads with the agreement, since that is what they are being asked to accept', async () => {
    await POST(request(), { params });

    expect(attachmentsSent()![0].filename).toContain('agreement');
  });

  it('reports a clean send', async () => {
    const body = await (await POST(request(), { params })).json();

    expect(body.emailSent).toBe(true);
    expect(body.emailError).toBeNull();
  });

  /**
   * The email that opens the deal has to name what is being charged. A
   * "deposit" of an unexplained size, with no mention of the two payments
   * behind it, is how a client arrives at payment 2 surprised.
   */
  it('carries the whole payment schedule, not just the amount due now', async () => {
    await POST(request(), { params });

    const schedule = sendOptions()!.schedule!;
    expect(schedule.map((r) => r.label)).toEqual(['Payment 1 of 3', 'Payment 2 of 3', 'Payment 3 of 3']);
    expect(sendOptions()!.amountLabel).toBe(schedule[0].amount);
  });

  /**
   * The footgun this defaulting fixes: `depositOnly` used to default to
   * false, so a request that omitted it charged the client the entire
   * project fee on the first click.
   */
  it('bills the instalment schedule when the caller says nothing about the plan', async () => {
    await POST(request(), { params });

    expect(sendOptions()!.schedule).not.toBeNull();
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ proposalDepositOnly: true }) })
    );
  });

  it('drops the schedule only when pay-in-full is chosen deliberately', async () => {
    await POST(request({ depositOnly: false }), { params });

    expect(sendOptions()!.schedule).toBeNull();
  });
});

describe('when a document cannot be built', () => {
  it('still sends what it has rather than sending nothing', async () => {
    buildProposalDocuments.mockResolvedValue({
      invoice: Buffer.from('invoice-pdf'),
      contract: null,
      failures: ['agreement'],
    });

    const body = await (await POST(request(), { params })).json();

    // An email with the invoice is worth more to the client than a failed
    // send and a rep who finds out tomorrow.
    expect(body.emailSent).toBe(true);
    expect(attachmentsSent()!.map((a) => a.filename)).toEqual(['Linpotia Cafe-invoice.pdf']);
  });

  it('says which one was left off, so nobody is surprised by the client', async () => {
    buildProposalDocuments.mockResolvedValue({
      invoice: null,
      contract: Buffer.from('contract-pdf'),
      failures: ['invoice'],
    });

    const body = await (await POST(request(), { params })).json();

    expect(body.emailError).toContain('invoice');
  });
});

describe('when the send fails', () => {
  it('passes the reason back instead of a shrug', async () => {
    sendSignAndPayEmail.mockResolvedValue({
      sent: false,
      reason: 'Email is not configured on this deployment (RESEND_API_KEY is not set), so nothing was sent.',
    });

    const body = await (await POST(request(), { params })).json();

    expect(body.emailSent).toBe(false);
    expect(body.emailError).toContain('RESEND_API_KEY');
  });

  it('still returns a working link, because the deal should not wait on the mail', async () => {
    sendSignAndPayEmail.mockResolvedValue({ sent: false, reason: 'domain is not verified' });

    const body = await (await POST(request(), { params })).json();

    expect(body.success).toBe(true);
    expect(body.signUrl).toContain('/sign/lead_1');
  });

  it('does not log a "link emailed" activity for an email that never went', async () => {
    sendSignAndPayEmail.mockResolvedValue({ sent: false, reason: 'nope' });

    await POST(request(), { params });

    const kinds = (
      prisma.leadActivity.create.mock.calls as unknown as [{ data: { type: string } }][]
    ).map((c) => c[0].data.type);
    expect(kinds).not.toContain('email');
  });
});

describe('when there is nobody to send to', () => {
  it('builds no documents and claims no send', async () => {
    prisma.lead.findUnique.mockResolvedValue({
      id: 'lead_1',
      company: 'Linpotia Cafe',
      contactName: 'Frell',
      email: null,
      shareToken: 'tok',
    });

    const body = await (await POST(request(), { params })).json();

    expect(body.hasEmail).toBe(false);
    expect(body.emailSent).toBe(false);
    expect(buildProposalDocuments).not.toHaveBeenCalled();
  });
});
