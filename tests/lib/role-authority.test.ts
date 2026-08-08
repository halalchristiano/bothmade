import { describe, expect, it } from 'vitest';
import { canOverridePricing } from '@/lib/middleware';
import {
  USER_ROLES,
  USER_ROLE_DESCRIPTIONS,
  USER_ROLE_LABELS,
  canManageTeam,
  isUserRole,
  type UserRole,
} from '@/lib/roles';
import type { AuthPayload } from '@/lib/auth';

/**
 * What the role picker says a role can do, against what the routes let it do.
 *
 * lib/roles had no tests, and the strings in it are not decoration: they are
 * the sentence under the dropdown an owner reads at the moment they decide
 * what somebody else may do. USER_ROLE_DESCRIPTIONS said the below-the-floor
 * pricing authority was one of "the owner-only actions", and that Admin was
 * "the full admin surface, without the owner-only actions" — while
 * canOverridePricing has always been `role !== 'sales'`, so Admin has it.
 *
 * The enforcement is the intended one: two separate comments in
 * lib/middleware.ts and lib/authz.ts say `sales` is the role deliberately
 * constrained, and `sales` is the only role the guard actually refuses. It
 * was the description that drifted — which is the worse direction for it to
 * drift in, because handing someone Admin is exactly the moment you are
 * relying on that sentence being true.
 */

const session = (role: string): AuthPayload =>
  ({ userId: 'u1', email: 'a@b.test', role, type: 'user' }) as AuthPayload;

describe('quoting below the calculated floor', () => {
  it('is refused for sales, which is the constraint the guard exists for', () => {
    expect(canOverridePricing(session('sales'))).toBe(false);
  });

  it('is allowed for owner and admin alike', () => {
    expect(canOverridePricing(session('owner'))).toBe(true);
    expect(canOverridePricing(session('admin'))).toBe(true);
  });

  it('is described to match, role by role, in both directions', () => {
    // The failure this file was written for. Each description is read by
    // somebody handing out authority, so it has to agree with the guard —
    // and staying silent about an authority a role HAS is the same lie as
    // claiming one it hasn't. Admin said neither, next to an Owner line that
    // called this authority owner-only.
    for (const role of USER_ROLES) {
      const says = USER_ROLE_DESCRIPTIONS[role].toLowerCase();
      if (canOverridePricing(session(role))) {
        expect(says, `${role} has the pricing authority and must say so`).toContain('below the floor');
        expect(says).not.toContain('cannot quote below');
      } else {
        expect(says, `${role} lacks it and must say so`).toContain('cannot quote below');
      }
    }
  });

  it('does not call the pricing authority owner-only, because it is not', () => {
    expect(USER_ROLE_DESCRIPTIONS.owner.toLowerCase()).not.toMatch(
      /owner-only actions:[^.]*quoting below/
    );
  });
});

describe('managing the team', () => {
  it('is owner-only, and every other role is refused', () => {
    expect(canManageTeam('owner')).toBe(true);
    for (const role of USER_ROLES.filter((r) => r !== 'owner')) {
      expect(canManageTeam(role)).toBe(false);
    }
  });

  it('refuses an absent or unrecognised role rather than assuming one', () => {
    expect(canManageTeam(null)).toBe(false);
    expect(canManageTeam(undefined)).toBe(false);
    expect(canManageTeam('')).toBe(false);
    expect(canManageTeam('Owner')).toBe(false);
    expect(canManageTeam('superuser')).toBe(false);
  });

  it('is described to match, and every role that lacks it says so out loud', () => {
    // Same rule as the pricing line above: a role picker that stays silent
    // about an authority is a role picker somebody guesses at.
    for (const role of USER_ROLES) {
      const says = USER_ROLE_DESCRIPTIONS[role].toLowerCase();
      expect(says.includes('cannot manage the team')).toBe(!canManageTeam(role));
    }
    expect(USER_ROLE_DESCRIPTIONS.owner.toLowerCase()).toContain('can manage the team');
  });
});

describe('the set of roles itself', () => {
  it('accepts exactly the roles the pickers offer', () => {
    for (const role of USER_ROLES) expect(isUserRole(role)).toBe(true);
  });

  it('refuses anything else, which is what an old token or a typed row looks like', () => {
    for (const value of ['OWNER', 'ops', '', null, undefined, 0, {}, ['owner']]) {
      expect(isUserRole(value)).toBe(false);
    }
  });

  it('has a label and a description for every role, so no picker renders a blank', () => {
    for (const role of USER_ROLES) {
      expect(USER_ROLE_LABELS[role as UserRole]).toBeTruthy();
      expect(USER_ROLE_DESCRIPTIONS[role as UserRole]).toBeTruthy();
    }
  });

  it('matches the roles authz will actually honour', () => {
    // Two lists of the same three strings in two files is how one of them
    // quietly stops including a role that the database still hands out.
    expect([...USER_ROLES].sort()).toEqual(['admin', 'owner', 'sales']);
  });
});
