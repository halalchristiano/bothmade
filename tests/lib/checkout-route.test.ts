import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/checkout` is unauthenticated and public — anything the browser posts
 * lands here. These tests are about what it refuses, and about the amount it
 * hands Stripe when it does not refuse, because that amount is the charge.
 */

const createCheckoutSession = vi.fn();
vi.mock('@/lib/stripe', () => ({
  createCheckoutSession: (...args: unknown[]) => createCheckoutSession(...args),
}));

const leadFindFirst = vi.fn();
const leadCreate = vi.fn();
const leadUpdate = vi.fn();
const activityCreate = vi.fn();
const userFindFirst = vi.fn();
/**
 * Stand-in for the `rate_limits` table, so the limiter takes its real path.
 *
 * Without it `prisma.$queryRaw` is undefined, the DB counter throws, and
 * `enforceRateLimit` quietly falls back to its in-memory window — logging
 * "[rate-limit] database counter failed" on every single test in this file
 * and passing regardless. So the budget on the one route in the app that
 * opens a payment session was, in tests, only ever the fallback that exists
 * for when Postgres is down. The counter that actually runs in production —
 * the shared one, the only one that means anything across serverless
 * instances — was exercised here by nothing.
 */
const rateLimitRows = new Map<string, { count: number; windowStart: Date }>();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead: {
      findFirst: (...args: unknown[]) => leadFindFirst(...args),
      create: (...args: unknown[]) => leadCreate(...args),
      update: (...args: unknown[]) => leadUpdate(...args),
    },
    leadActivity: { create: (...args: unknown[]) => activityCreate(...args) },
    user: { findFirst: (...args: unknown[]) => userFindFirst(...args) },
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

const { POST } = await import('@/app/api/checkout/route');
const { calculatePrice } = await import('@/lib/pricing');

/** Minimal stand-in for the NextRequest the route actually reads from. */
/*
 * A different caller every time.
 *
 * The route budgets by address now, and the limiter's store outlives a single
 * test — so a shared IP means the tenth case in this file gets a 429 instead
 * of whatever it was actually asserting. Each request comes from its own
 * address, which is also closer to the truth: these are unrelated visitors.
 */
let caller = 0;

function request(body: unknown) {
  caller += 1;
  return {
    json: async () => body,
    headers: new Headers({ 'x-forwarded-for': `198.51.100.${caller}` }),
  } as Parameters<typeof POST>[0];
}

const VALID = {
  baseService: 'website',
  addOns: ['seo'],
  clientType: 'smb',
  timeline: 'standard',
  clientEmail: 'frell@linpotia.com',
  company: 'Linpotia Cafe',
};

beforeEach(() => {
  createCheckoutSession.mockReset();
  createCheckoutSession.mockResolvedValue({ sessionId: 'cs_test_1', url: 'https://stripe.test/pay' });
  leadFindFirst.mockReset().mockResolvedValue(null);
  leadCreate.mockReset().mockResolvedValue({ id: 'lead_checkout' });
  leadUpdate.mockReset().mockResolvedValue({ id: 'lead_checkout' });
  activityCreate.mockReset().mockResolvedValue({ id: 'act_1' });
  userFindFirst.mockReset().mockResolvedValue({
    id: 'user_evan',
    email: 'evan@bothmade.studio',
    name: 'Evan',
  });
});

describe('POST /api/checkout — rejections', () => {
  it('requires an email and a company', async () => {
    for (const missing of ['clientEmail', 'company']) {
      const body = { ...VALID, [missing]: '' };
      const res = await POST(request(body));
      expect(res.status, missing).toBe(400);
    }
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects an unknown base service', async () => {
    const res = await POST(request({ ...VALID, baseService: 'spaceship' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid base service' });
  });

  it('rejects a prototype property posing as a base service', async () => {
    // `'constructor' in BASE_SERVICES` is true; the guard must not be.
    const res = await POST(request({ ...VALID, baseService: 'constructor' }));
    expect(res.status).toBe(400);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects a prototype property hidden among the add-ons', async () => {
    // This is the case that would otherwise reach `ADD_ONS['toString'].price`
    // and turn the Stripe unit_amount into NaN.
    const res = await POST(request({ ...VALID, addOns: ['seo', 'toString'] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid add-ons' });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects an unknown client type or timeline', async () => {
    expect((await POST(request({ ...VALID, clientType: 'mega-corp' }))).status).toBe(400);
    expect((await POST(request({ ...VALID, timeline: 'yesterday' }))).status).toBe(400);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects add-ons that are not an array of strings', async () => {
    expect((await POST(request({ ...VALID, addOns: 'seo' }))).status).toBe(400);
    expect((await POST(request({ ...VALID, addOns: [1, 2] }))).status).toBe(400);
    expect((await POST(request({ ...VALID, addOns: [null] }))).status).toBe(400);
  });

  it('returns 500 rather than a broken redirect when Stripe declines to open a session', async () => {
    createCheckoutSession.mockResolvedValue(null);
    const res = await POST(request(VALID));
    expect(res.status).toBe(500);
  });

  it('does not leak an internal error to the caller', async () => {
    createCheckoutSession.mockRejectedValue(new Error('stripe key sk_live_abc is invalid'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(request(VALID));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });

  it('returns 500 instead of throwing on a malformed body', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST({
      json: async () => {
        throw new SyntaxError('bad json');
      },
    } as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(500);
  });
});

describe('POST /api/checkout — the happy path', () => {
  it('passes the validated selection straight through to Stripe', async () => {
    const res = await POST(request(VALID));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      sessionId: 'cs_test_1',
      redirectUrl: 'https://stripe.test/pay',
    });

    const [input, successUrl, cancelUrl] = createCheckoutSession.mock.calls[0];
    expect(input).toMatchObject({
      baseService: 'website',
      addOns: ['seo'],
      clientType: 'smb',
      timeline: 'standard',
      clientEmail: 'frell@linpotia.com',
      company: 'Linpotia Cafe',
    });
    // type=welcome, because the success page is also where balance payments
    // land: without it a first-time buyer would be shown the returning-client
    // copy and never told a password was emailed to them.
    expect(successUrl).toContain('/checkout/success?type=welcome&session_id={CHECKOUT_SESSION_ID}');
    expect(cancelUrl).toContain('/start');
  });

  it('defaults add-ons to none when the field is omitted', async () => {
    const { addOns, ...withoutAddOns } = VALID;
    void addOns;
    const res = await POST(request(withoutAddOns));

    expect(res.status).toBe(200);
    expect(createCheckoutSession.mock.calls[0][0].addOns).toEqual([]);
  });

  it('hands Stripe a selection that prices to a whole number of cents', async () => {
    await POST(request({ ...VALID, clientType: 'enterprise', timeline: 'rush' }));

    const input = createCheckoutSession.mock.calls[0][0];
    const { totalPrice } = calculatePrice({
      baseService: input.baseService,
      addOns: input.addOns,
      clientType: input.clientType,
      timeline: input.timeline,
    });
    expect(Number.isInteger(totalPrice)).toBe(true);
    expect(totalPrice).toBeGreaterThan(0);
  });
});

/**
 * The gap this closes: someone who configured a project, filled in their
 * details and clicked the money button used to leave no trace whatsoever if
 * they hesitated on the Stripe page. Highest-intent visitor on the site,
 * completely invisible.
 */
describe('POST /api/checkout — capturing the attempt', () => {
  it('records the attempt as a lead before handing off to Stripe', async () => {
    await POST(request(VALID));

    expect(leadCreate).toHaveBeenCalledOnce();
    const { data } = leadCreate.mock.calls[0][0];
    expect(data).toMatchObject({
      company: 'Linpotia Cafe',
      email: 'frell@linpotia.com',
      source: 'checkout-started',
      assignedToId: 'user_evan',
    });
    expect(data.estimatedValue).toBe(calculatePrice({
      baseService: 'website',
      addOns: ['seo'],
      clientType: 'smb',
      timeline: 'standard',
    }).totalPrice);
    expect(data.notes).toContain('Reached Stripe checkout');
  });

  it('keeps the lead at "new" so an idle click cannot book itself as revenue', async () => {
    // deposit_pending carries a 0.95 weight in the sales forecast; reaching
    // the payment page is intent, not a commitment.
    await POST(request(VALID));

    expect(leadCreate.mock.calls[0][0].data.status).toBe('new');
  });

  it('threads the lead id through Stripe so payment promotes that same row', async () => {
    await POST(request(VALID));

    expect(createCheckoutSession.mock.calls[0][0].leadId).toBe('lead_checkout');
  });

  it('logs against an existing lead rather than duplicating, and leaves its status alone', async () => {
    leadFindFirst.mockResolvedValue({ id: 'lead_known' });

    await POST(request(VALID));

    expect(leadCreate).not.toHaveBeenCalled();
    expect(activityCreate.mock.calls[0][0].data.leadId).toBe('lead_known');
    // A second attempt must never walk a won deal backwards.
    expect(leadUpdate.mock.calls[0][0].data.status).toBeUndefined();
    expect(createCheckoutSession.mock.calls[0][0].leadId).toBe('lead_known');
  });

  it('still opens checkout when the CRM write fails', async () => {
    // A database outage must not stop someone from paying us.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    leadCreate.mockRejectedValue(new Error('connection refused'));

    const res = await POST(request(VALID));

    expect(res.status).toBe(200);
    expect(createCheckoutSession).toHaveBeenCalled();
    expect(createCheckoutSession.mock.calls[0][0].leadId).toBeUndefined();
  });
});

/**
 * `new Resend(undefined)` throws. Building the client at module scope would
 * therefore turn a missing RESEND_API_KEY into an import-time crash for every
 * route that transitively touches lib/email — including this one, whose real
 * job is taking money and has nothing to do with sending mail.
 */
/**
 * The budget on the one route in the app that opens a payment session.
 *
 * Every test above deliberately arrives from a fresh address so the limiter
 * cannot interfere with what it is asserting — which left nothing at all
 * asserting the limiter. It was also, until the `$queryRaw` stand-in above,
 * silently running the in-memory fallback rather than the shared counter that
 * production actually uses.
 */
describe('POST /api/checkout — the budget', () => {
  /*
   * One address per test, hammering — not one address for the whole block.
   *
   * These cases share a limiter whose counters outlive a test, and one of
   * them deliberately spends its allowance to the last request. On a single
   * hardcoded address that only works in the order they are written in: run
   * the exhausting case first and the next one is refused on request one,
   * asserting a budget somebody else already spent. `--sequence.shuffle`
   * failed exactly that way.
   *
   * A fresh address each test keeps "the same caller, hammering" true inside
   * a test and false across them, which is what these are actually about.
   */
  let caller = 0;
  beforeEach(() => {
    caller += 1;
  });

  /** One address, hammering. `publicWrite` allows ten in ten minutes. */
  const sameCaller = (body: unknown) =>
    ({
      json: async () => body,
      headers: new Headers({ 'x-forwarded-for': `203.0.113.${caller}` }),
    }) as Parameters<typeof POST>[0];

  it('opens checkout up to the limit, then refuses', async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await POST(sameCaller(VALID));
      expect(res.status, `request ${i + 1} of the allowance`).toBe(200);
    }

    const refused = await POST(sameCaller(VALID));

    expect(refused.status).toBe(429);
  });

  it('says how long to wait, rather than only refusing', async () => {
    // A 429 with nothing on it is indistinguishable from the site being
    // broken; the header is what makes it a queue rather than a wall.
    for (let i = 0; i < 11; i += 1) await POST(sameCaller(VALID));
    const refused = await POST(sameCaller(VALID));

    const retryAfter = Number(refused.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(10 * 60);
  });

  it('does not spend one caller’s budget on everybody else', async () => {
    for (let i = 0; i < 11; i += 1) await POST(sameCaller(VALID));

    // A different visitor, arriving while the first is locked out.
    const other = await POST(request(VALID));

    expect(other.status).toBe(200);
  });
});

describe('POST /api/checkout — no mail configured', () => {
  it('still opens checkout and still records the lead', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(request(VALID));

    expect(res.status).toBe(200);
    expect(leadCreate).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });
});
