import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, setAuthCookie, createToken } from '@/lib/auth';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Staff credentials open every lead, client and contract in the
    // business. Keyed by source address only — see the note on the client
    // login route for why there is no per-account counter here.
    const message = 'Too many login attempts. Please wait and try again.';
    const limited = await enforceRateLimit(request, 'admin-login', RATE_LIMITS.login, message);
    if (limited) return limited;


    // Every row in the User table is a Bothmade team member — any role
    // (owner, sales, admin, manager, support, ...) is valid staff access.
    const user = await prisma.user.findUnique({ where: { email } });

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
