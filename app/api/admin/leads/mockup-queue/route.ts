import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

/**
 * Every lead waiting on a mockup, oldest request first — the dashboard widget
 * only ever showed the top few, so a request could sit past that window
 * without anyone noticing it had slipped.
 *
 * Returns the design brief alongside the request, not just who asked and
 * when. The lead already holds their current site, a written verdict on
 * what's wrong with it, the problems found and the exact list of things the
 * rep is selling — all of it surfaced to the rep and none of it to the person
 * who has to build the thing. A mockup exists to make one specific promise
 * look real, so what it has to demonstrate is the sales pitch.
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
        // The brief.
        painPoints: true,
        salesNote: true,
        originalWebsite: true,
        currentSiteAssessment: true,
        customPainPoints: true,
        essentialPoints: true,
        estimateLowCents: true,
        estimateHighCents: true,
        estimatedValue: true,
      },
    });

    return NextResponse.json({ success: true, leads }, { status: 200 });
  } catch (error) {
    console.error('Mockup queue error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
