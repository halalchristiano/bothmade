import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { sendPasswordResetEmail } from '@/lib/email';
import { checkPasswordStrength } from '@/lib/password-policy';
import { clientIp, enforce, limiterKey, LIMITS } from '@/lib/rate-limit';

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

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour — a reset link is used within minutes or not at all

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
    // Unthrottled, this endpoint is a way to mailbomb any address we hold.
    const limited = enforce([
      { key: limiterKey('password-reset', request), options: LIMITS.passwordResetRequest },
      {
        key: limiterKey(`password-reset:${resolvedType}`, request, normalizedEmail),
        options: LIMITS.passwordResetRequest,
      },
    ]);
    if (limited) return limited;

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

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
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

    const limited = enforce([
      { key: limiterKey('password-reset-submit', request), options: LIMITS.passwordResetSubmit },
    ]);
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

    if (record.userType === 'client') {
      // Setting a password by hand clears the forced-change flag: the
      // auto-generated one they were emailed is no longer in play.
      await prisma.client.update({
        where: { email: record.email },
        data: { password: hashedPassword, mustChangePassword: false },
      });
    } else {
      await prisma.user.update({
        where: { email: record.email },
        data: { password: hashedPassword },
      });
    }

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
