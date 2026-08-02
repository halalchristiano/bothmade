import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANY_STAFF, OPS, requireRole, type Role } from '@/lib/authz';
import type { AuthPayload } from '@/lib/auth';

/**
 * The role gate is a pure function guarding client records, project files, and
 * money. It is exactly the sort of thing a later refactor can loosen by
 * accident, so its behaviour is pinned here.
 */

const staff = (role?: string): AuthPayload => ({
  userId: 'u1',
  email: 'someone@bothmade.studio',
  role,
  type: 'user',
});

// The gate logs every denial. Silence it here, and reset between tests so one
// test's calls are never counted as another's.
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requireRole', () => {
  it('lets an owner through to ops', () => {
    expect(requireRole(staff('owner'), OPS)).toBeNull();
  });

  it('lets an admin through to ops', () => {
    expect(requireRole(staff('admin'), OPS)).toBeNull();
  });

  it('refuses sales at ops, with 403 rather than 401', () => {
    const denied = requireRole(staff('sales'), OPS);

    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(403);

    // 401 would tell a signed-in person to log in again, which is wrong and
    // sends them round a loop. 403 says "not you".
    expect(denied!.status).not.toBe(401);
  });

  it('lets sales through to the CRM surface', () => {
    expect(requireRole(staff('sales'), ANY_STAFF)).toBeNull();
  });

  it('treats a token with no role as the least privileged thing it could be', () => {
    // An absent claim must never widen access — otherwise stripping a field
    // from a token would be an escalation.
    expect(requireRole(staff(undefined), OPS)).not.toBeNull();
    expect(requireRole(staff(undefined), ANY_STAFF)).toBeNull();
  });

  it('denies a role nobody has registered', () => {
    // Fails closed: a future role gets 403 and a log line naming it, rather
    // than silently inheriting access it was never granted.
    expect(requireRole(staff('intern'), OPS)).not.toBeNull();
    expect(requireRole(staff('intern'), ANY_STAFF)).not.toBeNull();
  });

  it('names the offending role in the log, so a lockout is diagnosable', () => {
    const warn = vi.mocked(console.warn);

    requireRole(staff('intern'), OPS);

    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain('intern');
  });
});

describe('capability sets', () => {
  it('keeps ops strictly narrower than all-staff', () => {
    for (const role of OPS) {
      expect(ANY_STAFF).toContain(role);
    }
    expect(OPS.length).toBeLessThan(ANY_STAFF.length);
  });

  it('does not grant sales the ops capability', () => {
    expect(OPS).not.toContain('sales' as Role);
  });
});
