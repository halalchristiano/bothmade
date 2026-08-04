import { NextResponse } from 'next/server';
import type { AuthPayload } from '@/lib/auth';

/**
 * Which staff roles may reach which routes.
 *
 * **Every staff account now reaches the whole admin surface.** There used to
 * be a second tier, `OPS`, that withheld client records, project files and
 * revenue figures from a sales account. The studio's owner asked for it to
 * come down: it's a two-person studio where both people cover for each other,
 * and a boundary that means one of them has to ask the other to read a project
 * costs more in a day than it saves in a year. That is a decision about how
 * this business runs, and it is theirs to make.
 *
 * It is worth being honest about what that gave up, because it was real: a
 * phished or borrowed sales session can now read the entire client book, every
 * project file and the money, and so can a bug in the sales UI. The mitigation
 * that remains is the one that always mattered most — sessions are revocable
 * (`sessionsValidFrom`), so a compromised account is cut off by a password
 * change rather than by hoping the blast radius was small.
 *
 * What is still enforced by role lives in lib/middleware.ts, not here:
 * `requireOwner()` gates adding, removing and re-roling teammates, bulk lead
 * deletion, and `canOverridePricing()` gates quoting below the calculated
 * floor. Those are authority over the team and over pricing, not visibility of
 * a page, and they were deliberately kept.
 *
 * So `requireRole(session, ANY_STAFF)` reads as "any staff, and say so out
 * loud" — it is not decoration. It still refuses a role nobody has heard of,
 * which is what an old token or a typo'd database row looks like, and it
 * refuses a token with no role claim at all.
 *
 * ADDING A ROLE: add it to `Role` and to `ANY_STAFF`. Unknown roles are denied
 * and logged rather than quietly allowed — if someone is unexpectedly locked
 * out, the server log names the role and the fix is one line here.
 */

export type Role = 'owner' | 'admin' | 'sales';

/**
 * Every staff role. The only set there is, now that the admin surface is
 * shared — named so a route says "any signed-in staff member" out loud rather
 * than saying nothing and leaving a reader to wonder whether a check was
 * forgotten.
 */
export const ANY_STAFF: readonly Role[] = ['owner', 'admin', 'sales'];

/**
 * Role check for a session already established as staff. Returns a response
 * to send, or null to continue — so it drops in after the existing
 * authentication block without restructuring the handler:
 *
 *   const session = await requireStaff();
 *   if (!session) return unauthorizedResponse();
 *   const denied = requireRole(session, ANY_STAFF);
 *   if (denied) return denied;
 *
 * 401 means "who are you", 403 means "not you" — the distinction matters to
 * someone signed in and looking at a screen they should not have, and it is
 * not information an anonymous caller ever gets.
 */
/**
 * The same test without the response or the log line — for deciding whether
 * to *offer* an action, not whether to allow one. A UI that hides a button it
 * would be refused for is kinder than one that offers it and 403s; the check
 * that enforces anything is still `requireRole` on the route.
 */
export function hasRole(session: AuthPayload, allowed: readonly Role[]): boolean {
  // An absent role claim is refused rather than assumed.
  //
  // This used to fall back to 'sales' — the narrowest role — so that a token
  // predating roles couldn't widen its own access. That reasoning inverted the
  // moment `sales` stopped being the narrow one: with a single shared tier,
  // defaulting to 'sales' would now mean defaulting to *everything*.
  //
  // Refusing costs nothing real. `createToken` fills `role` from a column that
  // is `NOT NULL DEFAULT 'admin'`, so every token login has ever minted
  // carries one, and sessions expire in seven days regardless. A claim we
  // cannot read is a session we should not honour.
  const role = session.role;
  return role !== undefined && role !== null && allowed.includes(role as Role);
}

export function requireRole(
  session: AuthPayload,
  allowed: readonly Role[]
): NextResponse | null {
  if (hasRole(session, allowed)) return null;

  console.warn(
    `[authz] denied: role "${session.role ?? '(none)'}" is not in [${allowed.join(', ')}] (user ${session.userId})`
  );

  return NextResponse.json({ error: 'You do not have access to this.' }, { status: 403 });
}
