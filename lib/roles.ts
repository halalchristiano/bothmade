/**
 * Team roles. Until now these were bare strings compared inline in a handful
 * of places — `role === 'sales'` in the call list, in the nav filter, in the
 * dashboard switch — with nothing naming the set or saying what each one is
 * allowed to do. Adding a page that edits them needs both.
 */

export const USER_ROLES = ['owner', 'sales', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  sales: 'Sales',
  admin: 'Admin',
};

/**
 * Shown next to each option so the choice isn't a guess. Worded against what
 * is actually enforced (see lib/middleware.ts): every staff account reaches
 * the whole admin surface, and the role only decides the few places where
 * that isn't true.
 */
export const USER_ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: 'Staff, plus the owner-only actions: managing the team and quoting below the floor.',
  sales: 'Staff, and inbound leads are assigned here. Cannot quote below the calculated floor.',
  admin: 'Staff. The full admin surface, without the owner-only actions.',
};

/**
 * Who can add, remove or re-role a teammate — the UI mirror of
 * `requireOwner()`, which is where it is actually enforced.
 *
 * Owner-only, matching the role split in lib/middleware.ts: staff share the
 * admin surface, and the exceptions are the handful of actions where `sales`
 * is deliberately constrained. Deciding who else gets an account is one of
 * them — inbound is assigned to whoever holds `sales`, so a rep who could
 * edit roles could hand themselves every lead.
 */
export function canManageTeam(role: string | null | undefined): boolean {
  return role === 'owner';
}
