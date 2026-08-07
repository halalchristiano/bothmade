import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Placing a call the phone network will report back on.
 *
 * Everything here is a refusal. Once this endpoint succeeds a real phone
 * somewhere rings and money is spent, so what matters is the set of cases
 * where it declines to — a do-not-contact lead, a number nobody could dial,
 * a rep who has not said where to reach them.
 */

const prisma = {
  lead: { findUnique: vi.fn(async (_a: unknown) => null as unknown) },
  user: { findUnique: vi.fn(async (_a: unknown) => null as unknown) },
  phoneCall: { create: vi.fn(async (_a: unknown) => ({ id: 'pc_1', status: 'queued' })) },
  leadActivity: { create: vi.fn(async (_a: unknown) => ({})) },
};

const placeBridgedCall = vi.fn(async (_a: unknown) => ({ sid: 'CA123', status: 'queued' }));

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ userId: 'user_evan' }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));
vi.mock('@/lib/site-url', () => ({ resolveSiteUrl: () => 'https://bothmade.studio' }));
vi.mock('@/lib/twilio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/twilio')>()),
  placeBridgedCall,
}));

process.env.TWILIO_ACCOUNT_SID = 'AC_test';
process.env.TWILIO_AUTH_TOKEN = 'tok_test';
process.env.TWILIO_FROM_NUMBER = '+15005550006';

const { POST } = await import('@/app/api/admin/leads/[leadId]/call/route');

const call = async () => {
  const res = await POST(new Request('https://x/api', { method: 'POST' }) as never, {
    params: Promise.resolve({ leadId: 'lead_1' }),
  });
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.lead.findUnique.mockResolvedValue({
    id: 'lead_1',
    company: 'Ridgeline Roofing',
    phone: '(212) 555-0100',
    doNotContact: false,
  });
  prisma.user.findUnique.mockResolvedValue({ callbackNumber: '+447496815847' });
  placeBridgedCall.mockResolvedValue({ sid: 'CA123', status: 'queued' });
});

describe('placing one', () => {
  it('rings the rep and records the call before anything happens', async () => {
    const { status, body } = await call();

    expect(status).toBe(201);
    expect(body.to).toBe('+12125550100');

    const args = placeBridgedCall.mock.calls[0]![0] as Record<string, string>;
    expect(args.agentNumber).toBe('+447496815847');
    expect(args.answerUrl).toContain('/api/twilio/voice?leadId=lead_1');
  });

  /**
   * The row has to exist before the webhooks arrive keyed on the SID.
   * Creating it on the first webhook instead would lose every call whose
   * webhook was late, lost or refused — and those are exactly the calls
   * somebody would later swear they made.
   */
  it('writes the row against the provider id', async () => {
    await call();

    const data = (prisma.phoneCall.create.mock.calls[0]![0] as { data: Record<string, string> })
      .data;
    expect(data).toMatchObject({
      leadId: 'lead_1',
      placedById: 'user_evan',
      providerSid: 'CA123',
      toNumber: '+12125550100',
    });
  });

  /**
   * One definition of "a number was dialled", whichever way it was dialled.
   * Without this a network call would count as neither dialled nor written up
   * on the dashboard — the better route would have made somebody's day look
   * emptier than the worse one, which is precisely backwards.
   */
  it('counts on the dashboard the same as tapping the dial link', async () => {
    await call();

    const data = (prisma.leadActivity.create.mock.calls[0]![0] as { data: Record<string, string> })
      .data;
    expect(data.type).toBe('dial');
    expect(data.createdById).toBe('user_evan');
  });
});

describe('what it refuses to dial', () => {
  /** The most intrusive possible way to ignore somebody asking to be left alone. */
  it('a lead who asked not to be contacted', async () => {
    prisma.lead.findUnique.mockResolvedValue({
      id: 'lead_1',
      company: 'Ridgeline',
      phone: '(212) 555-0100',
      doNotContact: true,
    });

    const { status } = await call();

    expect(status).toBe(400);
    expect(placeBridgedCall).not.toHaveBeenCalled();
  });

  it('a number no carrier would accept', async () => {
    prisma.lead.findUnique.mockResolvedValue({
      id: 'lead_1',
      company: 'Ridgeline',
      phone: 'ask for Dave',
      doNotContact: false,
    });

    const { status, body } = await call();

    expect(status).toBe(400);
    expect(body.error).toContain('ask for Dave');
    expect(placeBridgedCall).not.toHaveBeenCalled();
  });

  /**
   * Refused rather than guessed. There is no sensible default — dialling the
   * wrong handset means a stranger's phone rings and a lead hears a confused
   * hello — so the error carries the fix.
   */
  it('a rep who has not said where to ring them', async () => {
    prisma.user.findUnique.mockResolvedValue({ callbackNumber: null });

    const { status, body } = await call();

    expect(status).toBe(400);
    expect(body.needsCallbackNumber).toBe(true);
    expect(body.error).toMatch(/settings/i);
    expect(placeBridgedCall).not.toHaveBeenCalled();
  });

  /** Nothing anywhere is recorded for a call that never went out. */
  it('records nothing at all when it refuses', async () => {
    prisma.user.findUnique.mockResolvedValue({ callbackNumber: null });

    await call();

    expect(prisma.phoneCall.create).not.toHaveBeenCalled();
    expect(prisma.leadActivity.create).not.toHaveBeenCalled();
  });
});

describe('when the carrier refuses', () => {
  /**
   * "The 'To' number is not a valid phone number" names the fix. "The call
   * failed" sends somebody hunting while a lead waits.
   */
  it('passes the provider wording straight through', async () => {
    placeBridgedCall.mockRejectedValue(new Error("The 'To' number is unverified."));

    const { status, body } = await call();

    expect(status).toBe(502);
    expect(body.error).toContain('unverified');
    expect(prisma.phoneCall.create).not.toHaveBeenCalled();
  });
});
