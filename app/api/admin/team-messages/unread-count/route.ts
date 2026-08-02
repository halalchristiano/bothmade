import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { requireRole, ANY_STAFF } from '@/lib/authz';
import { unauthorizedResponse } from '@/lib/middleware';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const count = await prisma.teamMessage.count({
      where: {
        readAt: null,
        fromUserId: { not: session.userId },
        OR: [{ toUserId: session.userId }, { toUserId: null }],
      },
    });

    return NextResponse.json({ success: true, count }, { status: 200 });
  } catch (error) {
    console.error('Unread team messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
