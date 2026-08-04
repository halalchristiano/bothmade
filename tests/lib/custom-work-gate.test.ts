import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The other half of the fix, on the server side: the two actions that put an
 * agreement in front of a client — downloading the contract, and emailing
 * the sign-and-pay link the agreement rides along with — refuse to run while
 * a custom line item has no description.
 *
 * Gating in the UI alone would be cosmetic. The gate has to hold for a stale
 * tab, a resubmitted request, or anything else that reaches the route with
 * an undescribed item in the payload.
 */

const buildContractPdf = vi.fn(async (..._args: unknown[]) => new Uint8Array([1, 2, 3]));
vi.mock('@/lib/contract-pdf', () => ({
  buildContractPdf: (...args: unknown[]) => buildContractPdf(...args),
}));

const buildProposalDocuments = vi.fn(async (..._args: unknown[]) => ({
  invoice: null,
  contract: null,
  failures: [] as string[],
}));
vi.mock('@/lib/proposal-documents', () => ({
  buildProposalDocuments: (...args: unknown[]) => buildProposalDocuments(...args),
  documentFilename: () => 'doc.pdf',
}));

const leadFindUnique = vi.fn();
const leadUpdate = vi.fn();
const activityCreate = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead: {
      findUnique: (...args: unknown[]) => leadFindUnique(...args),
      update: (...args: unknown[]) => leadUpdate(...args),
    },
    leadActivity: { create: (...args: unknown[]) => activityCreate(...args) },
  },
}));

vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ userId: 'user_1', role: 'sales' }),
  unauthorizedResponse: () => new Response('no', { status: 401 }),
  canOverridePricing: () => true,
}));

const sendSignAndPayEmail = vi.fn(async (..._args: unknown[]) => ({ sent: true, reason: '' }));
vi.mock('@/lib/email', () => ({
  sendSignAndPayEmail: (...args: unknown[]) => sendSignAndPayEmail(...args),
}));

vi.mock('@/lib/share-links', () => ({ buildSignUrl: () => 'https://bothmade.test/sign/lead_1?t=tok' }));

import { POST as contractPost } from '@/app/api/admin/leads/[leadId]/contract/route';
import { POST as proposalPost } from '@/app/api/admin/leads/[leadId]/proposal/route';

const LEAD = {
  id: 'lead_1',
  company: 'Northgate Dental Group',
  contactName: 'Priya Raman',
  email: 'priya@northgate.test',
  shareToken: 'tok',
  status: 'qualified',
  contractStatus: 'not_sent',
  proposalCustomItems: [],
};

const params = Promise.resolve({ leadId: 'lead_1' });

const body = (customItems: unknown[]) => ({
  baseService: 'website',
  addOns: ['seo'],
  clientType: 'smb',
  timeline: 'standard',
  customItems,
});

const post = (handler: typeof contractPost, customItems: unknown[]) =>
  handler(
    new Request('https://bothmade.test/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body(customItems)),
    }) as never,
    { params }
  );

const DESCRIBED = {
  label: 'Custom integration',
  description: 'Two-way sync between the booking form and their existing Dentrix install, every 15 minutes.',
  priceCents: 400000,
};

beforeEach(() => {
  vi.clearAllMocks();
  leadFindUnique.mockResolvedValue({ ...LEAD });
  leadUpdate.mockResolvedValue({ ...LEAD });
  activityCreate.mockResolvedValue({});
});

describe('generating the contract', () => {
  it('refuses while a custom item has no description', async () => {
    const response = await post(contractPost, [{ label: 'Custom integration', priceCents: 400000 }]);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.needsCustomScope).toBe(true);
    expect(data.error).toContain('Custom integration');
    expect(buildContractPdf).not.toHaveBeenCalled();
  });

  it('refuses a description too vague to settle what the work is', async () => {
    const response = await post(contractPost, [
      { label: 'Custom integration', description: 'TBD', priceCents: 400000 },
    ]);

    expect(response.status).toBe(400);
    expect(buildContractPdf).not.toHaveBeenCalled();
  });

  it('generates once the work has been described, and puts the scope in the document', async () => {
    const response = await post(contractPost, [DESCRIBED]);

    expect(response.status).toBe(200);
    expect(buildContractPdf).toHaveBeenCalledTimes(1);
    expect(buildContractPdf.mock.calls[0][0]).toMatchObject({
      customItems: [{ label: DESCRIBED.label, description: DESCRIBED.description, price: '$4,000' }],
    });
  });

  it('is unaffected when there is no custom work at all', async () => {
    const response = await post(contractPost, []);

    expect(response.status).toBe(200);
    expect(buildContractPdf).toHaveBeenCalledTimes(1);
  });
});

describe('sending the sign-and-pay link', () => {
  it('refuses while a custom item has no description, and saves nothing', async () => {
    const response = await post(proposalPost, [{ label: 'Custom integration', priceCents: 400000 }]);

    expect(response.status).toBe(400);
    expect((await response.json()).needsCustomScope).toBe(true);
    // Nothing is written: a half-saved proposal the client can already open
    // is the state this route exists to avoid.
    expect(leadUpdate).not.toHaveBeenCalled();
    expect(buildProposalDocuments).not.toHaveBeenCalled();
  });

  it('sends once the work has been described', async () => {
    const response = await post(proposalPost, [DESCRIBED]);

    expect(response.status).toBe(200);
    expect(leadUpdate).toHaveBeenCalledTimes(1);
  });

  it('stores the description alongside the price so the client link can show it', async () => {
    await post(proposalPost, [DESCRIBED]);

    expect(leadUpdate.mock.calls[0][0].data.proposalCustomItems).toEqual([DESCRIBED]);
  });
});
