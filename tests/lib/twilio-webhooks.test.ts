import { createHmac } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The two endpoints a carrier calls, and the one thing they must never do.
 *
 * These are public by necessity — Twilio has to be able to reach them — and
 * one of them answers with an instruction to dial a number. An unverified
 * version could be made to ring anywhere on earth at our expense, which is the
 * entire reason toll fraud is a category. Everything else here is bookkeeping;
 * the signature check is the part that costs money to get wrong.
 */

const prisma = {
  lead: { findUnique: vi.fn(async (_a: unknown) => null as unknown) },
  phoneCall: {
    updateMany: vi.fn(async (_a: unknown) => ({ count: 1 })),
    findUnique: vi.fn(async (_a: unknown) => null as unknown),
  },
  leadActivity: { create: vi.fn(async (_a: unknown) => ({})) },
};

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/site-url', () => ({ resolveSiteUrl: () => 'https://bothmade.studio' }));

const TOKEN = 'tok_test';
process.env.TWILIO_ACCOUNT_SID = 'AC_test';
process.env.TWILIO_AUTH_TOKEN = TOKEN;
process.env.TWILIO_FROM_NUMBER = '+15005550006';

const voice = await import('@/app/api/twilio/voice/route');
const dialed = await import('@/app/api/twilio/dialed/route');

const sign = (url: string, params: Record<string, string>) =>
  createHmac('sha1', TOKEN)
    .update(
      Buffer.from(
        Object.keys(params)
          .sort()
          .reduce((acc, k) => acc + k + params[k], url),
        'utf-8'
      )
    )
    .digest('base64');

/** A request shaped exactly as Twilio sends one. */
const twilioPost = (path: string, params: Record<string, string>, signature?: string | null) => {
  const url = `https://bothmade.studio${path}`;
  const body = new URLSearchParams(params);
  const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' });
  const sig = signature === undefined ? sign(url, params) : signature;
  if (sig !== null) headers.set('x-twilio-signature', sig);
  return new Request(url, { method: 'POST', body, headers });
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.lead.findUnique.mockResolvedValue({
    company: 'Ridgeline Roofing',
    phone: '(212) 555-0100',
    doNotContact: false,
  });
  prisma.phoneCall.findUnique.mockResolvedValue({ leadId: 'lead_1', placedById: 'user_evan' });
});

describe('the endpoint that says which number to dial', () => {
  const path = '/api/twilio/voice?leadId=lead_1';

  it('dials the lead when the request is genuinely from Twilio', async () => {
    const res = await voice.POST(twilioPost(path, { CallSid: 'CA1' }) as never);
    const xml = await res.text();

    expect(res.status).toBe(200);
    expect(xml).toContain('<Dial');
    expect(xml).toContain('+12125550100');
  });

  /**
   * The attack this whole file exists for. Without the check, anybody who
   * found this URL could make our account ring any number on earth.
   */
  it('refuses an unsigned request', async () => {
    const res = await voice.POST(twilioPost(path, { CallSid: 'CA1' }, null) as never);

    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('<Dial');
  });

  it('refuses a forged signature', async () => {
    const res = await voice.POST(twilioPost(path, { CallSid: 'CA1' }, 'made-up') as never);

    expect(res.status).toBe(403);
  });

  /**
   * The number is looked up from the lead id rather than read out of the URL.
   * A number in a query string is a number an attacker can change; an id is
   * only a key to a row we control.
   */
  it('never dials a number supplied in the request', async () => {
    const res = await voice.POST(
      twilioPost(path, { CallSid: 'CA1', To: '+447700900000' }) as never
    );
    const xml = await res.text();

    expect(xml).not.toContain('+447700900000');
    expect(xml).toContain('+12125550100');
  });

  /** The same hard stop every other outreach path checks. */
  it('will not dial somebody who asked to be left alone', async () => {
    prisma.lead.findUnique.mockResolvedValue({
      company: 'Ridgeline',
      phone: '(212) 555-0100',
      doNotContact: true,
    });

    const xml = await (await voice.POST(twilioPost(path, { CallSid: 'CA1' }) as never)).text();

    expect(xml).not.toContain('<Dial');
  });

  /**
   * Spoken, not silent. The rep has a phone to their ear at this exact
   * moment; a hang-up with no explanation is indistinguishable from a broken
   * network, and they will simply try again, at cost.
   */
  it('says why rather than hanging up on the rep', async () => {
    prisma.lead.findUnique.mockResolvedValue(null);

    const xml = await (await voice.POST(twilioPost(path, { CallSid: 'CA1' }) as never)).text();

    expect(xml).toContain('<Say');
    expect(xml).not.toContain('<Dial');
  });

  /**
   * The second leg's result is the entire reason for routing through a
   * carrier — the first leg only ever describes the rep's own phone.
   */
  it('asks to be told what happened to the leg that matters', async () => {
    const xml = await (await voice.POST(twilioPost(path, { CallSid: 'CA1' }) as never)).text();

    expect(xml).toContain('/api/twilio/dialed');
  });
});

