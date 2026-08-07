import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { RESET_TOKEN_TTL_MS } from '@/lib/password-policy';

/**
 * `/api/auth/password-reset` — the route that can hand over any account in
 * the system, and the only security-critical one with no tests at all.
 *
 * What it gets right is subtle and entirely invisible from the outside, which
 * is exactly the kind of thing that gets refactored away by someone who
 * cannot see why it is written the way it is: the same answer whether or not
 * an address has an account, only a hash of the token stored, one use per
 * link, earlier links killed when a new one is issued, and every existing
 * session evicted when the password lands.
 *
 * And it now says so afterwards. A reset that goes through in silence gives
 * an attacker the account and gives the owner no reason to look — the sign-in
 * that fails tomorrow does not say when it changed, or that it was changed
 * rather than forgotten.
 */

/*
 * Left untyped on purpose. These stand in for Prisma delegates whose call
 * arguments the assertions below read back (`create.mock.calls[0][0].data`),
 * and a `vi.fn(async () => ...)` with no declared parameters types those
 * calls as an empty tuple — so every such read becomes a type error rather
 * than the assertion it is meant to be. Behaviour is set in beforeEach.
 */
const prisma = {
  client: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
  passwordResetToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  rateLimit: { deleteMany: vi.fn() },
  $queryRaw: () => Promise.resolve([{ count: 1, windowStart: new Date() }]),
};

const sendPasswordResetEmail = vi.fn();
const sendPasswordChangedEmail = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/email', () => ({
  sendPasswordResetEmail: (...a: unknown[]) => sendPasswordResetEmail(...a),
  sendPasswordChangedEmail: (...a: unknown[]) => sendPasswordChangedEmail(...a),
}));
vi.mock('@/lib/auth', () => ({ hashPassword: async (p: string) => `hashed:${p}` }));

const { POST, PUT } = await import('@/app/api/auth/password-reset/route');

function request(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return {
    json: async () => body,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
  } as unknown as NextRequest;
}

const STRONG = 'a-properly-long-passphrase-42';

/** A live token row, as findUnique would return it. */
function tokenRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'prt_1',
    email: 'dana@example.com',
    userType: 'user',
    usedAt: null,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
  prisma.user.update.mockResolvedValue({});
  prisma.client.findUnique.mockResolvedValue(null);
  prisma.client.update.mockResolvedValue({});
  prisma.passwordResetToken.create.mockResolvedValue({});
  prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
  prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
  prisma.rateLimit.deleteMany.mockResolvedValue({ count: 0 });
  sendPasswordResetEmail.mockResolvedValue(true);
  sendPasswordChangedEmail.mockResolvedValue(true);
});

describe('asking for a link', () => {
  /**
   * The generic answer is the whole feature. An endpoint that says "no such
   * account" for one address and "sent" for another is an address checker,
   * and it answers to anybody.
   */
  it('answers identically whether or not the address has an account', async () => {
    const hit = await POST(request({ email: 'dana@example.com' }));
    const hitBody = await hit.json();

    prisma.user.findUnique.mockResolvedValue(null);
    const miss = await POST(request({ email: 'nobody@example.com' }));
    const missBody = await miss.json();

    expect(hit.status).toBe(miss.status);
    expect(hitBody).toEqual(missBody);
  });

  it('sends nothing at all to an address with no account', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await POST(request({ email: 'nobody@example.com' }));

    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('stores only a hash, never the token it emailed', async () => {
    await POST(request({ email: 'dana@example.com' }));

    const stored = prisma.passwordResetToken.create.mock.calls[0][0].data;
    const emailedUrl = sendPasswordResetEmail.mock.calls[0][1] as string;
    const emailedToken = new URL(emailedUrl).searchParams.get('token');

    expect(emailedToken).toBeTruthy();
    expect(stored.tokenHash).not.toBe(emailedToken);
    // A row that leaks the live token is the same as storing a password.
    expect(JSON.stringify(stored)).not.toContain(emailedToken);
  });

  it('kills any earlier live link for the same account', async () => {
    await POST(request({ email: 'dana@example.com' }));

    // "I requested three, which one works?" must have exactly one answer.
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ email: 'dana@example.com', usedAt: null }),
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      })
    );
  });

  it('lowercases the address, so Dana@ and dana@ are one account', async () => {
    await POST(request({ email: '  Dana@Example.COM  ' }));

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'dana@example.com' } })
    );
  });

  /**
   * The email states an expiry in words and the route enforces one in
   * milliseconds. They disagreed — a one-hour token described as lasting 24
   * — so anyone who read the sentence and came back after lunch met "invalid
   * or expired" and no way to tell a dead link from a broken feature.
   */
  it('mints a token that lasts as long as the email says it does', async () => {
    const before = Date.now();
    await POST(request({ email: 'dana@example.com' }));

    const { expiresAt } = prisma.passwordResetToken.create.mock.calls[0][0].data;
    const lifetime = new Date(expiresAt).getTime() - before;

    expect(lifetime).toBeGreaterThan(RESET_TOKEN_TTL_MS - 5_000);
    expect(lifetime).toBeLessThanOrEqual(RESET_TOKEN_TTL_MS + 5_000);
  });
});

