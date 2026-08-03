import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { mockupInclude, normalizeMockupUrl, toMockupDTO } from '@/lib/mockups';

/**
 * Notes on one mockup ("showed it Tuesday, they want the menu on the
 * homepage"), and a way to correct a link that was pasted wrong — the only
 * two things that change about a mockup after it's attached.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string; mockupId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { leadId, mockupId } = await params;
    const body = await request.json();

    const existing = await prisma.leadMockup.findFirst({ where: { id: mockupId, leadId } });
    if (!existing) return NextResponse.json({ error: 'Mockup not found' }, { status: 404 });

    let url: string | undefined;
    if (body.url !== undefined) {
      const normalized = normalizeMockupUrl(body.url);
      if (!normalized) {
        return NextResponse.json(
          { error: "That doesn't look like a link — it needs to start with https://" },
          { status: 400 }
        );
      }
      url = normalized;
    }

    const mockup = await prisma.leadMockup.update({
      where: { id: mockupId },
      data: {
        note: typeof body.note === 'string' ? body.note.slice(0, 10000) : undefined,
        url,
      },
      include: mockupInclude,
    });

    // The lead's cached mockupUrl points at the newest mockup; if that's the
    // one whose link was just corrected, the cache has to follow it.
    if (url) {
      const newest = await prisma.leadMockup.findFirst({
        where: { leadId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (newest?.id === mockupId) {
        await prisma.lead.update({ where: { id: leadId }, data: { mockupUrl: url } });
      }
    }

    return NextResponse.json({ success: true, mockup: toMockupDTO(mockup) }, { status: 200 });
  } catch (error) {
    console.error('Update lead mockup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
