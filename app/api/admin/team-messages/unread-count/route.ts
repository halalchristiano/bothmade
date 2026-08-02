import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    // Unread = messages not sent by me, addressed to me or broadcast, that
    // arrived since I last opened the chat. Keying off the per-user
    // teamChatReadAt (rather than the shared TeamMessage.readAt) is what lets
    // broadcasts clear per-user instead of never clearing at all.
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { teamChatReadAt: true },
    });

    const count = await prisma.teamMessage.count({
      where: {
        fromUserId: { not: session.userId },
        OR: [{ toUserId: session.userId }, { toUserId: null }],
        ...(user?.teamChatReadAt ? { createdAt: { gt: user.teamChatReadAt } } : {}),
      },
    });

    return NextResponse.json({ success: true, count }, { status: 200 });
  } catch (error) {
    console.error('Unread team messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
