import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `doNotContact` is described in the schema as "a hard stop, not a preference —
 * every outreach path checks it before sending or dialling." Two of them did
 * not: both cold-email routes selected leads by id and only skipped the ones
 * with no address on file, so a business that had asked to be left alone was
 * emailed anyway by a batch send.
 *
 * Pinned here because this is the one bug in this codebase whose consequences
 * land outside it, on somebody who already told us no.
 */

const prisma = {
  lead: { findMany: vi.fn(), update: vi.fn(async () => ({})) },
  leadActivity: { create: vi.fn(async () => ({})) },
  user: { findUnique: vi.fn() },
};

const requireStaff = vi.fn();
const sendAsUser = vi.fn();
const sendTemplatedEmail = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));
vi.mock('@/lib/mailer', () => ({
  sendAsUser: (...args: unknown[]) => sendAsUser(...args),
  createGmailBatchTransport: vi.fn(() => undefined),
}));
vi.mock('@/lib/send-templated-email', () => ({
  sendTemplatedEmail: (...args: unknown[]) => sendTemplatedEmail(...args),
}));
vi.mock('@/lib/gmail-delegated', () => ({ isDomainDelegationConfigured: () => false }));
vi.mock('@/lib/gmail-oauth', () => ({ createGmailOAuthBatchClient: vi.fn(() => undefined) }));
vi.mock('@/lib/crypto', () => ({ decryptSecret: (v: string) => v }));

const { POST: sendColdDrafts } = await import('@/app/api/admin/email/send-cold-drafts/route');
const { POST: sendBulk } = await import('@/app/api/admin/email/send-bulk/route');

function request(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof sendColdDrafts>[0];
}

const WILLING = {
  id: 'lead_ok',
  company: 'Northgate Dental',
  email: 'priya@northgatedental.com',
  status: 'new',
  doNotContact: false,
  coldEmailDraft: 'Subject: Your booking page\n\nHello.',
  painPoints: '',
  personalizedObservation: null,
};

const REFUSED = {
  ...WILLING,
  id: 'lead_no',
  company: 'Harborview Marine',
  email: 'glen@harborviewmarine.com',
  doNotContact: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireStaff.mockResolvedValue({ userId: 'user_1' });
  prisma.user.findUnique.mockResolvedValue({
    name: 'Evan', email: 'evan@bothmade.studio',
    gmailAddress: null, gmailAppPassword: null, googleRefreshToken: null, avatarUrl: null,
  });
  sendAsUser.mockResolvedValue({ ok: true, via: 'resend' });
  sendTemplatedEmail.mockResolvedValue({ ok: true });
});

describe('a lead marked do-not-contact', () => {
  it('is not sent their cold draft, even when selected alongside a willing lead', async () => {
    prisma.lead.findMany.mockResolvedValue([WILLING, REFUSED]);

    const res = await sendColdDrafts(request({ leadIds: [WILLING.id, REFUSED.id] }));
    const data = await res.json();

    const addressed = sendAsUser.mock.calls.map((call) => (call[1] as { to: string }).to);
    expect(addressed).not.toContain(REFUSED.email);
    expect(addressed).toContain(WILLING.email);

    const refused = data.results.find((r: { leadId: string }) => r.leadId === REFUSED.id);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toMatch(/do-not-contact/i);
  });

  it('is not sent a bulk template, even when the composer lists them', async () => {
    prisma.lead.findMany.mockResolvedValue([{ id: REFUSED.id }]);

    const res = await sendBulk(
      request({
        templateId: 'cold-intro',
        recipients: [
          { leadId: WILLING.id, to: WILLING.email, company: WILLING.company },
          { leadId: REFUSED.id, to: REFUSED.email, company: REFUSED.company },
        ],
      })
    );
    const data = await res.json();

    const addressed = sendTemplatedEmail.mock.calls.map((call) => (call[0] as { to: string }).to);
    expect(addressed).not.toContain(REFUSED.email);
    expect(addressed).toContain(WILLING.email);

    const refused = data.results.find((r: { leadId: string }) => r.leadId === REFUSED.id);
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/do-not-contact/i);
  });
});
