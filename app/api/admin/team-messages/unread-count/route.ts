import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';

export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

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
