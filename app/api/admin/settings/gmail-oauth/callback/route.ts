import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyOAuthState } from '@/lib/auth';
import { encryptSecret } from '@/lib/crypto';
import { exchangeGoogleAuthCode } from '@/lib/gmail-oauth';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

/** Where Google redirects back to after the user approves (or denies) access. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const googleError = searchParams.get('error');

  const settingsUrl = (params: Record<string, string>) =>
    `${SITE_URL}/admin/settings?${new URLSearchParams(params).toString()}`;

  if (googleError) {
    return NextResponse.redirect(settingsUrl({ gmailOauth: 'error', reason: googleError }));
  }

  const userId = state ? verifyOAuthState(state) : null;
  if (!userId || !code) {
    return NextResponse.redirect(settingsUrl({ gmailOauth: 'error', reason: 'invalid-state' }));
  }

  try {
    const { refreshToken, email } = await exchangeGoogleAuthCode(code);

    await prisma.user.update({
      where: { id: userId },
      data: {
        googleRefreshToken: encryptSecret(refreshToken),
        gmailAddress: email,
        gmailConnectedAt: new Date(),
      },
    });

    return NextResponse.redirect(settingsUrl({ gmailOauth: 'success' }));
  } catch (error) {
    console.error('Gmail OAuth callback error:', error);
    const reason = error instanceof Error ? error.message : 'unknown';
    return NextResponse.redirect(settingsUrl({ gmailOauth: 'error', reason }));
  }
}
