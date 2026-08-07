import { NextResponse } from 'next/server';
import { prisma } from './prisma';
import {
  getCurrentSession,
  isTokenRevoked,
  type AuthPayload,
  type ClientAuthPayload,
} from './auth';

/**
 * Route guards.
 *
 * These used to be three unused helpers, one of which was actively wrong:
 * `requireAdmin` rejected any session whose role wasn't the literal string
 * `'admin'`, which excluded the two roles the app actually issues — `owner`
 * (Kiana) and `sales` (Evan). Had anything adopted it, the owner would have
 * been locked out of her own admin API while a generic account sailed
 * through. Every admin route instead hand-rolled `session.type !== 'user'`,
 * so the helper's bug stayed invisible.
 *
 * Owner-vs-sales, decided: **every row in the User table is staff, and staff
 * see the whole admin surface.** That's a two-person studio where both people
 * cover for each other; pretending otherwise would be a permission model
 * nobody enforces. What is *not* shared is the small set of actions where the
 * two roles have different authority — approving a discount below the floor,
 * deleting records in bulk. Those go through `requireOwner`, and that is the
 * only role distinction enforced anywhere. `sales` is a real, checked
 * constraint; it is not decoration.
 *
 * The names below say what they check, so a call site can't be wrong about it.
 * Two more helpers that lived here — a bare `requireAuth` and an
 * `isClientAuthorized` that was a one-line `===` — are gone rather than
 * fixed: nothing called either, and an unused guard is just a guard nobody
 * has checked. Ownership is enforced where the query is (`findFirst` scoped
 * by `clientId`), which is harder to forget than a comparison helper.
 */

/**
 * Any Bothmade team member, regardless of role. This is the guard for the
 * admin API surface — it replaces the old, broken `requireAdmin`.
 */
export async function requireStaff(): Promise<AuthPayload | null> {
  const session = await getCurrentSession();
  if (!session || session.type !== 'user') return null;

  // A 7-day JWT outlives a password change, so the claim alone isn't enough:
  // check the account still honours sessions from this token's vintage. This
  // is what makes "change your password" actually evict a stolen session —
  // without it the thief kept access for the rest of the week.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { sessionsValidFrom: true, role: true },
  });

  // Deleted since the token was minted.
  if (!user) return null;
  if (isTokenRevoked(session.iat, user.sessionsValidFrom)) return null;

  /*
   * The role comes from the row, not from the token.
   *
   * A JWT is a claim minted at sign-in and good for a week; `role` is a fact
   * that /admin/team can change at any moment. Trusting the claim meant a
   * re-role did nothing until the token aged out, in both directions and both
   * of them wrong:
   *
   * Demoting an owner to `sales` left their existing session holding owner
   * authority for the rest of the week — still able to add teammates, remove
   * teammates, re-role anybody including themselves, delete leads in bulk and
   * quote below the pricing floor. That is the one change somebody makes when
   * they specifically want that authority to stop.
   *
   * And promoting somebody had the opposite failure: the page said `owner`,
   * the row said `owner`, and every owner-gated action kept refusing them
   * until they happened to sign out. There was nothing on screen to explain
   * it and no way to force it.
   *
   * This costs nothing — the row is already being read for the revocation
   * check above. Deletion and password changes were the only two account
   * events this guard noticed; a role change is the third.
   */
  return { ...session, role: user.role };
}

/**
 * Staff with owner authority. The only actions gated on this are ones where
 * `sales` is deliberately constrained — pricing below the authorized floor,
 * and destructive bulk operations.
 */
export async function requireOwner(): Promise<AuthPayload | null> {
  const session = await requireStaff();
  if (!session) return null;
  return session.role === 'owner' ? session : null;
}

/** True when this staff session may quote below the calculated floor. */
export function canOverridePricing(session: AuthPayload): boolean {
  return session.role !== 'sales';
}

/**
 * A discriminated union rather than two nullable fields, so `if (!session)
 * return response` narrows to a real Response at every call site instead of
 * `Response | null`.
 */
export type ClientSessionCheck =
  | { session: ClientAuthPayload; response: null }
  | { session: null; response: NextResponse };

/**
 * A logged-in client, with the first-login password change enforced here
 * rather than in the browser.
 *
 * `mustChangePassword` was previously a hint the login page used to pick a
 * redirect. A client who ignored the redirect — or who never used the
 * browser at all — kept full API access on the auto-generated password we
 * emailed them in plaintext. Now the server refuses everything except the
 * routes needed to actually change it.
 *
 * Pass `allowPasswordChange: true` on those routes (client settings, /auth/me).
 */
export async function requireClient(
  opts: { allowPasswordChange?: boolean } = {}
): Promise<ClientSessionCheck> {
  const session = await getCurrentSession();

  if (!session || session.type !== 'client') {
    return { session: null, response: unauthorizedResponse() };
  }

  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    select: { archivedAt: true, mustChangePassword: true, sessionsValidFrom: true },
  });

  // Deleted or decommissioned since the token was minted — a 7-day JWT
  // outlives an offboarding, so re-check rather than trusting the claim.
  if (!client || client.archivedAt) {
    return { session: null, response: unauthorizedResponse() };
  }

  // Same re-check for sessions explicitly revoked by a password change.
  if (isTokenRevoked(session.iat, client.sessionsValidFrom)) {
    return { session: null, response: unauthorizedResponse() };
  }

  if (client.mustChangePassword && !opts.allowPasswordChange) {
    return { session: null, response: passwordChangeRequiredResponse() };
  }

  return { session, response: null };
}

export type PrincipalCheck =
  | { session: AuthPayload | ClientAuthPayload; response: null }
  | { session: null; response: NextResponse };

/**
 * Any authenticated principal, with the client-side rules applied when the
 * principal is a client. Use on routes both staff and clients hit (project
 * detail, messages, onboarding) so the forced password change can't be
 * sidestepped by calling the API directly.
 */
export async function requirePrincipal(
  opts: { allowPasswordChange?: boolean } = {}
): Promise<PrincipalCheck> {
  const session = await getCurrentSession();

  if (!session) return { session: null, response: unauthorizedResponse() };
  if (session.type === 'user') return { session, response: null };

  return requireClient(opts);
}

/** 403 telling the client (and the browser) to go set a real password first. */
export function passwordChangeRequiredResponse() {
  return NextResponse.json(
    { error: 'Set your own password before continuing.', code: 'PASSWORD_CHANGE_REQUIRED' },
    { status: 403 }
  );
}

/**
 * Create an unauthorized response
 */
export function unauthorizedResponse() {
  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401 }
  );
}

/**
 * Create a forbidden response
 */
export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json(
    { error: message },
    { status: 403 }
  );
}
