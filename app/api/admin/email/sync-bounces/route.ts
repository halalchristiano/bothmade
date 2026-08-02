import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { decryptSecret } from '@/lib/crypto';
import { createGmailOAuthBatchClient, scanBouncedAddresses } from '@/lib/gmail-oauth';

/**
 * Reads the bounce label in the connected Google account and flags every lead
 * whose address came back undeliverable.
 *
 * Bounces arrive long after the send reported success, so nothing in the send
 * path can catch them. Until they're read back, a dead address stays
 * "contacted" and the rep keeps emailing a black hole. Flagged leads go
 * straight to the top of the call list, because a phone call is now the only
 * way to reach them.
 */
export async function POST() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { googleRefreshToken: true },
    });
    if (!user?.googleRefreshToken) {
      return NextResponse.json(
        { error: 'Connect your Google account in Settings first — bounces are read from your mailbox.' },
        { status: 400 }
      );
    }

    let refreshToken: string;
    try {
      refreshToken = decryptSecret(user.googleRefreshToken);
    } catch {
      return NextResponse.json(
        { error: 'Your Google connection could not be read. Reconnect it in Settings.' },
        { status: 400 }
      );
    }

    const scan = await scanBouncedAddresses(createGmailOAuthBatchClient(refreshToken));
    if (!scan.ok) {
      return NextResponse.json(
        { error: scan.error, needsReconnect: scan.needsReconnect ?? false },
        { status: 400 }
      );
    }
    if (scan.addresses.length === 0) {
      return NextResponse.json({ success: true, scanned: scan.scanned, flagged: 0 }, { status: 200 });
    }

    // Only flag leads that aren't already flagged, so re-running doesn't keep
    // resetting the date on bounces that were dealt with weeks ago.
    const matches = await prisma.lead.findMany({
      where: {
        email: { in: scan.addresses, mode: 'insensitive' },
        emailDeliveryFailedAt: null,
        status: { notIn: ['won', 'lost'] },
      },
      select: { id: true, company: true },
    });

    if (matches.length > 0) {
      await prisma.lead.updateMany({
        where: { id: { in: matches.map((m) => m.id) } },
        data: {
          emailDeliveryFailedAt: new Date(),
          emailDeliveryFailedReason:
            "The email bounced back — this address doesn't work. Call them instead.",
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        scanned: scan.scanned,
        flagged: matches.length,
        companies: matches.map((m) => m.company),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Bounce sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