describe('the endpoint that records what happened', () => {
  const path = '/api/twilio/dialed?leadId=lead_1';

  const report = (params: Record<string, string>) =>
    dialed.POST(twilioPost(path, params) as never);

  const written = () =>
    (prisma.phoneCall.updateMany.mock.calls[0]![0] as { data: Record<string, unknown> }).data;

  it('records a conversation with its length', async () => {
    await report({ CallSid: 'CA1', DialCallStatus: 'completed', DialCallDuration: '214' });

    expect(written()).toMatchObject({ status: 'completed', durationSeconds: 214 });
    expect(written().answeredAt).toBeInstanceOf(Date);
  });

  it('records a call nobody picked up as exactly that', async () => {
    await report({ CallSid: 'CA1', DialCallStatus: 'no-answer', DialCallDuration: '0' });

    expect(written()).toMatchObject({ status: 'no-answer', answeredAt: null });
    expect(written().failureReason).toBeTruthy();
  });

  /**
   * The line somebody reads before the next call, written only for calls that
   * connected. A timeline full of unanswered rings buries the conversations
   * that did happen — and those are already visible as attempts on the dial
   * log.
   */
  it('writes a timeline entry for a call that connected', async () => {
    await report({ CallSid: 'CA1', DialCallStatus: 'completed', DialCallDuration: '214' });

    const data = (prisma.leadActivity.create.mock.calls[0]![0] as { data: Record<string, string> })
      .data;
    expect(data.type).toBe('call');
    expect(data.content).toContain('3m 34s');
    expect(data.createdById).toBe('user_evan');
  });

  it('writes nothing to the timeline for a ring-out', async () => {
    await report({ CallSid: 'CA1', DialCallStatus: 'no-answer', DialCallDuration: '0' });

    expect(prisma.leadActivity.create).not.toHaveBeenCalled();
  });

  /**
   * Providers retry. A retry has to land on the row already written rather
   * than throwing on a SID this deployment has never seen — which is what a
   * webhook for somebody else's environment looks like.
   */
  it('matches on the provider id rather than creating a second row', async () => {
    await report({ CallSid: 'CA1', DialCallStatus: 'completed', DialCallDuration: '30' });

    expect(
      (prisma.phoneCall.updateMany.mock.calls[0]![0] as { where: Record<string, string> }).where
    ).toEqual({ providerSid: 'CA1' });
  });

  it('refuses an unsigned report', async () => {
    const res = await dialed.POST(
      twilioPost(path, { CallSid: 'CA1', DialCallStatus: 'completed' }, null) as never
    );

    expect(res.status).toBe(403);
    expect(prisma.phoneCall.updateMany).not.toHaveBeenCalled();
  });

  /** Garbage in a duration field must not become a number in the record. */
  it('stores no duration rather than a wrong one', async () => {
    await report({ CallSid: 'CA1', DialCallStatus: 'completed', DialCallDuration: 'ages' });

    expect(written().durationSeconds).toBeNull();
  });
});
