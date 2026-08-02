import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

const MAX_LEADS = 500;

/** Reassigns every selected lead to a different rep (or unassigns) in one shot. */
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { leadIds, assignedToId } = await request.json();
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'No leads selected' }, { status: 400 });
    }
    if (leadIds.length > MAX_LEADS) {
      return NextResponse.json({ error: `Max ${MAX_LEADS} leads per reassign` }, { status: 400 });
    }
    if (assignedToId !== null && typeof assignedToId !== 'string') {
      return NextResponse.json({ error: 'Invalid assignee' }, { status: 400 });
    }
    if (assignedToId) {
      const exists = await prisma.user.findUnique({ where: { id: assignedToId }, select: { id: true } });
      if (!exists) return NextResponse.json({ error: 'That team member no longer exists' }, { status: 400 });
    }

    const { count } = await prisma.lead.updateMany({
      where: { id: { in: leadIds } },
      data: { assignedToId },
    });

    return NextResponse.json({ success: true, count }, { status: 200 });
  } catch (error) {
    console.error('Bulk reassign leads error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
