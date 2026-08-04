import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { messageId } = await params;
    const { resolved } = await request.json();

    // updateMany instead of update: a message deleted between render and
    // click is "nothing to do", not a 500 — P2025 was crashing this route.
    const result = await prisma.teamMessage.updateMany({
      where: { id: messageId },
      data: { resolved: Boolean(resolved) },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Update team message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
