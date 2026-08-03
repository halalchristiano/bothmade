import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { mockupInclude, toMockupDTO } from '@/lib/mockups';

/**
 * The mockups on the logged-in rep's own live deals — what design has sent
 * over, in version order, ready to open on a call. Leads still waiting on a
 * first mockup are included too: the point of the card is "where is the
 * visual for this deal", and "still with design" is an answer to that.
 */
export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const leads = await prisma.lead.findMany({
      where: {
        // Same "mine" rule the rest of the sales dashboard uses: assigned to
        // me, or to nobody yet, so nothing falls through the cracks.
        OR: [{ assignedToId: session.userId }, { assignedToId: null }],
        status: { notIn: ['lost', 'won'] },
        AND: [{ OR: [{ mockups: { some: {} } }, { mockupRequested: true }] }],
      },
      select: {
        id: true,
        company: true,
        mockupRequested: true,
        mockupRequestedAt: true,
        mockups: { orderBy: { createdAt: 'asc' }, include: mockupInclude },
      },
      take: 25,
    });

    const rows = leads.map((lead) => ({
      id: lead.id,
      company: lead.company,
      mockupRequested: lead.mockupRequested,
      mockupRequestedAt: lead.mockupRequestedAt?.toISOString() ?? null,
      mockups: lead.mockups.map(toMockupDTO),
    }));

    // Newest delivery first — a mockup that landed this morning is the one
    // being acted on. Leads still waiting sink below, longest wait first,
    // since those are chases rather than calls to make.
    const latest = (r: (typeof rows)[number]) =>
      r.mockups.length > 0 ? new Date(r.mockups[r.mockups.length - 1]!.uploadedAt).getTime() : null;
    rows.sort((a, b) => {
      const [la, lb] = [latest(a), latest(b)];
      if (la !== null && lb !== null) return lb - la;
      if (la !== null) return -1;
      if (lb !== null) return 1;
      const waited = (r: (typeof rows)[number]) =>
        r.mockupRequestedAt ? new Date(r.mockupRequestedAt).getTime() : Infinity;
      return waited(a) - waited(b);
    });

    return NextResponse.json({ success: true, leads: rows }, { status: 200 });
  } catch (error) {
    console.error('Mockups feed error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
