import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from './auth';
import { prisma } from './prisma';
import { canManageTeam } from './roles';

/**
 * Protect a route - requires authentication
 * Returns user/client session or null if not authenticated
 */
export async function requireAuth(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return null;
  }

  return session;
}

/**
 * Protect a route - requires a role that can manage the team.
 *
 * The role is read from the database rather than the session, because the JWT
 * carries whatever the role was at login. Someone demoted an hour ago would
 * otherwise keep write access until their token expired — and the first thing
 * this guards is the page that does the demoting.
 *
 * Returns the caller's id and role, or null when they may not manage the team.
 */
export async function requireTeamManager(): Promise<{
  userId: string;
  role: string;
} | null> {
  const session = await getCurrentSession();
  if (!session || session.type !== 'user') return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true },
  });
  if (!user || !canManageTeam(user.role)) return null;

  return { userId: user.id, role: user.role };
}

/**
 * Protect a route - requires client role
 */
export async function requireClient(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session || session.type !== 'client') {
    return null;
  }

  return session;
}

/**
 * Check authorization - match client to resource
 */
export function isClientAuthorized(
  clientId: string,
  sessionClientId: string
): boolean {
  return clientId === sessionClientId;
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
export function forbiddenResponse() {
  return NextResponse.json(
    { error: 'Forbidden' },
    { status: 403 }
  );
}
