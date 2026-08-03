import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * `/api/auth/signup` was once open to the internet and minted `role: 'admin'`
 * accounts with a cookie already set: one unauthenticated POST bought the
 * whole CRM — every lead, client, contract and payment. It is closed now, and
 * these tests exist so it can never quietly reopen.
 *
 * Two doors, and nothing else: an owner who is already signed in, or a
 * first-run bootstrap into an empty User table holding ADMIN_BOOTSTRAP_TOKEN.
 */

const prisma = {
  user: { count: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  rateLimit: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  $queryRaw: () => Promise.resolve([{ count: 1, windowStart: new Date() }]),
};
const requireOwner = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/auth', () => ({ hashPassword: async (p: string) => `hashed:${p}` }));
vi.mock('@/lib/middleware', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/middleware')>()),
  requireOwner: () => requireOwner(),
}));

const { POST } = await import('@/app/api/auth/signup/route');

const OWNER = { type: 'user', userId: 'u1', email: 'kiana@bothmade.studio', role: 'owner' };
const VALID = {
  email: 'New.Person@Bothmade.studio',
  password: 'a-properly-long-passphrase-42',
  name: 'New Person',
};

function request(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return {
    json: async () => body,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_BOOTSTRAP_TOKEN;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  requireOwner.mockResolvedValue(null);
  prisma.user.count.mockResolvedValue(1);
  prisma.user.findUnique.mockResolvedValue(null);
  prisma.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'u_new',
    ...data,
  }));
});

describe('the door that used to be open', () => {
  it('refuses an anonymous caller — the reason this file exists', async () => {
    const res = await POST(request(VALID));

    expect(res.status).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses even before reading the body, so malformed JSON cannot reach the parser', async () => {
    const exploded = vi.fn(async () => {
      throw new SyntaxError('boom');
    });

    const res = await POST({
      json: exploded,
      headers: { get: () => null },
    } as unknown as NextRequest);

    expect(res.status).toBe(403);
    // "Who are you" is answered first; an unauthenticated caller never gets
    // to hand the JSON parser something and see what falls out.
    expect(exploded).not.toHaveBeenCalled();
  });

  it('refuses a signed-in non-owner — account creation is how a limited role escalates', async () => {
    requireOwner.mockResolvedValue(null); // requireOwner already rejects sales/admin

    expect((await POST(request(VALID))).status).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses bootstrap once any account exists, even with the right token', async () => {
    process.env.ADMIN_BOOTSTRAP_TOKEN = 'correct-token';
    prisma.user.count.mockResolvedValue(1);

    const res = await POST(request(VALID, { 'x-bootstrap-token': 'correct-token' }));

    expect(res.status).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses bootstrap on an empty table when no token is configured', async () => {
    prisma.user.count.mockResolvedValue(0);

    // Leaving ADMIN_BOOTSTRAP_TOKEN unset means the path does not exist.
    expect((await POST(request(VALID))).status).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses a wrong bootstrap token, and one of the wrong length', async () => {
    process.env.ADMIN_BOOTSTRAP_TOKEN = 'correct-token';
    prisma.user.count.mockResolvedValue(0);

    expect((await POST(request(VALID, { 'x-bootstrap-token': 'wrong-token!' }))).status).toBe(403);
    expect((await POST(request(VALID, { 'x-bootstrap-token': 'short' }))).status).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe('the two doors that are open', () => {
  it('lets a signed-in owner add a teammate', async () => {
    requireOwner.mockResolvedValue(OWNER);

    const res = await POST(request(VALID));

    expect(res.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledOnce();
  });

  it('lets a correct bootstrap token through on an empty table', async () => {
    process.env.ADMIN_BOOTSTRAP_TOKEN = 'correct-token';
    prisma.user.count.mockResolvedValue(0);

    const res = await POST(request(VALID, { 'x-bootstrap-token': 'correct-token' }));

    expect(res.status).toBe(201);
    expect(prisma.user.create.mock.calls[0]![0].data.role).toBe('owner');
  });
});

describe('what the new account gets', () => {
  beforeEach(() => requireOwner.mockResolvedValue(OWNER));

  it('defaults an invited teammate to sales, not admin', async () => {
    await POST(request(VALID));
    expect(prisma.user.create.mock.calls[0]![0].data.role).toBe('sales');
  });

  it('honours a role from the fixed list, and ignores anything else', async () => {
    await POST(request({ ...VALID, role: 'admin' }));
    expect(prisma.user.create.mock.calls[0]![0].data.role).toBe('admin');

    prisma.user.create.mockClear();
    await POST(request({ ...VALID, role: 'superuser' }));
    expect(prisma.user.create.mock.calls[0]![0].data.role).toBe('sales');
  });

  it('never stores the password in the clear', async () => {
    await POST(request(VALID));

    const stored = prisma.user.create.mock.calls[0]![0].data.password as string;
    expect(stored).not.toBe(VALID.password);
    expect(stored).toContain('hashed:');
  });

  it('normalises the email, so a case variant cannot become a second account', async () => {
    await POST(request(VALID));
    expect(prisma.user.create.mock.calls[0]![0].data.email).toBe('new.person@bothmade.studio');
  });
});

describe('validation', () => {
  beforeEach(() => requireOwner.mockResolvedValue(OWNER));

  it('rejects a malformed body without a stack trace', async () => {
    const res = await POST({
      json: async () => {
        throw new SyntaxError('bad json');
      },
      headers: { get: () => null },
    } as unknown as NextRequest);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Request body must be valid JSON' });
  });

  it('requires an email, password and name', async () => {
    for (const missing of ['email', 'name']) {
      expect((await POST(request({ ...VALID, [missing]: '  ' }))).status, missing).toBe(400);
    }
    expect((await POST(request({ ...VALID, password: undefined }))).status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects a weak password', async () => {
    const res = await POST(request({ ...VALID, password: 'password' }));

    expect(res.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate email', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    expect((await POST(request(VALID))).status).toBe(409);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
