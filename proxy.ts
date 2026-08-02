import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'auth_token';

/**
 * Coarse gate in front of the app.
 *
 * The matcher used to cover only `/client/*` and `/admin/*` pages, so the
 * API — which is where the data actually is — had no perimeter at all;
 * every route handler was individually responsible for checking a session,
 * and a new one that forgot was simply public. Those per-route checks are
 * still the authority (they're the ones that know whether *this* client owns
 * *this* project). This is the layer underneath them: an unauthenticated or
 * wrong-audience request never reaches the handler, so forgetting a check in
 * one file is a bug rather than a breach.
 *
 * What this does NOT do is anything requiring a database read — the proxy
 * runs in front of every matched request and Next explicitly warns against
 * slow work here. Record-level authorization, the forced password change,
 * and archived-account checks all live in lib/middleware.ts.
 */

/** API namespaces that are public by design, checked before anything else. */
const PUBLIC_API_PREFIXES = [
  '/api/auth/', // login, logout, password reset, signup (owner-gated in-route)
  '/api/public/', // capability-token share links
  '/api/webhooks/', // Stripe, verified by signature
  '/api/cron/', // Vercel Cron, verified by CRON_SECRET
  '/api/contact',
  '/api/checkout',
  '/api/start/',
  '/api/version', // returns only the environment name when unauthenticated
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isClientRoute = pathname.startsWith('/client');
  const isAdminRoute = pathname.startsWith('/admin');
  const isApiRoute = pathname.startsWith('/api');

  if (!isClientRoute && !isAdminRoute && !isApiRoute) {
    return NextResponse.next();
  }

  if (pathname === '/client/login' || pathname === '/admin/login') {
    return NextResponse.next();
  }

  if (isApiRoute && PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? verifyToken(token) : null;

  // An unauthenticated API call gets a 401, never a redirect — a login page
  // handed back to fetch() reads as a successful response with strange JSON.
  if (isApiRoute) {
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Audience check only. /api/admin/* is staff and /api/client/* is
    // clients; the shared project routes fall through to their own guards,
    // which are the ones that know who owns what.
    if (pathname.startsWith('/api/admin/') && session.type !== 'user') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (pathname.startsWith('/api/client/') && session.type !== 'client') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (isClientRoute && (!session || session.type !== 'client')) {
    return NextResponse.redirect(new URL('/client/login', request.url));
  }

  if (isAdminRoute && (!session || session.type !== 'user')) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/client/:path*', '/admin/:path*', '/api/:path*'],
};
