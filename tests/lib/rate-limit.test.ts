import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * This is the only thing standing between a script and an unlimited number
 * of password guesses against the admin login, so the cases that matter are
 * the unhappy ones: what happens when the counter's store is unreachable, or
 * answers with something unexpected.
 */

/** Stand-in for the `rate_limits` table, so the window logic is exercised for real. */
const table = new Map<string, { count: number; windowStart: Date }>();
let queryRawImpl: ((sql: TemplateStringsArray, ...params: unknown[]) => Promise<unknown>) | null = null;

const prisma = {
  $queryRaw: (sql: TemplateStringsArray, ...params: unknown[]) => {
    if (queryRawImpl) return queryRawImpl(sql, ...params);
    // params are [key, windowMs, windowMs] in the order they appear in the SQL.
    const key = params[0] as string;
    const windowMs = params[1] as number;
    const now = Date.now();
    const existing = table.get(key);

    if (!existing || now - existing.windowStart.getTime() >= windowMs) {
      const row = { count: 1, windowStart: new Date(now) };
      table.set(key, row);
      return Promise.resolve([{ ...row }]);
    }
    existing.count += 1;
    return Promise.resolve([{ ...existing }]);
  },
  rateLimit: {
    deleteMany: vi.fn(async (_args: { where: { windowStart: { lt: Date } } }) => ({ count: 0 })),
  },
};

vi.mock('@/lib/prisma', () => ({ prisma }));

const {
  RATE_LIMITS,
  __resetInMemoryRateLimits,
  checkRateLimit,
  clientIp,
  enforceRateLimit,
  rateLimitKey,
  rateLimitResponse,
} = await import('@/lib/rate-limit');

function request(headers: Record<string, string> = {}): NextRequest {
  return {
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as NextRequest;
}

beforeEach(() => {
  table.clear();
  queryRawImpl = null;
  __resetInMemoryRateLimits();
  vi.clearAllMocks();
});

describe('counting against the shared store', () => {
  const rule = { max: 3, windowMs: 60_000 };

  it('allows up to the limit and then blocks', async () => {
    for (let i = 0; i < rule.max; i++) {
      expect((await checkRateLimit('k', rule)).allowed, `request ${i + 1}`).toBe(true);
    }
    expect((await checkRateLimit('k', rule)).allowed).toBe(false);
  });

  it('answers from the database, not a per-process counter', async () => {
    expect((await checkRateLimit('k', rule)).store).toBe('db');
  });

  it('gives each key its own budget', async () => {
    for (let i = 0; i < rule.max; i++) await checkRateLimit('a', rule);
    expect((await checkRateLimit('a', rule)).allowed).toBe(false);
    expect((await checkRateLimit('b', rule)).allowed).toBe(true);
  });

  it('counts and expires in a single statement, so two instances cannot race', async () => {
    const seen: string[] = [];
    queryRawImpl = async (sql) => {
      seen.push(sql.join('?'));
      return [{ count: 1, windowStart: new Date() }];
    };

    await checkRateLimit('rl:login:1.2.3.4', rule);

    // A read followed by a write is exactly the race an attacker exploits.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/INSERT INTO "rate_limits"/);
    expect(seen[0]).toMatch(/ON CONFLICT \("key"\) DO UPDATE/);
    expect(seen[0]).toMatch(/RETURNING/);
  });

  it('passes the key and window as bound parameters, not string-interpolated SQL', async () => {
    let captured: unknown[] = [];
    queryRawImpl = async (_sql, ...params) => {
      captured = params;
      return [{ count: 1, windowStart: new Date() }];
    };

    await checkRateLimit("rl:login:'; DROP TABLE users; --", rule);

    expect(captured[0]).toBe("rl:login:'; DROP TABLE users; --");
    expect(captured).toContain(rule.windowMs);
  });

  it('returns a positive retry-after once blocked', async () => {
    for (let i = 0; i < rule.max; i++) await checkRateLimit('k', rule);
    const blocked = await checkRateLimit('k', rule);

    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(rule.windowMs / 1000);
  });

  it('derives retry-after from how much of the window is left', async () => {
    queryRawImpl = async () => [
      { count: rule.max + 1, windowStart: new Date(Date.now() - 20_000) },
    ];

    // 60s window, 20s elapsed — 40s to wait.
    expect((await checkRateLimit('k', rule)).retryAfterSeconds).toBe(40);
  });

  it('never returns a negative or zero wait for an already-lapsed row', async () => {
    queryRawImpl = async () => [
      { count: rule.max + 1, windowStart: new Date(Date.now() - 10 * rule.windowMs) },
    ];

    expect((await checkRateLimit('k', rule)).retryAfterSeconds).toBe(1);
  });

  it('lets the caller back in once the window has lapsed', async () => {
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
});

describe('when the database is unreachable', () => {
  const rule = { max: 2, windowMs: 60_000 };

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  const broken: Array<[string, () => Promise<unknown>]> = [
    ['the query throws', async () => { throw new Error('connection refused'); }],
    ['it times out', async () => { throw new Error('Timed out fetching a new connection'); }],
    ['no row comes back', async () => []],
    ['the count is not a number', async () => [{ count: 'banana', windowStart: new Date() }]],
  ];

  for (const [description, impl] of broken) {
    it(`degrades to the in-memory window when ${description}`, async () => {
      __resetInMemoryRateLimits();
      queryRawImpl = impl;

      // Still enforcing — a database blip must not wave everyone through...
      expect((await checkRateLimit('k', rule)).store).toBe('memory');
      await checkRateLimit('k', rule);
      expect((await checkRateLimit('k', rule)).allowed).toBe(false);
    });
  }

  it('does not lock everyone out during an outage', async () => {
    queryRawImpl = async () => {
      throw new Error('connection refused');
    };

    // ...and must not turn a database blip into a total outage either.
    expect((await checkRateLimit('fresh-caller', rule)).allowed).toBe(true);
  });
});

describe('housekeeping', () => {
  it('never lets a failing sweep affect the request', async () => {
    prisma.rateLimit.deleteMany.mockRejectedValueOnce(new Error('nope'));
    vi.spyOn(Math, 'random').mockReturnValue(0); // force the sweep to run

    const result = await checkRateLimit('k', { max: 5, windowMs: 60_000 });

    expect(result.allowed).toBe(true);
  });

  it('only deletes rows far older than the longest window', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    await checkRateLimit('k', { max: 5, windowMs: 60_000 });
    await vi.waitFor(() => expect(prisma.rateLimit.deleteMany).toHaveBeenCalled());

    const cutoff = prisma.rateLimit.deleteMany.mock.calls[0]![0].where.windowStart.lt;
    const longestWindow = Math.max(...Object.values(RATE_LIMITS).map((r) => r.windowMs));
    expect(Date.now() - cutoff.getTime()).toBeGreaterThan(longestWindow);
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
    const res = rateLimitResponse({ allowed: false, retryAfterSeconds: 90, store: 'db' }, 'Slow down');

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('90');
    expect(await res.json()).toEqual({ error: 'Slow down' });
  });
});

describe('enforceRateLimit', () => {
  it('returns null while the caller is under the limit', async () => {
    const res = await enforceRateLimit(
      request({ 'x-forwarded-for': '1.1.1.1' }),
      'login',
      { max: 2, windowMs: 60_000 },
      'no'
    );
    expect(res).toBeNull();
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
  it('are tighter on credentials than a casual form would need', () => {
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
