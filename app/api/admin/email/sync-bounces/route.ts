import { NextResponse } from 'next/server';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { syncBouncesForUser, syncRepliesForUser } from '@/lib/bounce-sync';

/**
 * On-demand bounce check for the signed-in user's mailbox — the button on the
 * call list, for right after a batch of sends. The nightly job does the same
 * thing unattended; this exists so nobody has to wait for it.
 */
export async function POST() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const [result, replies] = await Promise.all([
      syncBouncesForUser(session.userId),
      syncRepliesForUser(session.userId).catch(() => null),
    ]);
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
      {
        success: true,
        scanned: result.scanned + (replies?.scanned ?? 0),
        flagged: result.flagged,
        companies: result.companies,
        repliesFlagged: replies?.flagged ?? 0,
        repliedCompanies: replies?.companies ?? [],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Bounce sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
