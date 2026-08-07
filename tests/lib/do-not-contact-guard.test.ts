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
  leadActivity: {
    create: vi.fn(async () => ({})),
    // The daily send budget counts sent email off this table, so a mock
    // without it reads as "the day is already spent" and every send below
    // gets trimmed to nothing.
    count: vi.fn(async () => 0),
  },
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

/**
 * The opposite failure: a lead nobody is allowed to email a second time.
 *
 * Sending once set coldEmailSentAt, and the lead page then hid the send button
 * for good — so the most ordinary follow-up in the job (the first email went to
 * an info@ nobody reads, or the draft has been rewritten since) had no button
 * at all, while the same action stayed available for fifty leads at once from
 * the list. The route never had that restriction and must not grow one.
 */
describe('a lead that has already been contacted', () => {
  const CONTACTED = {
    ...WILLING,
    id: 'lead_again',
    company: 'Ridgeline Roofing',
    email: 'office@ridgelineroofing.com',
    status: 'contacted',
    coldEmailSentAt: new Date('2026-08-01T10:00:00.000Z'),
    coldEmailOpens: 4,
    coldEmailOpenedAt: new Date('2026-08-01T10:30:00.000Z'),
    coldEmailLastOpenedAt: new Date('2026-08-03T09:00:00.000Z'),
  };

  it('can be sent the cold email again', async () => {
    prisma.lead.findMany.mockResolvedValue([CONTACTED]);

    const res = await sendColdDrafts(request({ leadIds: [CONTACTED.id] }));
    const data = await res.json();

    expect(sendAsUser.mock.calls.map((c) => (c[1] as { to: string }).to)).toContain(CONTACTED.email);
    expect(data.results.find((r: { leadId: string }) => r.leadId === CONTACTED.id).ok).toBe(true);
  });

  /**
   * Opens of the previous email are not evidence about this one. Left alone,
   * a resent lead would sit at the top of Call HQ for something it did last
   * month.
   */
  it('starts the open count again rather than carrying the old one', async () => {
    prisma.lead.findMany.mockResolvedValue([CONTACTED]);

    await sendColdDrafts(request({ leadIds: [CONTACTED.id] }));

    const written = prisma.lead.update.mock.calls
      .map((c) => (c as unknown as [{ data: Record<string, unknown> }])[0].data)
      .find((d) => 'coldEmailSentAt' in d);

    expect(written).toMatchObject({
      coldEmailOpens: 0,
      coldEmailOpenedAt: null,
      coldEmailLastOpenedAt: null,
    });
    expect(written?.coldEmailSentAt).toBeInstanceOf(Date);
  });

  /** Still a hard stop — being contactable again is not being contactable. */
  it('is still refused when it is also marked do-not-contact', async () => {
    prisma.lead.findMany.mockResolvedValue([{ ...CONTACTED, doNotContact: true }]);

    const res = await sendColdDrafts(request({ leadIds: [CONTACTED.id] }));
    const data = await res.json();

    expect(sendAsUser).not.toHaveBeenCalled();
    expect(data.results[0].reason).toMatch(/do-not-contact/i);
  });
});
