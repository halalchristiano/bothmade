import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RATE_LIMITS,
  __resetInMemoryRateLimits,
  checkRateLimit,
  clientIp,
  enforceRateLimit,
  hasDurableRateLimitStore,
  rateLimitKey,
  rateLimitResponse,
} from '@/lib/rate-limit';
import type { NextRequest } from 'next/server';

/**
 * This is the only thing standing between a script and an unlimited number
 * of password guesses against the admin login, so the cases that matter are
 * the unhappy ones: what happens when Redis is missing, slow, or lying.
 */

function request(headers: Record<string, string> = {}): NextRequest {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

/** Builds an Upstash pipeline response for a given post-increment count. */
function upstashReply(count: number, pttl = 60_000) {
  return {
    ok: true,
    json: async () => [{ result: count }, { result: 1 }, { result: pttl }],
  };
}

beforeEach(() => {
  __resetInMemoryRateLimits();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the in-memory window (no Redis configured)', () => {
  const rule = { max: 3, windowMs: 60_000 };

  it('allows up to the limit and then blocks', async () => {
    for (let i = 0; i < rule.max; i++) {
      expect((await checkRateLimit('k', rule)).allowed, `request ${i + 1}`).toBe(true);
    }
    expect((await checkRateLimit('k', rule)).allowed).toBe(false);
  });

  it('reports itself as the in-memory store', async () => {
    expect((await checkRateLimit('k', rule)).store).toBe('memory');
    expect(hasDurableRateLimitStore()).toBe(false);
  });

  it('gives each key its own budget', async () => {
    for (let i = 0; i < rule.max; i++) await checkRateLimit('a', rule);
    expect((await checkRateLimit('a', rule)).allowed).toBe(false);
    expect((await checkRateLimit('b', rule)).allowed).toBe(true);
  });

  it('returns a positive retry-after once blocked', async () => {
    for (let i = 0; i < rule.max; i++) await checkRateLimit('k', rule);
    const blocked = await checkRateLimit('k', rule);

    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(rule.windowMs / 1000);
  });

  it('lets the caller back in once the window has slid past', async () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < rule.max; i++) await checkRateLimit('k', rule);
      expect((await checkRateLimit('k', rule)).allowed).toBe(false);

      vi.advanceTimersByTime(rule.windowMs + 1);

      expect((await checkRateLimit('k', rule)).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not count blocked attempts against the window, so a flood cannot extend the block', async () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < rule.max; i++) await checkRateLimit('k', rule);

      // Hammer it for most of the window.
      vi.advanceTimersByTime(rule.windowMs - 1000);
      for (let i = 0; i < 50; i++) await checkRateLimit('k', rule);

      // The original window still expires on schedule.
      vi.advanceTimersByTime(1001);
      expect((await checkRateLimit('k', rule)).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the Redis store', () => {
  const rule = { max: 5, windowMs: 60_000 };

  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token123';
  });

  it('is reported as durable once configured', () => {
    expect(hasDurableRateLimitStore()).toBe(true);
  });

  it('allows while the count is within the limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => upstashReply(3)));

    const result = await checkRateLimit('k', rule);

    expect(result).toMatchObject({ allowed: true, store: 'redis' });
  });

  it('allows the request that exactly reaches the limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => upstashReply(rule.max)));
    expect((await checkRateLimit('k', rule)).allowed).toBe(true);
  });

  it('blocks the one after, and derives retry-after from the key TTL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => upstashReply(rule.max + 1, 42_000)));

    const result = await checkRateLimit('k', rule);

    expect(result).toMatchObject({ allowed: false, store: 'redis' });
    expect(result.retryAfterSeconds).toBe(42);
  });

  it('counts and expires atomically in one round trip', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => upstashReply(1));
    vi.stubGlobal('fetch', fetchMock);

    await checkRateLimit('rl:login:1.2.3.4', rule);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://redis.test/pipeline');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token123');
    expect(JSON.parse(init.body as string)).toEqual([
      ['INCR', 'rl:login:1.2.3.4'],
      ['PEXPIRE', 'rl:login:1.2.3.4', '60000', 'NX'],
      ['PTTL', 'rl:login:1.2.3.4'],
    ]);
  });

  it('tolerates a trailing slash on the configured URL', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test/';
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => upstashReply(1));
    vi.stubGlobal('fetch', fetchMock);

    await checkRateLimit('k', rule);

    expect(fetchMock.mock.calls[0]![0]).toBe('https://redis.test/pipeline');
  });

  it('falls back to a sane retry-after when the TTL is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ result: rule.max + 1 }, { result: 0 }, { result: -1 }],
      }))
    );

    const result = await checkRateLimit('k', rule);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(60);
  });
});

