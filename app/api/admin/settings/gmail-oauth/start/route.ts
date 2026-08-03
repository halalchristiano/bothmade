import { NextRequest, NextResponse } from 'next/server';
import { createOAuthState } from '@/lib/auth';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { buildGoogleAuthUrl, isGoogleOAuthConfigured } from '@/lib/gmail-oauth';

/**
 * Kicks off "Sign in with Google" — redirects straight to Google's consent
 * screen. This is hit directly as a link href (from Settings and the call
 * list's "Reconnect email" banner), so when it can't proceed it has to
 * redirect somewhere with an explanation, not return raw JSON — a rep
 * clicking the button would otherwise land on a bare API error page with
 * no way back into the app.
 */
export async function GET(request: NextRequest) {
  const session = await requireStaff();
  if (!session) return unauthorizedResponse();

  if (!isGoogleOAuthConfigured()) {
    const url = new URL('/admin/settings', request.url);
    url.searchParams.set('gmailOAuthError', 'not_configured');
    return NextResponse.redirect(url);
  }

  const state = createOAuthState(session.userId);
  return NextResponse.redirect(buildGoogleAuthUrl(state));
}
