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
    const { email, password, userType = 'user' } = await request.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Two counters, because they stop different attacks. Per source address
    // stops one machine grinding; per account stops a proxy pool grinding one
    // known inbox, which never spends any single address's budget and so
    // never trips the first counter at all.
    //
    // The per-account one does hand anyone who knows an email a way to lock
    // its owner out. That is the accepted cost: it takes ten wrong passwords,
    // it lasts fifteen minutes, and only failures count — a correct password
    // clears the record, so nobody is ever throttled by their own use.
    const message = 'Too many login attempts. Please wait and try again.';
    const limited = await enforceRateLimit(request, 'login', RATE_LIMITS.login, message);
    if (limited) return limited;

    // Scoped by userType: a client and a staff account sharing an address
    // are different accounts and must not share a budget.
    const accountBudget = accountKey(`login-${userType}`, String(email));
    const account = await checkFailures(accountBudget, RATE_LIMITS.loginAccount);
    if (!account.allowed) {
      return rateLimitResponse(
        account,
        'Too many failed sign-ins for this account. Please try again shortly.'
      );
    }


    if (userType === 'client') {
      // Client login
      const client = await prisma.client.findUnique({
        where: { email },
      });

      if (!client) {
        // Counted even with no such account, so spraying addresses is not a
        // free way to learn which ones are real.
        await recordFailure(accountBudget, RATE_LIMITS.loginAccount);
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      const passwordValid = await verifyPassword(password, client.password);
      if (!passwordValid) {
        await recordFailure(accountBudget, RATE_LIMITS.loginAccount);
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      // Right password — whatever came before was this person mistyping.
      await clearFailures(accountBudget);

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
        // Counted even with no such account, so spraying addresses is not a
        // free way to learn which ones are real.
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

      // Right password — whatever came before was this person mistyping.
      await clearFailures(accountBudget);

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
