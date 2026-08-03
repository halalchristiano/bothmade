import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * The limiter being correct in isolation is not the same as it being wired
 * into the routes that need it. These tests hit the real handlers and assert
 * that a flood of guesses stops reaching the password check at all — the
 * regression they exist to catch is somebody removing the guard.
 */

/** Stand-in for the rate_limits table, so the real window logic runs. */
const counters = new Map<string, { count: number; windowStart: Date }>();

const prisma = {
  user: { findUnique: vi.fn(), create: vi.fn() },
  client: { findUnique: vi.fn(), update: vi.fn() },
  rateLimit: {
    deleteMany: vi.fn(async ({ where }: { where: { key?: string } }) => {
      if (where?.key) counters.delete(where.key);
      return { count: 0 };
    }),
  },
  /**
   * The routes issue two different statements against this table, and the
   * difference is the whole design: the INSERT counts a failure, the SELECT
   * only asks whether the account is already locked. A mock that increments
   * on both would make the read-only check spend budget, which is exactly
   * the bug it exists to avoid.
   */
  $queryRaw: (sql: TemplateStringsArray, ...params: unknown[]) => {
    const key = params[0] as string;
    const now = Date.now();

    if (sql[0]?.includes('SELECT')) {
      const existing = counters.get(key);
      return Promise.resolve(existing ? [{ ...existing }] : []);
    }

    const windowMs = params[1] as number;
    const existing = counters.get(key);
    if (!existing || now - existing.windowStart.getTime() >= windowMs) {
      const row = { count: 1, windowStart: new Date(now) };
      counters.set(key, row);
      return Promise.resolve([{ ...row }]);
    }
    existing.count += 1;
    return Promise.resolve([{ ...existing }]);
  },
};
const verifyPassword = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/auth', () => ({
  verifyPassword: (...a: unknown[]) => verifyPassword(...a),
  hashPassword: async () => 'hashed',
  createToken: () => 'token',
  setAuthCookie: async () => {},
  generateRandomPassword: () => 'pw',
}));
vi.mock('@/lib/email', () => ({ sendPasswordResetEmail: vi.fn() }));

const { POST: adminLogin } = await import('@/app/api/auth/admin/login/route');
const { POST: clientLogin } = await import('@/app/api/auth/login/route');
const { RATE_LIMITS } = await import('@/lib/rate-limit');

function loginRequest(body: unknown, ip = '9.9.9.9'): NextRequest {
  return {
    json: async () => body,
    headers: { get: (n: string) => (n.toLowerCase() === 'x-forwarded-for' ? ip : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  counters.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  prisma.user.findUnique.mockResolvedValue({
    id: 'u1',
    email: 'evan@bothmade.com',
    password: 'hash',
    role: 'owner',
  });
  verifyPassword.mockResolvedValue(false);
});

describe('POST /api/auth/admin/login', () => {
  const credentials = { email: 'evan@bothmade.com', password: 'wrong' };

  it('answers 401 while under the limit', async () => {
    const res = await adminLogin(loginRequest(credentials));
    expect(res.status).toBe(401);
  });

  it('starts refusing once the attempt budget is spent', async () => {
    for (let i = 0; i < RATE_LIMITS.login.max; i++) {
      expect((await adminLogin(loginRequest(credentials))).status, `attempt ${i + 1}`).toBe(401);
    }

    const blocked = await adminLogin(loginRequest(credentials));

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });

  it('stops the guesses reaching the password check at all', async () => {
    for (let i = 0; i < RATE_LIMITS.login.max; i++) await adminLogin(loginRequest(credentials));
    const callsBefore = verifyPassword.mock.calls.length;

    for (let i = 0; i < 20; i++) await adminLogin(loginRequest(credentials));

    // A bcrypt comparison per attempt is also the expensive part — a blocked
    // attempt must cost nothing.
    expect(verifyPassword.mock.calls.length).toBe(callsBefore);
  });

  it('does not let a flood against one account touch a different one', async () => {
    // The per-account budget is keyed on the account being signed in to, so
    // grinding one address must not cost anybody else theirs.
    for (let i = 0; i < RATE_LIMITS.loginAccount.max + 5; i++) {
      await adminLogin(loginRequest(credentials, '6.6.6.6'));
    }

    const other = await adminLogin(
      loginRequest({ email: 'kiana@bothmade.com', password: 'wrong' }, '7.7.7.7')
    );

    expect(other.status).toBe(401);
  });

  it('locks the account itself across every address, which is the point', async () => {
    // This used to be asserted the other way round — a flood from one IP
    // deliberately left the same account reachable from another, so that
    // knowing an email could not be used to lock its owner out.
    //
    // That left the real attack open: guessing one known address from a
    // proxy pool spends no single IP's budget, so the per-IP counter never
    // fires. The account counter is what closes it, and it only closes it if
    // it follows the account rather than the connection.
    for (let i = 0; i < RATE_LIMITS.loginAccount.max; i++) {
      await adminLogin(loginRequest(credentials, `10.0.0.${i}`));
    }

    const fromSomewhereElse = await adminLogin(loginRequest(credentials, '203.0.113.9'));

    expect(fromSomewhereElse.status).toBe(429);
    expect(fromSomewhereElse.headers.get('Retry-After')).toBeTruthy();
  });

  it('only counts failures, so signing in correctly never spends the budget', async () => {
    // The studio signs in many times a day. If successes counted, they would
    // throttle themselves out of their own dashboard by lunchtime.
    verifyPassword.mockResolvedValue(true);

    for (let i = 0; i < RATE_LIMITS.loginAccount.max + 10; i++) {
      expect((await adminLogin(loginRequest(credentials, `10.1.0.${i}`))).status).toBe(200);
    }
  });

  it('forgives the account once the right password arrives', async () => {
    // Someone mistyping their password nine times and then getting it right
    // should not be one slip away from a lockout for the next quarter hour.
    for (let i = 0; i < RATE_LIMITS.loginAccount.max - 1; i++) {
      await adminLogin(loginRequest(credentials, '8.8.8.8'));
    }

    verifyPassword.mockResolvedValue(true);
    expect((await adminLogin(loginRequest(credentials, '8.8.8.9'))).status).toBe(200);

    verifyPassword.mockResolvedValue(false);
    expect((await adminLogin(loginRequest(credentials, '8.8.8.10'))).status).toBe(401);
  });

  it('does not spend the budget of the client login endpoint', async () => {
    for (let i = 0; i < RATE_LIMITS.login.max + 1; i++) {
      await adminLogin(loginRequest(credentials, '4.4.4.4'));
    }
    prisma.client.findUnique.mockResolvedValue(null);

    const res = await clientLogin(
      loginRequest({ email: 'a@b.com', password: 'x', userType: 'client' }, '4.4.4.4')
    );

    expect(res.status).not.toBe(429);
  });
});

describe('POST /api/auth/login', () => {
  it('refuses a flood of client-side guesses', async () => {
    prisma.client.findUnique.mockResolvedValue(null);
    const body = { email: 'a@b.com', password: 'wrong', userType: 'client' };

    for (let i = 0; i < RATE_LIMITS.login.max; i++) {
      expect((await clientLogin(loginRequest(body, '3.3.3.3'))).status).toBe(401);
    }

    expect((await clientLogin(loginRequest(body, '3.3.3.3'))).status).toBe(429);
  });
});
