import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { messageId } = await params;
    const { resolved } = await request.json();

    const existing = await prisma.teamMessage.findUnique({
      where: { id: messageId },
      select: { id: true, fromUserId: true, toUserId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // A flag is a question one person asked another. Only those two get to
    // say it's been dealt with — anyone on the team could previously close
    // out a flag they had no part in, which quietly loses the ask.
    // Broadcasts (toUserId null) stay resolvable by anyone, since they were
    // addressed to everybody in the first place.
    const isParticipant =
      existing.fromUserId === session.userId ||
      existing.toUserId === session.userId ||
      existing.toUserId === null;

    if (!isParticipant) {
      return NextResponse.json(
        { error: 'Only the sender or the recipient can resolve this flag' },
        { status: 403 }
      );
    }

    const message = await prisma.teamMessage.update({
      where: { id: messageId },
      data: { resolved: Boolean(resolved) },
    });

    return NextResponse.json({ success: true, message }, { status: 200 });
  } catch (error) {
    console.error('Update team message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
