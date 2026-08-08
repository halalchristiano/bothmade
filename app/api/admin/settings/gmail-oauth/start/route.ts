import { NextRequest, NextResponse } from 'next/server';
import { createOAuthState } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireOwner, requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { buildGoogleAuthUrl, isGoogleOAuthConfigured } from '@/lib/gmail-oauth';

/**
 * Kicks off "Sign in with Google" — redirects straight to Google's consent
 * screen. This is hit directly as a link href (from Settings, the team list
 * and the call list's "Reconnect email" banner), so when it can't proceed it
 * has to redirect somewhere with an explanation, not return raw JSON — a rep
 * clicking the button would otherwise land on a bare API error page with no
 * way back into the app.
 *
 * ## Connecting a mailbox that is not your own
 *
 * `?userId=` connects Google to a *different* team account, and only an owner
 * may pass it. Without it this behaves exactly as it always has.
 *
 * The reason it exists is the outreach mailbox. Automated follow-ups go from
 * their own address on the secondary sending domain — deliberately not
 * "whoever made the call", because they must not come from a mailbox that is
 * being warmed or is under a restriction. A mailbox is a `User` row here, so
 * that address needs an account, and the account needs Google connected.
 *
 * Until now the only way to do the second half was to sign out and sign in as
 * that account, because the state was minted from `session.userId` and the
 * callback writes to whoever the state names. So the real procedure was:
 * create the teammate, note the password shown once, sign out, sign in as
 * them, connect Google, sign out, sign back in. Nothing said so, and the
 * notification that asks for it reads like two clicks. It is the reason that
 * mailbox has gone unconnected for weeks while the follow-up cron declined
 * every weekday into a log nobody opens.
 *
 * Owner-only because it is the same authority as adding and re-roling
 * teammates, which is where `requireOwner` already draws the line. Note what
 * it is *not*: it cannot read or move an existing connection. All it does is
 * name whose row the next consent screen writes to — and whoever clicks it
 * still has to sign into Google as that mailbox and grant access. Nobody
 * gains a mailbox they could not already log into Google as.
 */
export async function GET(request: NextRequest) {
  const session = await requireStaff();
  if (!session) return unauthorizedResponse();

  const settingsError = (reason: string, page = '/admin/settings') => {
    const url = new URL(page, request.url);
    url.searchParams.set('gmailOAuthError', reason);
    return NextResponse.redirect(url);
  };

  if (!isGoogleOAuthConfigured()) return settingsError('not_configured');

  const requested = request.nextUrl.searchParams.get('userId');

  // The ordinary case, and the only one a non-owner can reach: your own.
  if (!requested || requested === session.userId) {
    return NextResponse.redirect(buildGoogleAuthUrl(createOAuthState(session.userId)));
  }

  if (!(await requireOwner())) {
    return settingsError('not_owner', '/admin/team');
  }

  // Resolved against the table rather than trusted: the state this mints is
  // signed, so an id that never existed would otherwise mint a valid state
  // pointing at nothing and fail much later, inside the callback, as a bare
  // Prisma error on the way back from Google.
  const target = await prisma.user.findUnique({
    where: { id: requested },
    select: { id: true },
  });
  if (!target) return settingsError('unknown_teammate', '/admin/team');

  return NextResponse.redirect(
    buildGoogleAuthUrl(createOAuthState(target.id, { delegated: true }))
  );
}
