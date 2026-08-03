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

/** Shown next to each option so the choice isn't a guess. */
export const USER_ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: 'Full access, including projects, clients and the team.',
  sales: 'Inbound leads are assigned here. Sees the pipeline, not delivery.',
  admin: 'Full access. Same as owner, without being the account holder.',
};

/**
 * Who can add, remove or re-role a teammate.
 *
 * Deliberately not `sales`: inbound is assigned to that role, so letting it
 * edit roles would let a rep hand themselves every lead, or lock out the
 * people who could undo it.
 */
export function canManageTeam(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Roles that keep the CRM usable — at least one has to survive every delete
 * and every role change, or the team page locks itself out and only a
 * database console can reopen it.
 */
export function isPrivilegedRole(role: string | null | undefined): boolean {
  return canManageTeam(role);
}
