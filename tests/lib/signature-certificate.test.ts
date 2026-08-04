import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

/**
 * The certificate is the document you hand to somebody who is already
 * disputing something. Two properties matter more than anything about its
 * layout: it must refuse to exist for an agreement that wasn't signed or
 * wasn't paid, and it must not quietly assert facts the record doesn't
 * hold. Both are tested here.
 */

const requireStaff = vi.fn();
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));

const requireRole = vi.fn();
vi.mock('@/lib/authz', () => ({
  OPS: ['owner', 'admin', 'ops'],
  requireRole: (...args: unknown[]) => requireRole(...args),
}));

const clientFindUnique = vi.fn();
const leadFindUnique = vi.fn();
const activityFindMany = vi.fn();
const activityCreate = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: {
    client: { findUnique: (...a: unknown[]) => clientFindUnique(...a) },
    lead: { findUnique: (...a: unknown[]) => leadFindUnique(...a) },
    leadActivity: {
      findMany: (...a: unknown[]) => activityFindMany(...a),
      create: (...a: unknown[]) => activityCreate(...a),
    },
  },
}));

const { GET } = await import('@/app/api/admin/clients/[clientId]/signature-certificate/route');
const { buildSignatureCertificatePdf } = await import('@/lib/signature-certificate');

const SIGNED_AT = new Date('2026-07-14T09:31:00Z');

const PAID_PROJECT = {
  id: 'proj_1',
  name: 'Northgate Dental — Website',
  baseService: 'website',
  totalPrice: 600_000,
  convertedFromLeadId: 'lead_1',
  payments: [{ createdAt: new Date('2026-07-14T09:34:00Z'), amount: 180_000, type: 'deposit', stripeSessionId: 'cs_test_1' }],
};

const SIGNED_LEAD = {
  id: 'lead_1',
  company: 'Northgate Dental Group',
  contactName: 'Priya Raman',
  email: 'priya@northgatedental.test',
  proposalBaseService: 'website',
  proposalTotalPrice: 600_000,
  agreementSignedAt: SIGNED_AT,
  agreementIp: '203.0.113.7',
  agreementUserAgent: 'Mozilla/5.0 (Macintosh) Chrome/121.0',
  agreementSignerName: 'Priya Raman',
  agreementStatement: 'I have read and agree to the terms above.',
  agreementHash: 'a'.repeat(64),
  signedContractUrl: 'https://blob.test/contract.pdf',
};

function req(url = 'https://admin.test/api/admin/clients/client_1/signature-certificate') {
  return { nextUrl: new URL(url) } as unknown as Parameters<typeof GET>[0];
}
const params = Promise.resolve({ clientId: 'client_1' });

beforeEach(() => {
  requireStaff.mockReset().mockResolvedValue({ userId: 'user_1', email: 'evan@bothmade.studio', type: 'user' });
  requireRole.mockReset().mockReturnValue(null);
  clientFindUnique.mockReset().mockResolvedValue({
    id: 'client_1',
    company: 'Northgate Dental Group',
    email: 'priya@northgatedental.test',
    projects: [PAID_PROJECT],
  });
  leadFindUnique.mockReset().mockResolvedValue({ ...SIGNED_LEAD });
  activityFindMany.mockReset().mockResolvedValue([
    { createdAt: new Date('2026-07-10T11:00:00Z'), content: 'Sign-and-pay link emailed to priya@northgatedental.test' },
    { createdAt: SIGNED_AT, content: 'Contract signed online by Priya Raman (IP 203.0.113.7)' },
  ]);
  activityCreate.mockReset().mockResolvedValue({ id: 'act_1' });
});

describe('who can ask for one', () => {
  it('turns away anyone not signed in', async () => {
    requireStaff.mockResolvedValue(null);
    expect((await GET(req(), { params })).status).toBe(401);
  });

  it('turns away a role that has no business seeing client money', async () => {
    requireRole.mockReturnValue(new Response(null, { status: 403 }));
    const res = await GET(req(), { params });
    expect(res.status).toBe(403);
    expect(leadFindUnique).not.toHaveBeenCalled();
  });
});