describe('when Redis is configured but unhealthy', () => {
  const rule = { max: 2, windowMs: 60_000 };

  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token123';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  const unhealthy: Array<[string, () => unknown]> = [
    ['the request throws', () => { throw new TypeError('network down'); }],
    ['it times out', () => { throw new DOMException('The operation was aborted', 'TimeoutError'); }],
    ['it returns a non-2xx', () => ({ ok: false, json: async () => ({}) })],
    ['the body is not a pipeline array', () => ({ ok: true, json: async () => ({ error: 'nope' }) })],
    ['a pipeline step reports an error', () => ({
      ok: true,
      json: async () => [{ error: 'WRONGTYPE' }, { result: 1 }, { result: 1 }],
    })],
    ['the count is not a number', () => ({
      ok: true,
      json: async () => [{ result: 'banana' }, { result: 1 }, { result: 1 }],
    })],
  ];

  for (const [description, impl] of unhealthy) {
    it(`degrades to the in-memory window when ${description}`, async () => {
      __resetInMemoryRateLimits();
      vi.stubGlobal('fetch', vi.fn(async () => impl()));

      // Still enforcing — a cache outage must not wave everyone through...
      expect((await checkRateLimit('k', rule)).store).toBe('memory');
      await checkRateLimit('k', rule);
      expect((await checkRateLimit('k', rule)).allowed).toBe(false);
    });
  }

  it('does not lock everyone out during an outage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));

    // ...and must not turn a cache outage into a total outage either.
    expect((await checkRateLimit('fresh-caller', rule)).allowed).toBe(true);
  });
});

describe('clientIp', () => {
  it('takes the first hop of x-forwarded-for', () => {
    expect(clientIp(request({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' }))).toBe('1.2.3.4');
  });

  it('trims whitespace', () => {
    expect(clientIp(request({ 'x-forwarded-for': '  1.2.3.4  ' }))).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    expect(clientIp(request({ 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8');
  });

  it('buckets unattributable callers together rather than exempting them', () => {
    expect(clientIp(request())).toBe('unknown');
    expect(clientIp(request({ 'x-forwarded-for': '' }))).toBe('unknown');
  });
});

describe('rateLimitKey', () => {
  it('namespaces by endpoint so budgets are not shared', () => {
    const req = request({ 'x-forwarded-for': '1.2.3.4' });
    expect(rateLimitKey('login', req)).toBe('rl:login:1.2.3.4');
    expect(rateLimitKey('contact', req)).not.toBe(rateLimitKey('login', req));
  });
});

describe('rateLimitResponse', () => {
  it('is a 429 carrying Retry-After', async () => {
    const res = rateLimitResponse({ allowed: false, retryAfterSeconds: 90, store: 'memory' }, 'Slow down');

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('90');
    expect(await res.json()).toEqual({ error: 'Slow down' });
  });
});

describe('enforceRateLimit', () => {
  it('returns null while the caller is under the limit', async () => {
    expect(await enforceRateLimit(request({ 'x-forwarded-for': '1.1.1.1' }), 'login', { max: 2, windowMs: 60_000 }, 'no')).toBeNull();
  });

  it('returns a ready-to-send 429 once over', async () => {
    const req = request({ 'x-forwarded-for': '1.1.1.1' });
    const rule = { max: 1, windowMs: 60_000 };

    await enforceRateLimit(req, 'login', rule, 'Too many attempts');
    const blocked = await enforceRateLimit(req, 'login', rule, 'Too many attempts');

    expect(blocked?.status).toBe(429);
    expect(await blocked!.json()).toEqual({ error: 'Too many attempts' });
  });

  it('keeps separate budgets per endpoint for the same caller', async () => {
    const req = request({ 'x-forwarded-for': '1.1.1.1' });
    const rule = { max: 1, windowMs: 60_000 };

    await enforceRateLimit(req, 'login', rule, 'no');
    expect(await enforceRateLimit(req, 'login', rule, 'no')).not.toBeNull();
    // Burning the login budget must not lock the contact form.
    expect(await enforceRateLimit(req, 'contact', rule, 'no')).toBeNull();
  });

  it('keeps separate budgets per caller on the same endpoint', async () => {
    const rule = { max: 1, windowMs: 60_000 };

    await enforceRateLimit(request({ 'x-forwarded-for': '1.1.1.1' }), 'login', rule, 'no');
    expect(
      await enforceRateLimit(request({ 'x-forwarded-for': '2.2.2.2' }), 'login', rule, 'no')
    ).toBeNull();
  });
});

describe('the configured limits', () => {
  it('are tighter on credentials than on the contact form', () => {
    // A limit looser than the contact form's would be the wrong way round.
    const loginPerHour = RATE_LIMITS.login.max / (RATE_LIMITS.login.windowMs / 3_600_000);
    expect(loginPerHour).toBeLessThan(60);
  });

  it('are all positive and bounded', () => {
    for (const [name, rule] of Object.entries(RATE_LIMITS)) {
      expect(rule.max, name).toBeGreaterThan(0);
      expect(rule.windowMs, name).toBeGreaterThan(0);
    }
  });
});
