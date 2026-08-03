import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * The limiter being correct in isolation is not the same as it being wired
 * into the routes that need it. These tests hit the real handlers and assert
 * that a flood of guesses stops reaching the password check at all — the
 * regression they exist to catch is somebody removing the guard.
 */

const prisma = {
  user: { findUnique: vi.fn(), create: vi.fn() },
  client: { findUnique: vi.fn(), update: vi.fn() },
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
const { RATE_LIMITS, __resetInMemoryRateLimits } = await import('@/lib/rate-limit');

function loginRequest(body: unknown, ip = '9.9.9.9'): NextRequest {
  return {
    json: async () => body,
    headers: { get: (n: string) => (n.toLowerCase() === 'x-forwarded-for' ? ip : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetInMemoryRateLimits();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
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

  it('does not let one attacker lock out a different address', async () => {
    for (let i = 0; i < RATE_LIMITS.login.max + 5; i++) {
      await adminLogin(loginRequest(credentials, '6.6.6.6'));
    }

    const other = await adminLogin(loginRequest(credentials, '7.7.7.7'));

    expect(other.status).toBe(401);
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
