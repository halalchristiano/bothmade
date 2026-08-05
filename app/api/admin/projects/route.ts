import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';

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
    const denied = requireRole(session, ANY_STAFF);
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
          select: { amount: true, type: true },
        },
        // The money, on the page where the work is. A delivery list that
        // shows status and timeline but not whether the client has paid
        // makes the two halves of a project someone's job to hold in their
        // head — and the half that pays the rent is the one that was missing.
        instalments: {
          orderBy: { index: 'asc' },
          select: { index: true, label: true, amountCents: true, status: true, dueAt: true, trigger: true },
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
