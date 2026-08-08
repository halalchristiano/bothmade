import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { decryptSecret } from '@/lib/crypto';
import { checkGmailRead, createGmailOAuthBatchClient } from '@/lib/gmail-oauth';

/**
 * Ask Google whether this connection can still read, and record the answer.
 *
 * Sending and reading are separate capabilities here, and only one of them
 * announces itself when it breaks. A send failure is visible immediately —
 * somebody's email does not go. A read failure is silent: the token still
 * sends, so nothing on any screen changes while replies and bounce notices
 * quietly stop being noticed. The flag that records it, `gmailNeedsReconnect`,
 * was only ever written by the nightly bounce job, which means the settings
 * page could sit on a stale answer for a day — or forever, if the job has not
 * run since the token was revoked.
 *
 * So the page can now ask. A read that works clears the flag, a read that
 * fails for an authorisation reason sets it, and a read that fails because
 * Google was busy changes nothing — telling somebody to re-authorise over a
 * quota is how a working connection gets torn down and rebuilt for no reason.
 */
export async function POST() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { googleRefreshToken: true },
    });

    if (!user?.googleRefreshToken) {
      return NextResponse.json(
        {
          success: true,
          canRead: false,
          needsReconnect: false,
          message:
            'No Google account is connected on this login, so there is nothing to check. Connect one below to read replies and bounces.',
        },
        { status: 200 }
      );
    }

    let refreshToken: string;
    try {
      refreshToken = decryptSecret(user.googleRefreshToken);
    } catch {
      // The stored credential cannot be read, which no amount of retrying
      // fixes — reconnecting is the only way out, so say so.
      await prisma.user
        .update({ where: { id: session.userId }, data: { gmailNeedsReconnect: true } })
        .catch(() => null);
      return NextResponse.json(
        {
          success: true,
          canRead: false,
          needsReconnect: true,
          message: 'The stored Google credentials could not be read. Reconnect to fix it.',
        },
        { status: 200 }
      );
    }

    const result = await checkGmailRead(createGmailOAuthBatchClient(refreshToken));

    // Only a definite answer is written. A read that worked proves the scope
    // is there whatever we thought before; a read that failed on Google being
    // busy proves nothing either way, and must not flip the flag.
    if (result.canRead || result.needsReconnect) {
      await prisma.user
        .update({
          where: { id: session.userId },
          data: { gmailNeedsReconnect: !result.canRead },
        })
        .catch((e) => console.error('Could not record Gmail reconnect state:', e));
    }

    return NextResponse.json(
      {
        success: true,
        canRead: result.canRead,
        needsReconnect: result.needsReconnect,
        message: result.canRead
          ? 'Checked — this connection can read your inbox, so replies and bounce notices are being seen.'
          : result.error,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Gmail read check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
