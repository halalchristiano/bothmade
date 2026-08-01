import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession();

    if (!session || session.type !== 'client') {
      return unauthorizedResponse();
    }

    const projects = await prisma.project.findMany({
      where: { clientId: session.clientId },
      include: {
        updates: {
          take: 1,
          orderBy: { createdAt: 'desc' },
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
