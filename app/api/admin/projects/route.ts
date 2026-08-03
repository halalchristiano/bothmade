import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff } from '@/lib/middleware';
import { OPS, requireRole } from '@/lib/authz';

export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    // Client records and project money are ops, not sales — the admin
    // nav already withholds these pages from a sales account.
    const denied = requireRole(session, OPS);
    if (denied) return denied;


    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const status = searchParams.get('status');

    const where: Record<string, string> = {};
    if (clientId) where.clientId = clientId;
    if (status) where.status = status;

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
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
      { success: true, projects },
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
