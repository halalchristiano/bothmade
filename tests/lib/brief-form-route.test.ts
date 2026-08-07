import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/public/brief/[token]` is a write into a lead's own brief by somebody
 * who is not logged in — the client, following a link we emailed them. That
 * makes two things worth holding onto.
 *
 * The first is that it cannot damage what is already there. By the time the
 * client answers, a researcher may have worked the lead; the client's answers
 * are added to that, not dropped on top of it.
 *
 * The second is that the token is a capability, not an identity. Anyone
 * holding the link can answer — deliberately, because a business owner
 * forwards it to whoever knows the answers — so the route must reveal nothing
 * back, and must refuse a token it does not recognise.
 */

const leadFindUnique = vi.fn();
const leadUpdate = vi.fn();
const activityCreate = vi.fn();

/**
 * The notification, mocked rather than left to fall over.
 *
 * It used to be neither. `notifyBriefFormCompleted` falls through to
 * `notifyAdmins`, which reads `prisma.user.findMany` — absent from the mock
 * below, so every run of every test in this file threw inside the route's
 * `.catch`, logged "Brief completion notify failed: TypeError", and passed
 * anyway. The one thing this route does for the studio rather than the
 * database — telling somebody a warm lead just answered a page of questions
 * about their own business — was covered by nothing, and the noise it made
 * on every run was the sort you learn to scroll past.
 */
const notifyBriefFormCompleted = vi.fn();
vi.mock('@/lib/notify', () => ({
  notifyBriefFormCompleted: (...args: unknown[]) => notifyBriefFormCompleted(...args),
}));

/** Same reason: the receipt to the client sends a real email otherwise. */
const sendBriefReceivedEmail = vi.fn();
vi.mock('@/lib/email', () => ({
  sendBriefReceivedEmail: (...args: unknown[]) => sendBriefReceivedEmail(...args),
}));

/** Stand-in for the `rate_limits` table, so the limiter takes its real path. */
const rateLimitRows = new Map<string, { count: number; windowStart: Date }>();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead: {
      findUnique: (...args: unknown[]) => leadFindUnique(...args),
      update: (...args: unknown[]) => leadUpdate(...args),
    },
    leadActivity: { create: (...args: unknown[]) => activityCreate(...args) },
    rateLimit: { deleteMany: async () => ({ count: 0 }) },
    $queryRaw: (_sql: TemplateStringsArray, ...params: unknown[]) => {
      const key = params[0] as string;
      const windowMs = params[1] as number;
      const now = Date.now();
      const existing = rateLimitRows.get(key);
      if (!existing || now - existing.windowStart.getTime() >= windowMs) {
        const row = { count: 1, windowStart: new Date(now) };
        rateLimitRows.set(key, row);
        return Promise.resolve([{ ...row }]);
      }
      existing.count += 1;
      return Promise.resolve([{ ...existing }]);
    },
  },
}));

const { POST } = await import('@/app/api/public/brief/[token]/route');

let ip = 0;
function request(body: unknown, headers: Record<string, string> = {}) {
  return {
    json: async () => body,
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
  } as unknown as Parameters<typeof POST>[0];
}
function freshIp() {
  return { 'x-forwarded-for': `198.51.100.${++ip}` };
}
const params = (token = 'tok_1') => Promise.resolve({ token });

const ANSWERS = {
  problems: ['no-booking'],
  answers: { companySize: 'small', timing: 'Yesterday', consequence: 'Wasting staff time' },
  extra: 'We open a second surgery in March.',
};

beforeEach(() => {
  // The whole row the route reads, doNotContact included — it is a hard stop
  // the handler now checks, and a fixture that omits it only passes because
  // undefined happens to be falsy.
  leadFindUnique.mockReset().mockResolvedValue({
    id: 'lead_1',
    painPoints: 'poor-seo',
    email: 'owner@example.com',
    contactName: 'Dana Okafor',
    company: 'Okafor Plumbing',
    doNotContact: false,
    assignedTo: { email: 'evan@bothmade.studio' },
  });
  leadUpdate.mockReset().mockResolvedValue({ id: 'lead_1' });
  activityCreate.mockReset().mockResolvedValue({ id: 'act_1' });
  notifyBriefFormCompleted.mockReset().mockResolvedValue(undefined);
  sendBriefReceivedEmail.mockReset().mockResolvedValue({ sent: true });
});

describe('POST /api/public/brief/[token]', () => {
  it('writes the answers into the columns the brief and the export read', async () => {
    const res = await POST(request(ANSWERS, freshIp()), { params: params() });

    expect(res.status).toBe(200);
    const { data } = leadUpdate.mock.calls[0][0];
    expect(data.companySize).toBe('small');
    expect(data.qualTiming).toContain('Yesterday');
    expect(data.qualNeed).toContain('staff time');
    expect(data.currentSiteAssessment).toContain('We open a second surgery in March.');
  });

  /**
   * The lead may have been researched before the client got round to
   * answering. Their ticks are added to that work, never substituted for it.
   */
  it('adds to the pain points already on the lead rather than replacing them', async () => {
    await POST(request(ANSWERS, freshIp()), { params: params() });

    expect(leadUpdate.mock.calls[0][0].data.painPoints.split(',').sort()).toEqual([
      'no-booking',
      'poor-seo',
    ]);
  });

  it('does not write the same pain point twice when they confirm what we knew', async () => {
    leadFindUnique.mockResolvedValue({ id: 'lead_1', painPoints: 'no-booking' });

    await POST(request(ANSWERS, freshIp()), { params: params() });

    expect(leadUpdate.mock.calls[0][0].data.painPoints).toBe('no-booking');
  });

  /** Answering is a reply. It has to stop the daily follow-up email. */
  it('counts as a reply, so the daily nudge stops', async () => {
    await POST(request(ANSWERS, freshIp()), { params: params() });

    expect(leadUpdate.mock.calls[0][0].data.replyReceivedAt).toBeInstanceOf(Date);
  });

  it('puts it on the timeline, where the rest of this lead’s story is', async () => {
    await POST(request(ANSWERS, freshIp()), { params: params() });

    expect(activityCreate.mock.calls[0][0].data.content).toContain(
      'Client filled in the brief form.'
    );
  });

  /**
   * The point of the route, from the studio's side. Somebody who has just
   * answered a page of questions about their own business is as warm as this
   * gets, and the window on that is hours — so the telling has to happen, and
   * it has to carry enough to act on without opening anything first.
   */
  it('tells the assigned rep, with enough to act on', async () => {
    leadFindUnique.mockResolvedValue({
      id: 'lead_1',
      painPoints: '',
      company: 'Linpotia Dental',
      contactName: 'Sam',
      email: 'sam@linpotia.test',
      assignedTo: { email: 'evan@bothmade.test' },
    });

    await POST(request(ANSWERS, freshIp()), { params: params() });

    expect(notifyBriefFormCompleted).toHaveBeenCalledTimes(1);
    expect(notifyBriefFormCompleted.mock.calls[0][0]).toMatchObject({
      toEmail: 'evan@bothmade.test',
      leadId: 'lead_1',
      company: 'Linpotia Dental',
      contactName: 'Sam',
      problemCount: 1,
    });
  });

  /** No rep on the lead is not a reason for nobody to hear about it. */
  it('still tells somebody when the lead has no rep on it', async () => {
    leadFindUnique.mockResolvedValue({ id: 'lead_1', painPoints: '', company: 'Linpotia Dental' });

    await POST(request(ANSWERS, freshIp()), { params: params() });

    expect(notifyBriefFormCompleted).toHaveBeenCalledTimes(1);
    // Null routes it to notifyAdmins rather than to a named inbox.
    expect(notifyBriefFormCompleted.mock.calls[0][0].toEmail).toBeNull();
  });

  /**
   * The answers are already saved by the time we try to tell anyone. A dead
   * mail provider must not turn a successful write into a 500 the client is
   * invited to retry — they would fill the form in twice and still not know.
   */
  it('still answers 200 when the notification cannot be sent', async () => {
    notifyBriefFormCompleted.mockRejectedValue(new Error('Resend is down'));

    const res = await POST(request(ANSWERS, freshIp()), { params: params() });

    expect(res.status).toBe(200);
    expect(leadUpdate).toHaveBeenCalled();
  });

  it('does not tell anybody about a token it does not recognise', async () => {
    leadFindUnique.mockResolvedValue(null);

    await POST(request(ANSWERS, freshIp()), { params: params('guessed') });

    expect(notifyBriefFormCompleted).not.toHaveBeenCalled();
  });

  it('refuses a token it does not recognise, and says nothing about anybody', async () => {
    leadFindUnique.mockResolvedValue(null);

    const res = await POST(request(ANSWERS, freshIp()), { params: params('guessed') });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(leadUpdate).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toMatch(/lead_1|company|email/i);
  });

  /**
   * An empty submission must not stamp a reply on the lead: that would stop
   * the follow-up for somebody who opened the form and answered nothing.
   */
  it('ignores an empty form rather than recording it as an answer', async () => {
    const res = await POST(request({ problems: [], answers: {} }, freshIp()), { params: params() });

    expect(res.status).toBe(400);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('drops values that were never on the form', async () => {
    await POST(
      request(
        { problems: ['no-booking', 'free-money'], answers: { companySize: 'gigantic' } },
        freshIp()
      ),
      { params: params() }
    );

    const { data } = leadUpdate.mock.calls[0][0];
    expect(data.painPoints.split(',')).not.toContain('free-money');
    expect(data.companySize).toBeUndefined();
  });

  /**
   * Its own budget, not the contact form's. The two happen back to back by
   * design — enquire, get the form, fill it in — so sharing a budget of three
   * means the person we just asked to answer is told to try again later.
   */
  it('does not spend the contact form budget', async () => {
    const { rateLimitKey } = await import('@/lib/rate-limit');
    const req = { headers: { get: () => '198.51.100.1' } };

    expect(rateLimitKey('briefForm', req as never)).not.toBe(
      rateLimitKey('contact', req as never)
    );
  });

  it('survives a body that is not JSON at all', async () => {
    const res = await POST(
      {
        json: async () => {
          throw new Error('not json');
        },
        headers: { get: (k: string) => freshIp()[k.toLowerCase() as 'x-forwarded-for'] ?? null },
      } as unknown as Parameters<typeof POST>[0],
      { params: params() }
    );

    expect(res.status).toBe(400);
  });
});

/**
 * The schema calls `doNotContact` "a hard stop, not a preference — every
 * outreach path checks it before sending or dialling."
 *
 * This handler was not one of them, which cost nothing while it only wrote to
 * the database. It sends the client a receipt now, so an unchecked flag here
 * is an email to somebody who asked us to stop — and a stale tab, opened
 * before the flag was set, is the whole of what it takes.
 *
 * The page at /f/[token] has always refused these. Both halves of the link
 * answer the same way now, in the same words an unknown token gets: which of
 * the two it is says something about a person, and this endpoint answers to
 * anybody holding a URL.
 */
describe('a lead who asked to be left alone', () => {
  beforeEach(() => {
    leadFindUnique.mockResolvedValue({
      id: 'lead_1',
      painPoints: 'poor-seo',
      email: 'owner@example.com',
      contactName: 'Dana Okafor',
      company: 'Okafor Plumbing',
      doNotContact: true,
      assignedTo: { email: 'evan@bothmade.studio' },
    });
  });

  it('is never emailed a receipt', async () => {
    await POST(request(ANSWERS, freshIp()), { params: params() });

    expect(sendBriefReceivedEmail).not.toHaveBeenCalled();
  });

  it('is refused, and told only what an unknown token is told', async () => {
    const res = await POST(request(ANSWERS, freshIp()), { params: params() });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe('That link is no longer valid.');
    // Nothing that lets a holder of the link tell "no such lead" from "that
    // lead asked us to stop".
    expect(JSON.stringify(body)).not.toMatch(/contact|suppress|blocked|opted/i);
  });

  it('writes nothing to the lead', async () => {
    await POST(request(ANSWERS, freshIp()), { params: params() });

    expect(leadUpdate).not.toHaveBeenCalled();
    expect(activityCreate).not.toHaveBeenCalled();
  });
});
