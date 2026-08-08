import { NextRequest, NextResponse } from 'next/server';
import { resolveSiteUrl } from '@/lib/site-url';
import { prisma } from '@/lib/prisma';
import { verifyOAuthState } from '@/lib/auth';
import { encryptSecret } from '@/lib/crypto';
import { exchangeGoogleAuthCode, createGmailOAuthBatchClient, setupBounceFolder } from '@/lib/gmail-oauth';

const SITE_URL = resolveSiteUrl();

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

  const claims = state ? verifyOAuthState(state) : null;
  if (!claims || !code) {
    return NextResponse.redirect(settingsUrl({ gmailOauth: 'error', reason: 'invalid-state' }));
  }
  const userId = claims.userId;

  try {
    const { refreshToken, email } = await exchangeGoogleAuthCode(code);

    await prisma.user.update({
      where: { id: userId },
      data: {
        googleRefreshToken: encryptSecret(refreshToken),
        gmailNeedsReconnect: false,
        gmailAddress: email,
        gmailConnectedAt: new Date(),
      },
    });

    // Set up the bounce-notice label/filter automatically right here — no
    // reason to make connecting Google a two-step "connect, then remember
    // to also click this other button" flow. Best-effort: a failure here
    // shouldn't block the connection itself from succeeding.
    let bounceFolderSet = true;
    try {
      const client = createGmailOAuthBatchClient(refreshToken);
      const result = await setupBounceFolder(client);
      bounceFolderSet = result.ok;
    } catch (err) {
      console.error('Auto bounce-folder setup failed:', err);
      bounceFolderSet = false;
    }

    // An owner who connected a teammate's mailbox goes back to Team, not to
    // their own Settings — that page still shows *their* mailbox, unchanged,
    // which is the one thing guaranteed to read as "it didn't work". The
    // connected address goes in the query so the page can name what landed
    // rather than just claiming success.
    const done = claims.delegated
      ? `${SITE_URL}/admin/team?${new URLSearchParams({
          gmailOauth: 'success',
          connected: email,
          bounceFolder: bounceFolderSet ? 'ok' : 'failed',
        }).toString()}`
      : settingsUrl({ gmailOauth: 'success', bounceFolder: bounceFolderSet ? 'ok' : 'failed' });

    return NextResponse.redirect(done);
  } catch (error) {
    console.error('Gmail OAuth callback error:', error);
    const reason = error instanceof Error ? error.message : 'unknown';
    return NextResponse.redirect(settingsUrl({ gmailOauth: 'error', reason }));
  }
}
