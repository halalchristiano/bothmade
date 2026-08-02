import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { requireRole, ANY_STAFF } from '@/lib/authz';
import { unauthorizedResponse } from '@/lib/middleware';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

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
