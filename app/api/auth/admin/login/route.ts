import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, setAuthCookie, createToken } from '@/lib/auth';
import {
  RATE_LIMITS,
  accountKey,
  checkFailures,
  clearFailures,
  enforceRateLimit,
  rateLimitResponse,
  recordFailure,
} from '@/lib/rate-limit';

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
    // business, so both counters apply.
    const message = 'Too many login attempts. Please wait and try again.';
    const limited = await enforceRateLimit(request, 'admin-login', RATE_LIMITS.login, message);
    if (limited) return limited;

    // Per address stops one machine grinding; per account stops a proxy pool
    // grinding one known address, which never spends any single IP's budget.
    // Checked without incrementing — only a wrong password costs anything.
    const accountBudget = accountKey('admin-login', String(email));
    const account = await checkFailures(accountBudget, RATE_LIMITS.loginAccount);
    if (!account.allowed) {
      return rateLimitResponse(
        account,
        'Too many failed sign-ins for this account. Please try again shortly.'
      );
    }

    // Every row in the User table is a Bothmade team member — any role
    // (owner, sales, admin, manager, support, ...) is valid staff access.
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Counted even though no such account exists, so that spraying
      // addresses is not a way to probe which ones are real for free.
      await recordFailure(accountBudget, RATE_LIMITS.loginAccount);
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const passwordValid = await verifyPassword(password, user.password);
    if (!passwordValid) {
      await recordFailure(accountBudget, RATE_LIMITS.loginAccount);
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // The password was right, so whatever came before it was this person
    // mistyping, not an attack. Wipe the slate.
    await clearFailures(accountBudget);


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
