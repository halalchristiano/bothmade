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

    // Mark everything I can see as read *for me* — direct messages and
    // broadcasts alike. skipDuplicates makes this idempotent, so opening
    // the thread twice is free.
    const unreadForMe = messages.filter(
      (m) => m.fromUserId !== session.userId && (m.toUserId === session.userId || m.toUserId === null)
    );
    if (unreadForMe.length > 0) {
      await prisma.teamMessageRead.createMany({
        data: unreadForMe.map((m) => ({ messageId: m.id, userId: session.userId })),
        skipDuplicates: true,
      });
    }

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

    const { content, toUserId, relatedLeadId, relatedProjectId, urgent, kind } = await request.json();
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
        kind: typeof kind === 'string' && kind ? kind : null,
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
