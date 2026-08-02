import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, setAuthCookie, createToken } from '@/lib/auth';
import {
  LOGIN_LIMITS,
  checkRateLimit,
  clearRateLimit,
  clientKey,
} from '@/lib/rate-limit';

function tooManyAttempts(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: 'Too many sign-in attempts. Please try again in a few minutes.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

export async function POST(request: NextRequest) {
  try {
    const { email, password, userType = 'user' } = await request.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Two windows, because they catch different attacks: one host spraying
    // many accounts trips the IP limit, many hosts targeting one account
    // trip the account limit. Both are checked before a single bcrypt
    // comparison runs, so an attacker can't use this endpoint as a CPU sink
    // either. Cleared on success so an honest typo streak costs nothing.
    const ip = clientKey(request);
    const account = `${userType}:${String(email).trim().toLowerCase()}`;

    const byIp = checkRateLimit('login-ip', ip, LOGIN_LIMITS.perIp);
    if (byIp.limited) return tooManyAttempts(byIp.retryAfterSeconds);

    const byAccount = checkRateLimit('login-account', account, LOGIN_LIMITS.perAccount);
    if (byAccount.limited) return tooManyAttempts(byAccount.retryAfterSeconds);

    if (userType === 'client') {
      // Client login
      const client = await prisma.client.findUnique({
        where: { email },
      });

      if (!client) {
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      const passwordValid = await verifyPassword(password, client.password);
      if (!passwordValid) {
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      if (client.archivedAt) {
        return NextResponse.json(
          { error: 'This account has been decommissioned. Contact us if you believe this is a mistake.' },
          { status: 403 }
        );
      }

      // Update last login
      await prisma.client.update({
        where: { id: client.id },
        data: { lastLoginAt: new Date() },
      });

      clearRateLimit('login-ip', ip);
      clearRateLimit('login-account', account);

      // Create auth token
      const token = createToken({
        clientId: client.id,
        email: client.email,
        type: 'client',
      });

      await setAuthCookie(token);

      return NextResponse.json(
        {
          success: true,
          client: {
            id: client.id,
            email: client.email,
            company: client.company,
            mustChangePassword: client.mustChangePassword,
          },
        },
        { status: 200 }
      );
    } else {
      // Admin/User login
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      const passwordValid = await verifyPassword(password, user.password);
      if (!passwordValid) {
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      clearRateLimit('login-ip', ip);
      clearRateLimit('login-account', account);

      // Create auth token
      const token = createToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        type: 'user',
      });

      await setAuthCookie(token);

      return NextResponse.json(
        {
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
