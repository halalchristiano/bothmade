import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { decryptSecret } from '@/lib/crypto';
import { createGmailOAuthBatchClient, setupBounceFolder, BOUNCE_LABEL_NAME } from '@/lib/gmail-oauth';

/** One-click setup: creates the bounce-notice label + inbox-skip filter in the connected Google account. */
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
        { error: 'Connect your Google account with "Sign in with Google" first.' },
        { status: 400 }
      );
    }

    const client = createGmailOAuthBatchClient(decryptSecret(user.googleRefreshToken));
    const result = await setupBounceFolder(client);

    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.error?.includes('insufficient') || result.error?.toLowerCase().includes('scope')
              ? 'Your Google connection is missing the label/filter permission — disconnect and reconnect with "Sign in with Google" to grant it.'
              : result.error || 'Failed to set up the bounce folder',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, labelName: BOUNCE_LABEL_NAME, alreadyExisted: result.alreadyExisted }, { status: 200 });
  } catch (error) {
    console.error('Bounce folder setup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
