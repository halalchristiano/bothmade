import { NextResponse } from 'next/server';
import { driveDestination } from '@/lib/email-links';
import { resolveSiteUrl } from '@/lib/site-url';

/**
 * The hop that makes a Drive link work on a phone.
 *
 * Emailed Drive links point here rather than straight at Google. On iOS a
 * `drive.google.com` address is a universal link, so a tap in a mail app is
 * handed to the Drive app instead of a browser — and when that app can't
 * resolve the target for its signed-in account, nothing happens at all. No
 * app claims our domain, and a server redirect is not a user-initiated
 * navigation, so the destination opens in the browser the way it should.
 *
 * Not an open redirect: the destination is assembled from a validated Drive
 * ID, so the only place this can ever send anyone is Google Drive. Anything
 * that isn't a well-formed target goes to the site rather than nowhere —
 * whoever clicked is a client holding a link we sent them, and a 404 is a
 * worse answer than the homepage.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  const { kind, id } = await params;
  const destination = driveDestination(kind, id);

  return NextResponse.redirect(destination ?? resolveSiteUrl(), {
    status: 302,
    // The mapping is fixed, but a cached redirect is one we could never
    // correct for a link already sitting in someone's inbox.
    headers: { 'Cache-Control': 'no-store' },
  });
}
