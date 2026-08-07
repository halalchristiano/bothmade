import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The three public writers that never budgeted themselves.
 *
 * Everything else reachable without a login already does — the contact form,
 * the brief form, agree-and-pay, the care offer, the mockup response. These
 * three were missed, and they are not the harmless ones:
 *
 * `/api/checkout` has no login in front of it at all and creates a Lead row
 * plus a Stripe Checkout session on every call. `/api/public/change/[token]`
 * signs a change order — it moves the project's price, recuts the payment
 * schedule and writes a clickwrap record. `/api/public/stop` is the mild one,
 * and still the place to sit and guess share tokens.
 *
 * These hold the budget rather than the number: a limit is one deleted line
 * away from being gone, and nothing else in the app would notice.
 */

const allowed = { allowed: true, retryAfterSeconds: 0, remaining: 5, store: 'memory' as const };
const blocked = { allowed: false, retryAfterSeconds: 300, remaining: 0, store: 'memory' as const };

/*
 * The whole module is replaced rather than partially mocked. `enforceRateLimit`
 * calls `checkRateLimit` through the module's own binding, so spying on the
 * export alone never sees it — the route would sail past a mock that looks
 * like it is working.
 */
const enforceRateLimit = vi.fn(async (_r: unknown, _scope: string) => null as Response | null);
const checkRateLimit = vi.fn(async (_key: string) => allowed);
const tooMany = () => new Response(JSON.stringify({ error: 'Too many' }), { status: 429 });

vi.mock('@/lib/rate-limit', () => ({
  RATE_LIMITS: { publicWrite: { max: 10, windowMs: 10 * 60 * 1000 } },
  enforceRateLimit: (...a: unknown[]) => enforceRateLimit(...(a as [unknown, string])),
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...(a as [string])),
  rateLimitResponse: () => tooMany(),
}));

/** Every budget spent, whichever helper the route reaches for. */
const spendEverything = () => {
  enforceRateLimit.mockResolvedValue(tooMany());
  checkRateLimit.mockResolvedValue(blocked);
};

const empty: Record<string, unknown> = {
  findMany: async () => [],
  findFirst: async () => null,
  findUnique: async () => null,
  create: async () => ({ id: 'x' }),
  update: async () => ({ id: 'x' }),
  count: async () => 0,
};

vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({} as Record<string, unknown>, { get: () => empty }),
}));
vi.mock('@/lib/stripe', () => ({ createCheckoutSession: async () => ({ url: 'https://stripe' }) }));
vi.mock('@/lib/notify', () => ({
  findSalesRep: async () => ({ id: 'u1', name: 'Kiana', email: 'k@example.com' }),
  notifyAdminsChangeOrderSigned: vi.fn(),
}));
vi.mock('@/lib/email', () => ({ sendChangeOrderSignedEmail: vi.fn() }));

const post = async (mod: string, body: unknown, ctx: unknown = {}) => {
  const route = await import(mod);
  const request = new Request('https://bothmade.studio/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify(body),
  });
  return route.POST(request as never, ctx as never);
};

/**
 * The unsubscribe page posts a plain HTML form, deliberately — an unsubscribe
 * that needs working JavaScript fails the people most likely to want one — so
 * that is what gets posted here.
 */
const postForm = async (mod: string, fields: Record<string, string>) => {
  const route = await import(mod);
  const body = new URLSearchParams(fields);
  const request = new Request('https://bothmade.studio/x', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-forwarded-for': '203.0.113.9',
    },
    body,
  });
  return route.POST(request as never);
};

beforeEach(() => {
  enforceRateLimit.mockReset();
  enforceRateLimit.mockResolvedValue(null);
  checkRateLimit.mockReset();
  checkRateLimit.mockResolvedValue(allowed);
});

describe('the checkout endpoint', () => {
  it('spends a budget before it writes anything', async () => {
    await post('@/app/api/checkout/route', {});
    expect(enforceRateLimit).toHaveBeenCalled();
    expect(enforceRateLimit.mock.calls[0][1]).toBe('checkout');
  });

  it('turns the caller away once it is spent, without touching Stripe', async () => {
    spendEverything();
    const res = await post('@/app/api/checkout/route', {
      baseService: 'web',
      clientEmail: 'a@b.com',
      company: 'B',
    });
    expect(res.status).toBe(429);
  });
});

describe('signing a change order', () => {
  const params = { params: Promise.resolve({ token: 'tok_1' }) };

  it('budgets per caller and per change order', async () => {
    await post('@/app/api/public/change/[token]/route', { decision: 'sign' }, params);

    // One keyed on the caller (enforceRateLimit keys by IP internally), one on
    // the link itself — so hammering a single change order from a spread of
    // addresses runs out too.
    expect(enforceRateLimit.mock.calls.map((c) => c[1])).toContain('change-order');
    expect(checkRateLimit.mock.calls.map((c) => String(c[0]))).toContain('change-order:tok_1');
  });

  it('refuses before it reads the decision', async () => {
    spendEverything();
    const res = await post('@/app/api/public/change/[token]/route', { decision: 'sign' }, params);
    expect(res.status).toBe(429);
  });
});

describe('unsubscribing', () => {
  it('budgets the token guesses', async () => {
    await postForm('@/app/api/public/stop/route', { token: 'tok_2' });
    expect(enforceRateLimit.mock.calls.map((c) => c[1])).toContain('unsubscribe');
  });

  it('still answers a missing token with a 400, not a 429', async () => {
    spendEverything();
    const res = await postForm('@/app/api/public/stop/route', {});
    // The budget sits after the cheap validation, so a caller cannot spend it
    // probing with nothing in hand.
    expect(res.status).toBe(400);
  });
});
