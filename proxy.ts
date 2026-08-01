import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'auth_token';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isClientRoute = pathname.startsWith('/client');
  const isAdminRoute = pathname.startsWith('/admin');

  if (!isClientRoute && !isAdminRoute) {
    return NextResponse.next();
  }

  if (pathname === '/client/login' || pathname === '/admin/login') {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? verifyToken(token) : null;

  if (isClientRoute && (!session || session.type !== 'client')) {
    return NextResponse.redirect(new URL('/client/login', request.url));
  }

  if (isAdminRoute && (!session || session.type !== 'user')) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/client/:path*', '/admin/:path*'],
};
