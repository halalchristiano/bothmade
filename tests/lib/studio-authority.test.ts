import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A role change has to mean something before the token expires.
 *
 * `requireStaff` already re-checked two account facts on every request —
 * whether the row still exists, and whether a password change had moved the
 * `sessionsValidFrom` watermark past this token. The third fact, `role`, was
 * read off the JWT: a claim minted at sign-in and good for a week, on a field
 * /admin/team can change at any moment.
 *
 * Both directions were wrong. Demoting an owner left their live session
 * holding owner authority — adding and removing teammates, re-roling anybody
 * including themselves, bulk lead deletion, quoting below the pricing floor —
 * for the rest of the week, which is precisely the authority somebody is
 * trying to stop when they make that change. And promoting somebody did
 * nothing until they happened to sign out, with no way to force it and
 * nothing on screen to explain why.
 */

const findUnique = vi.fn(async (_a: unknown) => null as { sessionsValidFrom: Date | null; role: string } | null);
const getCurrentSession = vi.fn(async () => null as unknown);

vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: (a: unknown) => findUnique(a) } } }));
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, getCurrentSession: () => getCurrentSession() };
});

const { requireStaff, requireOwner } = await import('@/lib/middleware');

/** A week-old token that still claims whatever it claimed at sign-in. */
const tokenSaying = (role: string) => ({
  type: 'user' as const,
  userId: 'user_evan',
  email: 'evan@bothmade.studio',
  role,
  iat: Math.floor(Date.now() / 1000) - 6 * 24 * 60 * 60,
});

const rowSaying = (role: string) => ({ sessionsValidFrom: null, role });

beforeEach(() => {
  findUnique.mockReset();
  getCurrentSession.mockReset();
});

describe('a session whose role has changed underneath it', () => {
  it('loses owner authority the moment the row says sales', async () => {
    getCurrentSession.mockResolvedValue(tokenSaying('owner'));
    findUnique.mockResolvedValue(rowSaying('sales'));

    const staff = await requireStaff();
    expect(staff?.role).toBe('sales');
    // The whole point: no more adding teammates, removing them, or re-roling.
    expect(await requireOwner()).toBeNull();
  });

  it('gains owner authority without being made to sign out again', async () => {
    getCurrentSession.mockResolvedValue(tokenSaying('sales'));
    findUnique.mockResolvedValue(rowSaying('owner'));

    expect((await requireStaff())?.role).toBe('owner');
    expect(await requireOwner()).not.toBeNull();
  });

  it('leaves an unchanged role exactly as it was', async () => {
    getCurrentSession.mockResolvedValue(tokenSaying('owner'));
    findUnique.mockResolvedValue(rowSaying('owner'));

    const session = await requireStaff();
    expect(session?.role).toBe('owner');
    expect(session?.userId).toBe('user_evan');
    expect(session?.email).toBe('evan@bothmade.studio');
  });
});

describe('the two account checks this guard already made', () => {
  it('still refuses a token for an account that is gone', async () => {
    getCurrentSession.mockResolvedValue(tokenSaying('owner'));
    findUnique.mockResolvedValue(null);

    expect(await requireStaff()).toBeNull();
  });

  it('still refuses a token minted before the last password change', async () => {
    getCurrentSession.mockResolvedValue(tokenSaying('owner'));
    findUnique.mockResolvedValue({ sessionsValidFrom: new Date(), role: 'owner' });

    expect(await requireStaff()).toBeNull();
  });

  it('refuses a client session outright', async () => {
    getCurrentSession.mockResolvedValue({ type: 'client', clientId: 'c1', email: 'a@b.com' });

    expect(await requireStaff()).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
