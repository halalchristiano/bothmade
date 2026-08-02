import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

const MAX_LEADS = 500;

/** Deletes every selected lead — for cleaning up a bad CSV import in one shot instead of one at a time. */
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { leadIds } = await request.json();
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'No leads selected' }, { status: 400 });
    }
    if (leadIds.length > MAX_LEADS) {
      return NextResponse.json({ error: `Max ${MAX_LEADS} leads per delete` }, { status: 400 });
    }

    const { count } = await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });

    return NextResponse.json({ success: true, count }, { status: 200 });
  } catch (error) {
    console.error('Bulk delete leads error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