describe('what it refuses to certify', () => {
  it('refuses when no payment has landed', async () => {
    clientFindUnique.mockResolvedValue({
      id: 'client_1',
      company: 'Northgate Dental Group',
      email: 'priya@northgatedental.test',
      projects: [{ ...PAID_PROJECT, payments: [] }],
    });

    const res = await GET(req('https://admin.test/x?projectId=proj_1'), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/no payment/i);
  });

  it('refuses when the agreement was never signed', async () => {
    leadFindUnique.mockResolvedValue({ ...SIGNED_LEAD, agreementSignedAt: null });

    const res = await GET(req(), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/no electronic signature/i);
  });

  it('refuses for a project onboarded outside the sign-and-pay flow', async () => {
    clientFindUnique.mockResolvedValue({
      id: 'client_1',
      company: 'Northgate Dental Group',
      email: 'priya@northgatedental.test',
      projects: [{ ...PAID_PROJECT, convertedFromLeadId: null }],
    });

    const res = await GET(req('https://admin.test/x?projectId=proj_1'), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/onboarded manually/i);
  });

  it('will not quietly substitute a different project than the one asked for', async () => {
    // proj_2 has no payment. Asking for it must fail rather than fall back
    // to proj_1 and hand over a certificate for the wrong agreement.
    clientFindUnique.mockResolvedValue({
      id: 'client_1',
      company: 'Northgate Dental Group',
      email: 'priya@northgatedental.test',
      projects: [PAID_PROJECT, { ...PAID_PROJECT, id: 'proj_2', payments: [] }],
    });

    const res = await GET(req('https://admin.test/x?projectId=proj_2'), { params });
    expect(res.status).toBe(409);
  });
});

describe('when it does issue one', () => {
  it('returns a PDF attachment that is not cacheable', async () => {
    const res = await GET(req(), { params });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('signature-certificate.pdf');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');

    const doc = await PDFDocument.load(await res.arrayBuffer());
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('records that a certificate was issued, and by whom', async () => {
    await GET(req(), { params });

    expect(activityCreate).toHaveBeenCalledTimes(1);
    expect(activityCreate.mock.calls[0][0].data).toMatchObject({
      leadId: 'lead_1',
      createdById: 'user_1',
    });
  });

  it('still hands over the document if logging the issue fails', async () => {
    activityCreate.mockRejectedValue(new Error('db down'));
    expect((await GET(req(), { params })).status).toBe(200);
  });
});

describe('buildSignatureCertificatePdf', () => {
  const BASE = {
    reference: 'lead_1',
    company: 'Northgate Dental Group',
    contactName: 'Priya Raman',
    clientEmail: 'priya@northgatedental.test',
    serviceLabel: 'Custom Website',
    totalPriceLabel: '$6,000',
    signerName: 'Priya Raman',
    signedAt: SIGNED_AT,
    ip: '203.0.113.7',
    userAgent: 'Mozilla/5.0 (Macintosh) Chrome/121.0',
    statement: 'I have read and agree to the terms above.',
    documentHash: 'a'.repeat(64),
    signedContractUrl: 'https://blob.test/contract.pdf',
    payments: [{ at: SIGNED_AT, amountLabel: '$1,800', type: 'deposit', stripeSessionId: 'cs_test_1' }],
    events: [{ at: SIGNED_AT, description: 'Contract signed online by Priya Raman' }],
    generatedAt: new Date('2026-08-04T12:00:00Z'),
    generatedBy: 'evan@bothmade.studio',
  };

  it('renders a complete record', async () => {
    const doc = await PDFDocument.load(await buildSignatureCertificatePdf(BASE));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('renders a thin record from before the evidence fields existed', async () => {
    // Nothing here may be invented to fill a gap — it just has to render.
    const doc = await PDFDocument.load(
      await buildSignatureCertificatePdf({
        ...BASE,
        signerName: null,
        ip: null,
        userAgent: null,
        statement: null,
        documentHash: null,
        signedContractUrl: null,
        payments: [],
        events: [],
      })
    );
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('survives a signer whose name the standard fonts cannot encode', async () => {
    await expect(
      buildSignatureCertificatePdf({ ...BASE, signerName: '李明', company: 'Zoë Ó Faoláin Ltd' })
    ).resolves.toBeInstanceOf(Uint8Array);
  });

  it('paginates a long audit trail instead of overrunning the page', async () => {
    const doc = await PDFDocument.load(
      await buildSignatureCertificatePdf({
        ...BASE,
        events: Array.from({ length: 60 }, (_, i) => ({
          at: new Date(SIGNED_AT.getTime() + i * 60_000),
          description: `Event ${i}: a note long enough to wrap across more than a single line of the value column.`,
        })),
      })
    );
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
