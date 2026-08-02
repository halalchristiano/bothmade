import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

/**
 * Every lead waiting on a mockup, oldest request first — the dashboard widget
 * only ever showed the top few, so a request could sit past that window
 * without anyone noticing it had slipped.
 */
export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const leads = await prisma.lead.findMany({
      where: { mockupRequested: true, mockupUrl: null },
      orderBy: { mockupRequestedAt: 'asc' },
      select: {
        id: true,
        company: true,
        contactName: true,
        mockupRequestedAt: true,
        hotLead: true,
        assignedTo: { select: { name: true } },
      },
    });

    return NextResponse.json({ success: true, leads }, { status: 200 });
  } catch (error) {
    console.error('Mockup queue error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
