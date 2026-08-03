import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * This endpoint was open to the internet and hardcoded `role: 'admin'`: one
 * unauthenticated POST bought a full admin account on a CRM holding every
 * client's contact details, invoices and payments. These tests exist so that
 * can never quietly come back.
 */

const prisma = {
  user: { count: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  rateLimit: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  $queryRaw: () => Promise.resolve([{ count: 1, windowStart: new Date() }]),
};
const getCurrentSession = vi.fn();
const setAuthCookie = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/auth', () => ({
  getCurrentSession: () => getCurrentSession(),
  hashPassword: async (p: string) => `hashed:${p}`,
  createToken: () => 'token',
  setAuthCookie: (...a: unknown[]) => setAuthCookie(...a),
}));

const { POST } = await import('@/app/api/auth/signup/route');

const VALID = {
  email: 'new@bothmade.studio',
  password: 'a-properly-long-password',
  name: 'New Person',
};

function request(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return {
    json: async () => body,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
  } as unknown as NextRequest;
}

const OWNER_SESSION = { type: 'user', userId: 'u1', email: 'kiana@bothmade.studio', role: 'owner' };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_BOOTSTRAP_TOKEN;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  prisma.user.findUnique.mockResolvedValue(null);
  prisma.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'u_new',
    ...data,
  }));
  getCurrentSession.mockResolvedValue(null);
});

describe('once the studio has staff', () => {
  beforeEach(() => prisma.user.count.mockResolvedValue(1));

  it('refuses an anonymous caller — the whole point of this file', async () => {
    const res = await POST(request(VALID));

    expect(res.status).toBe(404);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('gives a prober nothing to distinguish it from an unknown path', async () => {
    const res = await POST(request(VALID));
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('refuses a signed-in client — a customer is not staff', async () => {
    getCurrentSession.mockResolvedValue({ type: 'client', clientId: 'c1', email: 'a@b.com' });

    expect((await POST(request(VALID))).status).toBe(404);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses a signed-in sales rep — they manage leads, not colleagues', async () => {
    getCurrentSession.mockResolvedValue({ ...OWNER_SESSION, role: 'sales' });

    expect((await POST(request(VALID))).status).toBe(404);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('lets an owner invite a colleague', async () => {
    getCurrentSession.mockResolvedValue(OWNER_SESSION);

    const res = await POST(request(VALID));

    expect(res.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledOnce();
  });

  it('defaults an invited colleague to sales, not admin', async () => {
    getCurrentSession.mockResolvedValue(OWNER_SESSION);

    await POST(request(VALID));

    expect(prisma.user.create.mock.calls[0]![0].data.role).toBe('sales');
  });

  it('honours an explicit role, but only from the fixed list', async () => {
    getCurrentSession.mockResolvedValue(OWNER_SESSION);

    await POST(request({ ...VALID, role: 'admin' }));
    expect(prisma.user.create.mock.calls[0]![0].data.role).toBe('admin');

    prisma.user.create.mockClear();
    await POST(request({ ...VALID, role: 'superuser' }));
    expect(prisma.user.create.mock.calls[0]![0].data.role).toBe('sales');
  });

  it('does not swap the inviter session for the new account', async () => {
    getCurrentSession.mockResolvedValue(OWNER_SESSION);

    await POST(request(VALID));

    // Signing the cookie here would log the owner out and log the new
    // colleague in, on the owner's browser.
    expect(setAuthCookie).not.toHaveBeenCalled();
  });
});

describe('bootstrapping an empty database', () => {
  beforeEach(() => prisma.user.count.mockResolvedValue(0));

  it('allows the very first account with no session', async () => {
    const res = await POST(request(VALID));

    expect(res.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledOnce();
  });

  it('makes that first account the owner regardless of what was asked for', async () => {
    await POST(request({ ...VALID, role: 'sales' }));
    expect(prisma.user.create.mock.calls[0]![0].data.role).toBe('owner');
  });

  it('signs the first account in, since nobody else can', async () => {
    await POST(request(VALID));
    expect(setAuthCookie).toHaveBeenCalledOnce();
  });

  it('also demands the bootstrap token when one is configured', async () => {
    process.env.ADMIN_BOOTSTRAP_TOKEN = 'secret-token';

    expect((await POST(request(VALID))).status).toBe(404);
    expect((await POST(request(VALID, { 'x-bootstrap-token': 'wrong' }))).status).toBe(404);
    expect(prisma.user.create).not.toHaveBeenCalled();

    const res = await POST(request(VALID, { 'x-bootstrap-token': 'secret-token' }));
    expect(res.status).toBe(201);
  });
});

describe('validation', () => {
  beforeEach(() => {
    prisma.user.count.mockResolvedValue(1);
    getCurrentSession.mockResolvedValue(OWNER_SESSION);
  });

  it('requires an email, password and name', async () => {
    for (const missing of ['email', 'password', 'name']) {
      const res = await POST(request({ ...VALID, [missing]: '' }));
      expect(res.status, missing).toBe(400);
    }
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses a short password', async () => {
    const res = await POST(request({ ...VALID, password: 'short' }));

    expect(res.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses a duplicate email', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    expect((await POST(request(VALID))).status).toBe(409);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('never stores the password in the clear', async () => {
    await POST(request(VALID));

    const stored = prisma.user.create.mock.calls[0]![0].data.password as string;
    expect(stored).not.toBe(VALID.password);
    expect(stored).toContain('hashed:');
  });
});
