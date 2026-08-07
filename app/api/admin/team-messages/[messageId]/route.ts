import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { visibleToWhere } from '@/lib/team-chat';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { messageId } = await params;
    const { resolved } = await request.json();

    /*
     * Scoped to what this caller can see, not just to an id.
     *
     * The listing route is careful about this — broadcasts and my own DMs,
     * because "Only the two of you see this" has to be true at the API rather
     * than in the filter the browser applies. Resolving looked a message up by
     * id alone, so any staff account could clear or re-raise the urgent flag on
     * a conversation it was not allowed to open: the flag disappears from the
     * other pair's bell, or comes back, and neither of them touched it.
     *
     * A message somebody may not see answers 404, the same as one that does
     * not exist. Confirming which of the two it is would leak the fact that a
     * private thread exists.
     *
     * updateMany instead of update: a message deleted between render and
     * click is "nothing to do", not a 500 — P2025 was crashing this route.
     */
    const result = await prisma.teamMessage.updateMany({
      where: { AND: [{ id: messageId }, visibleToWhere(session.userId)] },
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
