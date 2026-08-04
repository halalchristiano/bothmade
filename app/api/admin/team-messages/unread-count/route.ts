import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { unreadWhere } from '@/lib/team-chat';

export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    // Unread = messages not sent by me, addressed to me or broadcast, that
    // arrived since I last opened the chat.
    //
    // Keying off the per-user teamChatReadAt rather than the shared
    // TeamMessage.readAt is the point: readAt is one column on the message
    // itself, so the first person to open a broadcast marked it read for
    // everybody — the rest never saw a badge for it at all.
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { teamChatReadAt: true },
    });

    const count = await prisma.teamMessage.count({
      where: unreadWhere(session.userId, user?.teamChatReadAt ?? null),
    });

    return NextResponse.json({ success: true, count }, { status: 200 });
  } catch (error) {
    console.error('Unread team messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
