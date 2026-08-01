import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from './auth';

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
 * Protect a route - requires admin role
 */
export async function requireAdmin(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session || session.type !== 'user') {
    return null;
  }

  if ('role' in session && session.role !== 'admin') {
    return null;
  }

  return session;
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
