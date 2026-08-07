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
    /*
     * Case-folded before anything else touches it.
     *
     * Signup and password-reset both store `email.trim().toLowerCase()`. This
     * route looked the account up by the raw string, so an address typed with
     * any capital — the way a phone keyboard offers it first — matched
     * nothing and answered "Invalid credentials". The password was right; the
     * account existed; there was no way to tell from the outside, and no
     * amount of retrying would have helped.
     *
     * The budget key is folded too, or "Dana@" and "dana@" spend two separate
     * allowances against one account.
     */
    const normalizedEmail = String(email).trim().toLowerCase();

    const accountBudget = accountKey(`login-${userType}`, normalizedEmail);
    const account = await checkFailures(accountBudget, RATE_LIMITS.loginAccount);
    if (!account.allowed) {
      return rateLimitResponse(
        account,
        'Too many failed sign-ins for this account. Please try again shortly.'
      );
    }


    if (userType === 'client') {
      // Client login
      /*
       * findFirst with an insensitive match rather than findUnique.
       *
       * Lowercasing the input alone would not be enough: rows created before
       * this — by the manual project form, which stored whatever was typed —
       * may hold capitals, and those clients would go from "cannot log in
       * with capitals" to "cannot log in at all". Matching case-insensitively
       * finds the account whichever way it was stored, so no data migration
       * is needed and nobody is locked out in the meantime.
       */
      const client = await prisma.client.findFirst({
        where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
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
      // Same as the client branch above.
      const user = await prisma.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
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
