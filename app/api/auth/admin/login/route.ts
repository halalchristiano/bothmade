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
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Throttled before the account is even looked up, so an attacker cannot
    // grind guesses at network speed against a staff account.
    const ip = clientIp(request);
    const guard = await checkLoginAllowed(email, ip);
    if (!guard.allowed) {
      return tooManyAttempts(guard.retryAfterSeconds);
    }

    // Every row in the User table is a Bothmade team member — any role
    // (owner, sales, admin, manager, support, ...) is valid staff access.
    const user = await prisma.user.findUnique({ where: { email } });

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

    // A correct password clears the account's failure history, so a legitimate
    // person who mistyped a few times isn't left throttled.
    await clearFailedLogins(email);

    const token = createToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      type: 'user',
      sv: user.sessionVersion,
    });

    await setAuthCookie(token);

    return NextResponse.json(
      {
        success: true,
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
