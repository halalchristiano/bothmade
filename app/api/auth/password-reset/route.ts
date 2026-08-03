import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { sendPasswordResetEmail } from '@/lib/email';
import { checkRateLimit, clientKey } from '@/lib/rate-limit';

/**
 * Password reset, backed by the database.
 *
 * The tokens used to live in a module-level Map. On serverless, the
 * instance that generated a link is very often not the instance that
 * handles the click, so "Invalid or expired token" was the normal outcome
 * of the forgot-password flow rather than the exception — and there was no
 * /auth/reset-password page for the link to land on anyway, so the flow
 * could not have completed even on a warm instance.
 *
 * Only the SHA-256 of the token is stored. A leak of this table hands over
 * hashes, not working reset links.
 */

const TOKEN_TTL_MS = 60 * 60 * 1000; // one hour; 24h was generous for a credential

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Deliberately identical whether or not the address exists. */
const ACCEPTED = { success: true, message: 'If that email exists, a reset link is on its way.' };

export async function POST(request: NextRequest) {
  try {
    const { email, userType = 'user' } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Reset requests are an email-sending primitive pointed at an address
    // the requester doesn't have to own, so they get their own limit.
    const limited = checkRateLimit('password-reset', clientKey(request), {
      max: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (limited.limited) {
      return NextResponse.json(
        { error: 'Too many reset requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
      );
    }

    const normalized = email.trim().toLowerCase();
    const type = userType === 'client' ? 'client' : 'user';

    const exists =
      type === 'client'
        ? await prisma.client.findUnique({ where: { email: normalized }, select: { id: true } })
        : await prisma.user.findUnique({ where: { email: normalized }, select: { id: true } });

    // Always return the same body: whether an address has an account here is
    // not something an unauthenticated caller gets to enumerate.
    if (!exists) return NextResponse.json(ACCEPTED, { status: 200 });

    // Any older token for this address stops working the moment a new one is
    // issued, so a forwarded or shoulder-surfed link has a bounded life.
    await prisma.passwordResetToken.updateMany({
      where: { email: normalized, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: {
        tokenHash: hashToken(token),
        email: normalized,
        userType: type,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    await sendPasswordResetEmail(
      normalized,
      `${siteUrl}/auth/reset-password?token=${token}&type=${type}`
    );

    return NextResponse.json(ACCEPTED, { status: 200 });
  } catch (error) {
    console.error('Password reset request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Redeem a token and set the new password. */
export async function PUT(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json(
        { error: 'Token and password are required' },
        { status: 400 }
      );
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const limited = checkRateLimit('password-reset-redeem', clientKey(request), {
      max: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (limited.limited) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
      );
    }

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(String(token)) },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired. Request a new one.' },
        { status: 400 }
      );
    }

    const hashedPassword = await hashPassword(password);

    // Marking the token used and changing the password are one unit: a
    // failure between them would leave a live token for an account whose
    // password had already moved.
    await prisma.$transaction(async (tx) => {
      if (record.userType === 'client') {
        await tx.client.update({
          where: { email: record.email },
          // They've just proved control of the mailbox and chosen a
          // password, so the first-login forced change is satisfied.
          data: { password: hashedPassword, mustChangePassword: false },
        });
      } else {
        await tx.user.update({
          where: { email: record.email },
          data: { password: hashedPassword },
        });
      }

      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
    });

    return NextResponse.json(
      { success: true, userType: record.userType, message: 'Password reset successful' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Password reset error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
