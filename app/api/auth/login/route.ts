import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, setAuthCookie, createToken } from '@/lib/auth';
import { enforce, limiterKey, LIMITS, reset } from '@/lib/rate-limit';

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

    // Two limiters, because either one alone leaves a hole: per-address
    // stops one machine working through a credential list, per-account
    // stops a distributed attempt at one specific inbox. Cleared below on
    // a successful login so a legitimate typo streak costs nothing.
    const ipKey = limiterKey('login', request);
    const accountKey = limiterKey(`login:${userType}`, request, String(email));
    const limited = enforce([
      { key: ipKey, options: LIMITS.login },
      { key: accountKey, options: LIMITS.login },
    ]);
    if (limited) return limited;

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

      reset(ipKey);
      reset(accountKey);

      // Update last login
      await prisma.client.update({
        where: { id: client.id },
        data: { lastLoginAt: new Date() },
      });

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

      reset(ipKey);
      reset(accountKey);

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
