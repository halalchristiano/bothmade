import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { encryptSecret } from '@/lib/crypto';
import { verifyGmailCredentials } from '@/lib/mailer';
import { isDomainDelegationConfigured } from '@/lib/gmail-delegated';
import { isGoogleOAuthConfigured } from '@/lib/gmail-oauth';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { gmailAddress: true, gmailConnectedAt: true, googleRefreshToken: true, gmailAppPassword: true },
    });

    const connectedVia: 'oauth' | 'app-password' | null = user?.googleRefreshToken
      ? 'oauth'
      : user?.gmailAppPassword
        ? 'app-password'
        : null;

    return NextResponse.json(
      {
        connected: connectedVia !== null,
        connectedVia,
        gmailAddress: user?.gmailAddress || null,
        connectedAt: user?.gmailConnectedAt,
        googleOAuthAvailable: isGoogleOAuthConfigured(),
        // True either way this account's sends will land in a real Gmail
        // Sent folder — via OAuth, a personal app password, OR org-wide
        // delegation (which needs no per-user setup at all).
        willLandInGmailSent: connectedVia !== null || isDomainDelegationConfigured(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get Gmail settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { gmailAddress, appPassword } = await request.json();
    if (!gmailAddress || !appPassword) {
      return NextResponse.json({ error: 'Gmail address and app password are required' }, { status: 400 });
    }

    try {
      await verifyGmailCredentials(gmailAddress, appPassword);
    } catch {
      return NextResponse.json(
        {
          error:
            "Couldn't sign in with those details. Make sure it's a 16-character App Password, not your regular Gmail password. If this is a Workspace address (like @bothmade.studio), App Passwords are likely disabled entirely — use \"Sign in with Google\" above instead.",
        },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: {
        gmailAddress,
        gmailAppPassword: encryptSecret(appPassword),
        gmailConnectedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Connect Gmail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    await prisma.user.update({
      where: { id: session.userId },
      data: { gmailAddress: null, gmailAppPassword: null, gmailConnectedAt: null, googleRefreshToken: null },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Disconnect Gmail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
