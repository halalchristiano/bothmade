import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';

/**
 * "I have actually seen the chat."
 *
 * Read-marking used to be a side effect of listing messages, which meant a
 * background tab's poll marked everything read for a person who never
 * looked. Now the page calls this explicitly — on open and when the tab
 * becomes visible — and the list route just lists.
 */
export async function POST() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const now = new Date();
    await prisma.teamMessage.updateMany({
      where: { toUserId: session.userId, readAt: null },
      data: { readAt: now },
    });
    await prisma.user.update({
      where: { id: session.userId },
      data: { teamChatReadAt: now },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Mark team chat read error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
