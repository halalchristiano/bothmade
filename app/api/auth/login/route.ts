import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, setAuthCookie, createToken } from '@/lib/auth';
import {
  checkLoginAllowed,
  clearFailedLogins,
  clientIp,
  recordFailedLogin,
  tooManyAttempts,
} from '@/lib/login-guard';

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

    // Throttled before either branch looks anything up, so guesses cannot be
    // ground out at network speed against client or staff accounts alike.
    const ip = clientIp(request);
    const guard = await checkLoginAllowed(email, ip);
    if (!guard.allowed) {
      return tooManyAttempts(guard.retryAfterSeconds);
    }

    if (userType === 'client') {
      // Client login
      const client = await prisma.client.findUnique({
        where: { email },
      });

      if (!client) {
        await recordFailedLogin(email, ip);
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      const passwordValid = await verifyPassword(password, client.password);
      if (!passwordValid) {
        await recordFailedLogin(email, ip);
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

      // Create auth token
      const token = createToken({
        clientId: client.id,
        email: client.email,
        type: 'client',
        sv: client.sessionVersion,
      });

      await clearFailedLogins(email);
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
        await recordFailedLogin(email, ip);
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      const passwordValid = await verifyPassword(password, user.password);
      if (!passwordValid) {
        await recordFailedLogin(email, ip);
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      // Create auth token
      const token = createToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        type: 'user',
        sv: user.sessionVersion,
      });

      await clearFailedLogins(email);
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
