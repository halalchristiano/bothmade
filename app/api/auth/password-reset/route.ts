import { NextRequest, NextResponse } from 'next/server';
import { resolveSiteUrl } from '@/lib/site-url';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { sendPasswordChangedEmail, sendPasswordResetEmail } from '@/lib/email';
import { checkPasswordStrength, RESET_TOKEN_TTL_MS } from '@/lib/password-policy';
import { RATE_LIMITS, checkRateLimit, clientIp, enforceRateLimit, rateLimitResponse } from '@/lib/rate-limit';

/**
 * Password reset.
 *
 * Tokens used to live in a module-level `Map`, which on serverless meant
 * they belonged to one instance: a link minted by instance A read as
 * "invalid or expired" on instance B, every outstanding link died on
 * redeploy, and the Map itself grew forever holding plaintext tokens. They
 * are now rows in `password_reset_tokens`, storing only the SHA-256 of what
 * we emailed, with a real expiry and single-use enforcement.
 */

/**
 * Shared with the email that states it, because the two disagreed: this was a
 * one-hour token while the mail said "expires in 24 hours", so anyone who read
 * that and came back after lunch met "Invalid or expired token". See
 * lib/password-policy.ts.
 */
const TOKEN_TTL_MS = RESET_TOKEN_TTL_MS;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Request a password reset link
 */
export async function POST(request: NextRequest) {
  try {
    const { email, userType = 'user' } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const resolvedType = userType === 'client' ? 'client' : 'user';

    // Each reset request is an email we send on someone else's say-so.
    // Unthrottled, this endpoint is a way to mailbomb any address we hold —
    // so it is limited per sender and per targeted address.
    const message = 'Too many reset requests. Please wait and try again.';
    const limited = await enforceRateLimit(request, 'password-reset', RATE_LIMITS.passwordReset, message);
    if (limited) return limited;

    const perAccount = await checkRateLimit(
      `password-reset:${resolvedType}:${normalizedEmail}`,
      RATE_LIMITS.passwordReset
    );
    if (!perAccount.allowed) return rateLimitResponse(perAccount, message);

    // Same body and same status either way — whether an address has an
    // account here is not something this endpoint should confirm.
    const genericBody = { success: true, message: 'If email exists, reset link will be sent' };

    const accountExists =
      resolvedType === 'client'
        ? (await prisma.client.findUnique({ where: { email: normalizedEmail }, select: { id: true } })) !== null
        : (await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } })) !== null;

    if (!accountExists) {
      return NextResponse.json(genericBody, { status: 200 });
    }

    // Any earlier link for this account stops working the moment a new one
    // is issued — otherwise "I requested three, which one is live?" has
    // three answers, and two of them are links sitting in an old inbox.
    await prisma.passwordResetToken.updateMany({
      where: { email: normalizedEmail, userType: resolvedType, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = crypto.randomBytes(32).toString('hex');

    await prisma.passwordResetToken.create({
      data: {
        tokenHash: hashToken(token),
        email: normalizedEmail,
        userType: resolvedType,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        requestedIp: clientIp(request),
      },
    });

    // Opportunistic cleanup of anything long dead, so the table doesn't
    // accumulate rows nobody will ever look at again.
    await prisma.passwordResetToken
      .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } })
      .catch(() => null);

    const siteUrl = resolveSiteUrl();
    const resetUrl = `${siteUrl}/auth/reset-password?token=${token}`;

    await sendPasswordResetEmail(normalizedEmail, resetUrl);

    return NextResponse.json(genericBody, { status: 200 });
  } catch (error) {
    console.error('Password reset request error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Reset password with token
 */
export async function PUT(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || typeof token !== 'string' || !password) {
      return NextResponse.json(
        { error: 'Token and password are required' },
        { status: 400 }
      );
    }

    const limited = await enforceRateLimit(
      request,
      'password-reset-submit',
      RATE_LIMITS.passwordReset,
      'Too many attempts. Please wait and try again.'
    );
    if (limited) return limited;

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 }
      );
    }

    const strength = checkPasswordStrength(password, record.email);
    if (!strength.ok) {
      return NextResponse.json({ error: strength.error }, { status: 400 });
    }

    // Burn the token before doing the update, and only if it's still
    // unused — two requests racing with the same link means exactly one of
    // them gets to set the password.
    const claimed = await prisma.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 }
      );
    }

    const hashedPassword = await hashPassword(password);

    // Every existing session for this account dies here. A reset is the flow
    // someone reaches *because* they think they've lost control of the
    // account — leaving an already-issued 7-day token working would defeat
    // the point of the reset. Unlike the settings route there's no cookie to
    // re-issue: whoever did this isn't signed in, they're on a reset link,
    // and they log in fresh afterwards.
    const revokedAt = new Date();

    if (record.userType === 'client') {
      // Setting a password by hand clears the forced-change flag: the
      // auto-generated one they were emailed is no longer in play.
      await prisma.client.update({
        where: { email: record.email },
        data: {
          password: hashedPassword,
          mustChangePassword: false,
          sessionsValidFrom: revokedAt,
        },
      });
    } else {
      await prisma.user.update({
        where: { email: record.email },
        data: { password: hashedPassword, sessionsValidFrom: revokedAt },
      });
    }

    /*
     * Tell the account it just happened.
     *
     * This is the one flow where nobody being told is the whole problem. A
     * reset link is all it takes to own an account, and until now a
     * successful one was completely silent: the owner's next sign-in simply
     * failed, with nothing anywhere to say when it changed or that it was
     * changed at all. Sent after the password is committed, so it can only
     * ever report something that actually happened, and best-effort — the
     * reset has already succeeded and must not be undone by a mail provider.
     */
    await sendPasswordChangedEmail({
      toEmail: record.email,
      via: 'reset',
      changedAtLabel: revokedAt.toLocaleString('en-US', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'UTC',
      }) + ' UTC',
    }).catch((error) => console.error(`Password-changed notice failed for ${record.email}:`, error));

    return NextResponse.json(
      { success: true, message: 'Password reset successful' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Password reset error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
