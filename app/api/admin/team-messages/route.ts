import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

/** Thread between the current user and every other team member — a small team, so one flat thread is simplest. */
export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const messages = await prisma.teamMessage.findMany({
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: {
        fromUser: { select: { id: true, name: true, email: true } },
      },
    });

    // Mark direct messages to me read (read receipts) and stamp when I last
    // opened the chat — the latter is what the unread badge keys off, so it
    // clears for broadcasts too, not just direct messages.
    await prisma.teamMessage.updateMany({
      where: { toUserId: session.userId, readAt: null },
      data: { readAt: new Date() },
    });
    await prisma.user.update({
      where: { id: session.userId },
      data: { teamChatReadAt: new Date() },
    });

    return NextResponse.json({ success: true, messages }, { status: 200 });
  } catch (error) {
    console.error('List team messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { content, toUserId, relatedLeadId, relatedProjectId, urgent } = await request.json();
    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    const message = await prisma.teamMessage.create({
      data: {
        content: content.trim(),
        fromUserId: session.userId,
        toUserId: toUserId || null,
        relatedLeadId: relatedLeadId || null,
        relatedProjectId: relatedProjectId || null,
        urgent: Boolean(urgent),
      },
      include: {
        fromUser: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, message }, { status: 201 });
  } catch (error) {
    console.error('Send team message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
