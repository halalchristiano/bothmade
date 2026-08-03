import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { sendPasswordResetEmail } from '@/lib/email';
import crypto from 'crypto';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';

// In production, use a real database table for reset tokens
// For now, we'll store them in memory (not production-ready)
const resetTokens = new Map<string, { email: string; userType: string; expiresAt: number }>();

/**
 * Request a password reset link
 */
export async function POST(request: NextRequest) {
  try {
    // This endpoint sends mail to an address the caller names, so it is an
    // abuse vector even on the "email not found" path that returns success.
    const limited = await enforceRateLimit(
      request,
      'password-reset',
      RATE_LIMITS.passwordReset,
      'Too many reset requests. Please wait and try again.'
    );
    if (limited) return limited;

    const { email, userType = 'user' } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Check if user exists
    if (userType === 'client') {
      const client = await prisma.client.findUnique({
        where: { email },
      });

      if (!client) {
        // Don't reveal whether email exists for security
        return NextResponse.json(
          { success: true, message: 'If email exists, reset link will be sent' },
          { status: 200 }
        );
      }
    } else {
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return NextResponse.json(
          { success: true, message: 'If email exists, reset link will be sent' },
          { status: 200 }
        );
      }
    }

    // Generate reset token
    const token = crypto.randomBytes(32).toString('hex');
    resetTokens.set(token, {
      email,
      userType,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    });

    // Send reset email
    const resetUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password?token=${token}`;

    await sendPasswordResetEmail(email, resetUrl);

    return NextResponse.json(
      { success: true, message: 'If email exists, reset link will be sent' },
      { status: 200 }
    );
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

    if (!token || !password) {
      return NextResponse.json(
        { error: 'Token and password are required' },
        { status: 400 }
      );
    }

    const tokenData = resetTokens.get(token);
    if (!tokenData || tokenData.expiresAt < Date.now()) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 }
      );
    }

    // Hash new password and update
    const hashedPassword = await hashPassword(password);

    if (tokenData.userType === 'client') {
      await prisma.client.update({
        where: { email: tokenData.email },
        data: { password: hashedPassword },
      });
    } else {
      await prisma.user.update({
        where: { email: tokenData.email },
        data: { password: hashedPassword },
      });
    }

    // Remove token
    resetTokens.delete(token);

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
