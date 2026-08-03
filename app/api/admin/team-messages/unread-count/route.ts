import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    // The badge counted every message addressed to me *or* broadcast to
    // everyone that had a null readAt — but the thread GET only ever
    // stamped readAt on messages addressed to me specifically. Broadcasts
    // were therefore never marked read by anyone, so the badge showed a
    // number that could go up and never down. Reads now live in their own
    // table, one row per (message, reader), which is also the only shape
    // that can say "Evan has read this broadcast and Kiana hasn't".
    const count = await prisma.teamMessage.count({
      where: {
        fromUserId: { not: session.userId },
        OR: [{ toUserId: session.userId }, { toUserId: null }],
        reads: { none: { userId: session.userId } },
      },
    });

    return NextResponse.json({ success: true, count }, { status: 200 });
  } catch (error) {
    console.error('Unread team messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
