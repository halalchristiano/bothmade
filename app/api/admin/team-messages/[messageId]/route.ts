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
