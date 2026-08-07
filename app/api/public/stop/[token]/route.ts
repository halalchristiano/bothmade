import { NextRequest, NextResponse } from 'next/server';
import { resolveSiteUrl } from '@/lib/site-url';
import { recordUnsubscribe } from '@/lib/unsubscribe-record';

/**
 * One-click unsubscribe, as RFC 8058 and Gmail's bulk-sender rules define it.
 *
 * This is the URL in the `List-Unsubscribe` header, and it is a different
 * address from the one in the email's footer for a reason worth writing down.
 *
 * The footer link goes to a page with a button, because a GET must never
 * change anything: corporate mail security fetches every link in every
 * message, and a GET that unsubscribed meant a scanner could silently kill a
 * lead in a way indistinguishable from a prospect asking to be left alone.
 * That lesson is recorded in ../route.ts and it still holds.
 *
 * But the mail client's own Unsubscribe control has nobody sitting in front
 * of it. Gmail sends a POST carrying `List-Unsubscribe=One-Click` and expects
 * the job to be done — offering it a confirmation page is how the control
 * appears to work and doesn't. So: POST acts, GET does not.
 *
 * A GET here is somebody's mail client rendering the header as an ordinary
 * link, so it hands them the page that asks. A scanner following it lands on
 * the same page and changes nothing, which is the whole point.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  await recordUnsubscribe(token);

  /*
   * 200 and the same body either way, whether the token was real or not.
   *
   * Two reasons, and they happen to agree. Gmail reads a non-2xx as "this
   * sender's unsubscribe is broken", which counts against precisely the
   * reputation this header exists to protect — and an unrecognised token
   * means there is nothing left to unsubscribe, so failure would be untrue
   * as well as expensive.
   *
   * The other is that a `shareToken` is the same capability the proposal and
   * brief links carry. An answer that distinguished a real token from a made
   * up one would turn this into somewhere to sweep for valid ones. The
   * sibling route rate-limits for that reason; this one cannot, because the
   * callers are Gmail's servers rather than people and a rate limit there
   * would break the control it exists to serve. Saying nothing does the same
   * job here.
   */
  return NextResponse.json({ ok: true });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(`${resolveSiteUrl()}/stop/${encodeURIComponent(token)}`, 303);
}