describe('using a link', () => {
  it('sets the password and evicts every existing session', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(tokenRow());

    const res = await PUT(request({ token: 'raw-token', password: STRONG }));

    expect(res.status).toBe(200);
    const { data } = prisma.user.update.mock.calls[0][0];
    expect(data.password).toBe(`hashed:${STRONG}`);
    // A reset is reached *because* someone thinks they lost control of the
    // account; a still-working 7-day token would defeat the point.
    expect(data.sessionsValidFrom).toBeInstanceOf(Date);
  });

  it('refuses a token that has already been used', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(tokenRow({ usedAt: new Date() }));

    const res = await PUT(request({ token: 'raw-token', password: STRONG }));

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses a token that has expired', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(
      tokenRow({ expiresAt: new Date(Date.now() - 1000) })
    );

    const res = await PUT(request({ token: 'raw-token', password: STRONG }));

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  /**
   * Two tabs, one link. The claim is a conditional update on `usedAt: null`,
   * so the database decides the winner rather than a read-then-write that
   * both sides pass.
   */
  it('lets exactly one of two racing requests through', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(tokenRow());
    // The loser's claim updates nothing: the row was burnt in between.
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

    const res = await PUT(request({ token: 'raw-token', password: STRONG }));

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('burns the token before it sets the password, not after', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(tokenRow());
    const order: string[] = [];
    prisma.passwordResetToken.updateMany.mockImplementation(async () => {
      order.push('burn');
      return { count: 1 };
    });
    prisma.user.update.mockImplementation(async () => {
      order.push('set');
      return {};
    });

    await PUT(request({ token: 'raw-token', password: STRONG }));

    expect(order).toEqual(['burn', 'set']);
  });

  it('holds a reset link to the same password policy as everywhere else', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(tokenRow());

    const res = await PUT(request({ token: 'raw-token', password: 'short' }));

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('clears the forced-change flag when a client sets one by hand', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(tokenRow({ userType: 'client' }));

    await PUT(request({ token: 'raw-token', password: STRONG }));

    expect(prisma.client.update.mock.calls[0][0].data.mustChangePassword).toBe(false);
  });
});

describe('telling the account it happened', () => {
  it('emails the owner once the password has actually changed', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(tokenRow());

    await PUT(request({ token: 'raw-token', password: STRONG }));

    expect(sendPasswordChangedEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordChangedEmail.mock.calls[0][0]).toMatchObject({
      toEmail: 'dana@example.com',
      via: 'reset',
    });
  });

  it('says nothing when the reset was refused', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(tokenRow({ usedAt: new Date() }));

    await PUT(request({ token: 'raw-token', password: STRONG }));

    // A notice about a change that did not happen is worse than none: it
    // teaches the recipient to ignore the one that matters.
    expect(sendPasswordChangedEmail).not.toHaveBeenCalled();
  });

  it('still completes the reset when the notice cannot be sent', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(tokenRow());
    sendPasswordChangedEmail.mockRejectedValue(new Error('Resend is down'));

    const res = await PUT(request({ token: 'raw-token', password: STRONG }));

    // The password is already changed and the sessions are already gone.
    // Reporting failure here would send someone back to request a second link.
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalled();
  });
});
