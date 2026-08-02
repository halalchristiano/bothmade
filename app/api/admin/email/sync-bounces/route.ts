import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { syncBouncesForUser } from '@/lib/bounce-sync';

/**
 * On-demand bounce check for the signed-in user's mailbox — the button on the
 * call list, for right after a batch of sends. The nightly job does the same
 * thing unattended; this exists so nobody has to wait for it.
 */
export async function POST() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const result = await syncBouncesForUser(session.userId);
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.error ??
            'Could not read bounce notices. Check your Google connection in Settings.',
          needsReconnect: result.needsReconnect ?? false,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: true, scanned: result.scanned, flagged: result.flagged, companies: result.companies },
      { status: 200 }
    );
  } catch (error) {
    console.error('Bounce sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
