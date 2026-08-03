import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/middleware';

export async function GET(request: NextRequest) {
  try {
    const { session, response } = await requireClient();
    if (!session) return response;

    const projects = await prisma.project.findMany({
      where: { clientId: session.clientId },
      include: {
        updates: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, projects }, { status: 200 });
  } catch (error) {
    console.error('Get client projects error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
