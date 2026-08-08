import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOAuthState, verifyOAuthState } from '@/lib/auth';

/**
 * Connecting a mailbox that is not your own.
 *
 * Automated follow-ups go from their own address on the secondary sending
 * domain — deliberately not "whoever made the call", because they must not
 * come from a mailbox being warmed or under a restriction. A mailbox is a
 * `User` row here, so that address needs an account and the account needs
 * Google connected.
 *
 * The second half had no route to it. `gmail-oauth/start` minted the consent
 * from `session.userId` and the callback writes to whoever the state names, so
 * attaching a mailbox to another account meant: create the teammate, note the
 * password shown once, sign out, sign in as them, connect Google, sign out,
 * sign back in. Nothing in the product said so, and the notification that asks
 * for it reads like two clicks — which is how the outreach mailbox stayed
 * unconnected for weeks while the cron declined every weekday into a log
 * nobody opens.
 *
 * What is guarded here is the part worth guarding: who may name somebody
 * else's row as the destination.
 */

const prisma = { user: { findUnique: vi.fn() } };
const requireStaff = vi.fn();
const requireOwner = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  requireOwner: () => requireOwner(),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));
vi.mock('@/lib/gmail-oauth', () => ({
  isGoogleOAuthConfigured: () => true,
  buildGoogleAuthUrl: (state: string) => `https://accounts.google.test/o/oauth2/auth?state=${state}`,
}));

const { GET } = await import('@/app/api/admin/settings/gmail-oauth/start/route');

const start = async (query = '') => {
  const url = `http://localhost/api/admin/settings/gmail-oauth/start${query}`;
  const { NextRequest } = await import('next/server');
  return GET(new NextRequest(url));
};

/** The state Google would be handed back, read out of the redirect. */
const stateFrom = (res: Response) => {
  const location = res.headers.get('location') ?? '';
  return new URL(location).searchParams.get('state') ?? '';
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET ||= 'test-secret-for-oauth-state-only';
  requireStaff.mockResolvedValue({ userId: 'user_kiana', role: 'owner' });
  requireOwner.mockResolvedValue({ userId: 'user_kiana', role: 'owner' });
  prisma.user.findUnique.mockResolvedValue({ id: 'user_outreach' });
});

describe('connecting your own mailbox', () => {
  it('still works with no userId at all', async () => {
    requireStaff.mockResolvedValue({ userId: 'user_sam', role: 'sales' });
    requireOwner.mockResolvedValue(null);

    const claims = verifyOAuthState(stateFrom(await start()));

    expect(claims?.userId).toBe('user_sam');
    expect(claims?.delegated).toBe(false);
    // A rep connecting their own mailbox must not be made to be an owner.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  /** Naming yourself is the ordinary case spelled out, not a delegation. */
  it('treats naming yourself as your own, without an owner check', async () => {
    requireStaff.mockResolvedValue({ userId: 'user_sam', role: 'sales' });
    requireOwner.mockResolvedValue(null);

    const claims = verifyOAuthState(stateFrom(await start('?userId=user_sam')));

    expect(claims?.userId).toBe('user_sam');
    expect(claims?.delegated).toBe(false);
  });
});

describe('an owner connecting a teammate’s mailbox', () => {
  it('mints the consent against the teammate, not against themselves', async () => {
    const claims = verifyOAuthState(stateFrom(await start('?userId=user_outreach')));

    expect(claims?.userId).toBe('user_outreach');
    expect(claims?.delegated).toBe(true);
  });

  /**
   * Resolved against the table rather than trusted. The state is signed, so an
   * id that never existed would otherwise mint a perfectly valid state
   * pointing at nothing and fail much later — inside the callback, as a bare
   * Prisma error, on the way back from Google.
   */
  it('refuses an id that is not a real account', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await start('?userId=ghost');

    expect(res.headers.get('location')).toContain('/admin/team');
    expect(res.headers.get('location')).toContain('unknown_teammate');
  });
});

describe('a rep reaching for somebody else’s mailbox', () => {
  /**
   * The boundary. Without the owner check, any staff session could name any
   * row as the destination of the next consent screen.
   */
  it('is refused and sent somewhere with an explanation', async () => {
    requireStaff.mockResolvedValue({ userId: 'user_sam', role: 'sales' });
    requireOwner.mockResolvedValue(null);

    const res = await start('?userId=user_outreach');
    const location = res.headers.get('location') ?? '';

    expect(location).toContain('not_owner');
    expect(location).not.toContain('accounts.google.test');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('is refused before anything is signed', async () => {
    requireStaff.mockResolvedValue({ userId: 'user_sam', role: 'sales' });
    requireOwner.mockResolvedValue(null);

    const res = await start('?userId=user_outreach');

    expect(new URL(res.headers.get('location') ?? '').searchParams.get('state')).toBeNull();
  });

  it('turns nobody away entirely — an anonymous caller gets a 401', async () => {
    requireStaff.mockResolvedValue(null);

    expect((await start('?userId=user_outreach')).status).toBe(401);
  });
});

describe('the state itself', () => {
  it('is signed, expiring, and says which round-trip it is', () => {
    const claims = verifyOAuthState(createOAuthState('user_outreach', { delegated: true }));

    expect(claims).toEqual({ userId: 'user_outreach', delegated: true });
  });

  /** An old state, minted before delegation existed, is still just your own. */
  it('reads a state carrying no delegated claim as not delegated', () => {
    expect(verifyOAuthState(createOAuthState('user_kiana'))?.delegated).toBe(false);
  });

  it('refuses a token that was signed for something else', () => {
    expect(verifyOAuthState('not-a-jwt')).toBeNull();
  });
});
