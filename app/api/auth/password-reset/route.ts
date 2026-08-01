import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import crypto from 'crypto';

// In production, use a real database table for reset tokens
// For now, we'll store them in memory (not production-ready)
const resetTokens = new Map<string, { email: string; userType: string; expiresAt: number }>();

/**
 * Request a password reset link
 */
export async function POST(request: NextRequest) {
  try {
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

    const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Reset Your Password</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: #000; color: #fff; padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background: #f9f9f9; padding: 40px 20px; border-radius: 0 0 8px 8px; }
      .button { display: inline-block; background: #000; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
      .footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0;">Reset Your Password</h1>
      </div>
      <div class="content">
        <p>We received a request to reset your password. Click the link below to create a new password.</p>

        <p>
          <a href="${resetUrl}" class="button">Reset Password</a>
        </p>

        <p>This link will expire in 24 hours.</p>

        <p>If you didn't request this, you can safely ignore this email.</p>

        <p>Best regards,<br><strong>The Bothmade Team</strong></p>
      </div>
      <div class="footer">
        <p>&copy; 2026 Bothmade. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>
    `;

    await sendEmail({
      to: email,
      subject: 'Reset Your Bothmade Password',
      html,
    });

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
