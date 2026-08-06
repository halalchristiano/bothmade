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
  leadFindUnique.mockReset().mockResolvedValue({ id: 'lead_1', painPoints: 'poor-seo' });
  leadUpdate.mockReset().mockResolvedValue({ id: 'lead_1' });
  activityCreate.mockReset().mockResolvedValue({ id: 'act_1' });
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
