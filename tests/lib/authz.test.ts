import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANY_STAFF, hasRole, requireRole } from '@/lib/authz';
import type { AuthPayload } from '@/lib/auth';

/**
 * The admin surface is shared: every staff account reaches all of it. The
 * second tier that used to withhold client records, project files and money
 * from a sales account came down at the owner's request — a two-person studio
 * where both people cover for each other.
 *
 * So what is left to test here is not a boundary between staff, it's the
 * boundary around staff. `requireRole` still has to refuse a role nobody has
 * heard of and a token carrying no role at all, because those are what an old
 * session or a hand-edited database row looks like — and "we removed a tier"
 * must not have quietly become "anything with a cookie gets in".
 *
 * The real remaining role checks live in lib/middleware.ts: `requireOwner`
 * for managing teammates and bulk deletion, `canOverridePricing` for quoting
 * below the floor. Those have their own tests.
 */

const staff = (role?: string): AuthPayload =>
  ({ userId: 'u1', email: 'e@bothmade.studio', role, type: 'user' }) as AuthPayload;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('every staff role reaches the shared surface', () => {
  it('lets an owner, an admin and a sales account all through', () => {
    expect(requireRole(staff('owner'), ANY_STAFF)).toBeNull();
    expect(requireRole(staff('admin'), ANY_STAFF)).toBeNull();
    expect(requireRole(staff('sales'), ANY_STAFF)).toBeNull();
  });

  it('agrees with hasRole, which decides what the UI offers', () => {
    for (const role of ['owner', 'admin', 'sales']) {
      expect(hasRole(staff(role), ANY_STAFF)).toBe(true);
    }
  });
});

describe('what is still refused', () => {
  it('denies a role nobody has heard of', () => {
    // A typo in the database, or a role from a deploy that has been rolled
    // back. Removing a tier must not have turned this into a pass.
    expect(requireRole(staff('superuser'), ANY_STAFF)?.status).toBe(403);
    expect(hasRole(staff('superuser'), ANY_STAFF)).toBe(false);
  });

  it('denies a token carrying no role claim at all', () => {
    expect(requireRole(staff(undefined), ANY_STAFF)?.status).toBe(403);
  });

  it('answers 403, not 401 — the caller is signed in, just not permitted', () => {
    // 401 would mean "who are you" and bounce a signed-in person back to the
    // login page they already came from.
    expect(requireRole(staff('superuser'), ANY_STAFF)?.status).toBe(403);
  });

  it('says nothing about why, but logs enough to debug a lockout', () => {
    requireRole(staff('superuser'), ANY_STAFF);

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('superuser'));
  });
});
