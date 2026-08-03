import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { ANY_STAFF, OPS, requireRole } from '@/lib/authz';
import type { AuthPayload } from '@/lib/auth';

/**
 * The admin nav has always hidden Clients and Projects from a sales account,
 * so the boundary existed in the interface — and nowhere else. Every one of
 * those endpoints authorised on "is this anyone on staff?", which meant a
 * sales session could call them directly and read the entire client book,
 * every project file, and the money.
 *
 * The point is not that Evan is untrustworthy. It is that a phished or
 * borrowed sales session should not be able to export the client book, and
 * neither should a bug in the sales UI.
 */

const staff = (role?: string): AuthPayload =>
  ({ userId: 'u1', email: 'e@bothmade.studio', role, type: 'user' }) as AuthPayload;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('requireRole', () => {
  it('lets an owner and an admin through to ops', () => {
    expect(requireRole(staff('owner'), OPS)).toBeNull();
    expect(requireRole(staff('admin'), OPS)).toBeNull();
  });

  it('turns sales away from ops with a 403, not a 401', () => {
    const denied = requireRole(staff('sales'), OPS);

    // 401 would mean "who are you" and send a signed-in person back to the
    // login page they already came from. 403 says what is actually true.
    expect(denied?.status).toBe(403);
  });

  it('still lets sales into everything staff-wide', () => {
    expect(requireRole(staff('sales'), ANY_STAFF)).toBeNull();
  });

  it('treats a token with no role as the least it could be', async () => {
    // A staff token predating roles, or minted by an older deploy. An absent
    // claim must never widen access — the safe reading is the narrowest one.
    const denied = requireRole(staff(undefined), OPS);

    expect(denied?.status).toBe(403);
    expect(requireRole(staff(undefined), ANY_STAFF)).toBeNull();
  });

  it('denies a role nobody has heard of', () => {
    expect(requireRole(staff('superuser'), OPS)?.status).toBe(403);
    expect(requireRole(staff('superuser'), ANY_STAFF)?.status).toBe(403);
  });

  it('says nothing about why, but logs enough to debug a lockout', () => {
    const denied = requireRole(staff('sales'), OPS);

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('sales'));
    expect(denied).not.toBeNull();
  });
});

/**
 * The gate is only worth anything if it is actually on the routes. These hit
 * the real handlers — the regression they exist to catch is somebody adding
 * an ops endpoint and reaching for a bare requireStaff().
 */

const prisma = {
  client: { findMany: vi.fn(async () => []), findUnique: vi.fn() },
  project: { findMany: vi.fn(async () => []), findUnique: vi.fn() },
};
const session = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/middleware')>()),
  requireStaff: () => session(),
}));

const { GET: listClients } = await import('@/app/api/admin/clients/route');
const { GET: listProjects } = await import('@/app/api/admin/projects/route');

const req = () =>
  ({
    headers: { get: () => null },
    url: 'https://bothmade.studio/api/admin/projects',
    nextUrl: new URL('https://bothmade.studio/api/admin/projects'),
  }) as unknown as NextRequest;

describe('the ops endpoints themselves', () => {
  it('refuse a sales session outright', async () => {
    session.mockResolvedValue(staff('sales'));

    expect((await listClients(req())).status).toBe(403);
    expect((await listProjects(req())).status).toBe(403);
    // Not one row of the client book is read before the refusal.
    expect(prisma.client.findMany).not.toHaveBeenCalled();
    expect(prisma.project.findMany).not.toHaveBeenCalled();
  });

  it('still answer for ops staff', async () => {
    session.mockResolvedValue(staff('owner'));

    expect((await listClients(req())).status).toBe(200);
    expect((await listProjects(req())).status).toBe(200);
  });

  it('answer 401, not 403, when nobody is signed in', async () => {
    session.mockResolvedValue(null);

    expect((await listClients(req())).status).toBe(401);
    expect((await listProjects(req())).status).toBe(401);
  });
});
