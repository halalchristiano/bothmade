import { NextResponse } from 'next/server';
import { getCurrentSession, createOAuthState } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { buildGoogleAuthUrl, isGoogleOAuthConfigured } from '@/lib/gmail-oauth';

/** Kicks off "Sign in with Google" — redirects straight to Google's consent screen. */
export async function GET() {
  const session = await getCurrentSession();
  if (!session || session.type !== 'user') return unauthorizedResponse();

  if (!isGoogleOAuthConfigured()) {
    return NextResponse.json(
      { error: 'Google sign-in is not configured yet (GOOGLE_OAUTH_CLIENT_ID/SECRET missing).' },
      { status: 500 }
    );
  }

  const state = createOAuthState(session.userId);
  return NextResponse.redirect(buildGoogleAuthUrl(state));
}
