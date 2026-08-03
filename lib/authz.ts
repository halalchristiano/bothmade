import { NextResponse } from 'next/server';
import type { AuthPayload } from '@/lib/auth';

/**
 * Which staff roles may reach which routes.
 *
 * The admin nav already hides Clients, Projects, Priorities and Team from a
 * sales account — the boundary is drawn in the interface. It was not drawn
 * anywhere else, so a sales session could call those endpoints directly and
 * read every client record, project file and revenue figure. Hiding a button
 * is not access control.
 *
 * The point is not that Evan is untrustworthy. It is that a phished or
 * borrowed sales session should not be able to export the whole client book,
 * and neither should a bug in the sales UI.
 *
 * This deliberately does not gate the CRM. Leads, outreach, the call list,
 * mockups and team chat are where sales lives all day, and narrowing those
 * would be a workflow change dressed up as a security one.
 *
 * ADDING A ROLE: add it to `Role` and to whichever sets it belongs in.
 * Unknown roles are denied and logged rather than quietly allowed — if
 * someone is unexpectedly locked out, the server log names the role and the
 * fix is one line here.
 */

export type Role = 'owner' | 'admin' | 'sales';

/**
 * Client records, project files, and money. The studio's own operations, and
 * exactly the pages the nav already withholds from sales.
 */
export const OPS: readonly Role[] = ['owner', 'admin'];

/**
 * The CRM surface — leads, outreach, pipeline, tasks, internal chat. Sales
 * lives here, and so does everyone else. Named so a route can say out loud
 * that it is open to all staff rather than saying nothing.
 */
export const ANY_STAFF: readonly Role[] = ['owner', 'admin', 'sales'];

/**
 * Role check for a session already established as staff. Returns a response
 * to send, or null to continue — so it drops in after the existing
 * authentication block without restructuring the handler:
 *
 *   const session = await requireStaff();
 *   if (!session) return unauthorizedResponse();
 *   const denied = requireRole(session, OPS);
 *   if (denied) return denied;
 *
 * 401 means "who are you", 403 means "not you" — the distinction matters to
 * someone signed in and looking at a screen they should not have, and it is
 * not information an anonymous caller ever gets.
 */
export function requireRole(
  session: AuthPayload,
  allowed: readonly Role[]
): NextResponse | null {
  // A staff token with no role predates roles, or came from an older deploy.
  // Treat it as the least privileged thing it could be — an absent claim must
  // never widen access.
  const role = (session.role ?? 'sales') as Role;

  if (allowed.includes(role)) return null;

  console.warn(
    `[authz] denied: role "${role}" is not in [${allowed.join(', ')}] (user ${session.userId})`
  );

  return NextResponse.json({ error: 'You do not have access to this.' }, { status: 403 });
}
