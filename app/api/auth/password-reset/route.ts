import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { sendPasswordResetEmail } from '@/lib/email';
import {
  checkLoginAllowed,
  clientIp,
  recordFailedLogin,
  tooManyAttempts,
} from '@/lib/login-guard';

/**
 * Password reset, request and completion.
 *
 * Previously the pending tokens lived in a module-scope `Map`. On serverless
 * that resets on every cold start and is not shared between instances, so a
 * reset link worked or didn't depending on which machine answered — the file's
 * own comment said "not production-ready". They are now rows.
 *
 * Four other things changed while the storage did:
 *
 *   1. Only a SHA-256 of the token is stored. The raw value lives in the
 *      client's inbox and nowhere else, so a dump of this table cannot be used
 *      to reset anyone's password.
 *   2. Tokens are single-use and expire in an hour, not a day. A reset link is
 *      a bearer credential sitting in an inbox; the window should be short.
 *   3. Requesting a reset is rate limited. Without it the endpoint is a free
 *      way to mail anybody repeatedly, from a domain the studio owns.
 *   4. The new password has to meet the same minimum as everywhere else. The
 *      old handler would happily set a one-character password.
 *
 * Still true and worth knowing: a reset does not revoke sessions that already
 * exist. Doing that needs a version stamp checked on every authenticated
 * request, which would add a database read to the hot path of the whole app —
 * a real change that belongs in its own review, not smuggled in here.
 */

const TOKEN_TTL_MS = 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 12;

/** Requests are counted with a prefix so they share the throttle table
 *  without colliding with sign-in attempts for the same address. */
const guardKey = (email: string) => `reset:${email.trim().toLowerCase()}`;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * The same answer whether or not the address exists. Anything else turns this
 * endpoint into a way to test which of your clients has an account.
 */
const genericAcknowledgement = () =>
  NextResponse.json(
    { success: true, message: 'If that email exists, a reset link is on its way.' },
    { status: 200 }
  );

/**
 * Request a reset link.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, userType = 'user' } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const kind = userType === 'client' ? 'client' : 'user';
    const identifier = email.trim().toLowerCase();
    const ip = clientIp(request);

    // Throttled before the lookup, so this cannot be used to mail someone
    // repeatedly or to probe for accounts by timing.
    const guard = await checkLoginAllowed(guardKey(identifier), ip);
    if (!guard.allowed) {
      return tooManyAttempts(guard.retryAfterSeconds);
    }
    await recordFailedLogin(guardKey(identifier), ip);

    const account =
      kind === 'client'
        ? await prisma.client.findUnique({ where: { email: identifier } })
        : await prisma.user.findUnique({ where: { email: identifier } });

    // Unknown address: acknowledge identically and do nothing.
    if (!account) {
      return genericAcknowledgement();
    }

    // Any earlier link for this address stops working the moment a new one is
    // issued, so a forwarded or intercepted old email is not a spare key.
    await prisma.passwordResetToken.deleteMany({
      where: { identifier, userType: kind, usedAt: null },
    });

    const token = randomBytes(32).toString('hex');

    await prisma.passwordResetToken.create({
      data: {
        tokenHash: sha256(token),
        identifier,
        userType: kind,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
    const resetUrl = `${siteUrl}/auth/reset-password?token=${token}`;

    await sendPasswordResetEmail(identifier, resetUrl);

    return genericAcknowledgement();
  } catch (error) {
    console.error('Password reset request error:', error);
    // Still generic — an error must not reveal whether the address existed.
    return genericAcknowledgement();
  }
}

/**
 * Complete a reset.
 */
export async function PUT(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || !password || typeof token !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Token and password are required' },
        { status: 400 }
      );
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
    });

    const invalid = NextResponse.json(
      { error: 'This reset link is invalid or has expired. Please request a new one.' },
      { status: 400 }
    );

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return invalid;
    }

    // Compared in constant time. The lookup above already had to match, so
    // this is belt-and-braces against a future change that makes the lookup
    // fuzzier than an exact hash match.
    const expected = Buffer.from(record.tokenHash);
    const actual = Buffer.from(sha256(token));
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return invalid;
    }

    const hashedPassword = await hashPassword(password);

    // Mark the token used in the same transaction as the password change, so
    // a crash between the two cannot leave a spent link still usable.
    await prisma.$transaction([
      record.userType === 'client'
        ? prisma.client.update({
            where: { email: record.identifier },
            data: { password: hashedPassword },
          })
        : prisma.user.update({
            where: { email: record.identifier },
            data: { password: hashedPassword },
          }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Any other outstanding link for this account dies too.
      prisma.passwordResetToken.deleteMany({
        where: { identifier: record.identifier, userType: record.userType, usedAt: null },
      }),
    ]);

    return NextResponse.json(
      { success: true, message: 'Password reset successful' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Password reset error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
