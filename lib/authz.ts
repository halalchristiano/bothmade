import { NextResponse } from 'next/server';
import { getCurrentSession, type AuthPayload } from '@/lib/auth';

/**
 * Who on the team is allowed to do what.
 *
 * Every admin route previously authorised on `session.type === 'user'` alone —
 * "is this anyone on staff?" — while the dashboard UI already branched on role
 * and showed a sales account a different, narrower screen. So the boundary
 * existed in the interface and not in the API: a sales session could call the
 * ops and finance endpoints directly and read every client record, project
 * file, and revenue figure. Hiding a button is not access control.
 *
 * The point is not that Evan is untrustworthy. It is that a phished or
 * borrowed sales session should not be able to export the entire client book,
 * and neither should a bug in the sales UI.
 *
 * ADDING A ROLE: add it to `Role` and to whichever capability sets it belongs
 * in. Unknown roles are denied and logged rather than silently allowed — if
 * someone is unexpectedly locked out, the server log names the role and the
 * fix is one line here.
 */

export type Role = 'owner' | 'admin' | 'sales';

/**
 * Client records, project files, money, and anything that mails every client
 * at once. The studio's own operations.
 */
export const OPS: readonly Role[] = ['owner', 'admin'];

/**
 * The CRM surface — leads, outreach, pipeline, tasks, internal chat. Sales
 * lives here all day, and so does everyone else.
 */
export const ANY_STAFF: readonly Role[] = ['owner', 'admin', 'sales'];

/**
 * Role check for a session that has already been established as staff.
 *
 * Returns a response to send, or null to continue — which lets it be dropped
 * in immediately after an existing authentication block without restructuring
 * the handler around it:
 *
 *   const session = await getCurrentSession();
 *   if (!session || session.type !== 'user') return unauthorizedResponse();
 *   const denied = requireRole(session, OPS);
 *   if (denied) return denied;
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

export type Gate =
  | { ok: true; session: AuthPayload }
  | { ok: false; response: NextResponse };

/**
 * Gate a route on staff membership and role.
 *
 *   const gate = await requireStaff(OPS);
 *   if (!gate.ok) return gate.response;
 *   // gate.session is a staff session with an allowed role
 *
 * 401 when there is no staff session at all, 403 when there is one but the
 * role is wrong — the distinction matters to a signed-in person seeing a
 * screen they should not, and it is not information an anonymous caller gets.
 */
export async function requireStaff(allowed: readonly Role[] = ANY_STAFF): Promise<Gate> {
  const session = await getCurrentSession();

  if (!session || session.type !== 'user') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  // A staff token without a role predates roles, or was issued by an older
  // deploy. Treat it as the least privileged thing it could be rather than
  // the most — an absent claim must never widen access.
  const role = (session.role ?? 'sales') as Role;

  if (!allowed.includes(role)) {
    console.warn(
      `[authz] denied: role "${role}" is not in [${allowed.join(', ')}] ` +
        `(user ${session.userId})`
    );
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'You do not have access to this.' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session };
}
