import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { pageMeta, parsePageParams } from '@/lib/pagination';

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession();

    if (!session || session.type !== 'user') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const status = searchParams.get('status');

    const where: Record<string, string> = {};
    if (clientId) where.clientId = clientId;
    if (status) where.status = status;

    const params = parsePageParams(searchParams);
    const total = await prisma.project.count({ where });

    const projects = await prisma.project.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            email: true,
            company: true,
            phone: true,
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { isFromAdmin: true, createdAt: true },
        },
        updates: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        payments: {
          select: { amount: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: params.skip,
      take: params.take,
    });

    return NextResponse.json(
      { success: true, projects, ...pageMeta(params, total) },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get projects error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
