import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';

const MAX_LEADS = 500;

/** Reassigns every selected lead to a different rep (or unassigns) in one shot. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { leadIds, assignedToId } = await request.json();
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'No leads selected' }, { status: 400 });
    }
    if (leadIds.length > MAX_LEADS) {
      return NextResponse.json({ error: `Max ${MAX_LEADS} leads per reassign` }, { status: 400 });
    }
    /*
     * `null` means unassign, and is a real answer — unassigned leads show up
     * for everybody by design, so nothing falls through the cracks.
     *
     * An empty string is not that. It is a string, so it passed the type
     * check, and it is falsy, so it skipped the "does this user exist" lookup
     * below — arriving at updateMany as an assignedToId of '', which is not a
     * user but a foreign key violation. On a five-hundred-row bulk action
     * that surfaced as a 500 rather than as "that is not a valid assignee".
     */
    if (assignedToId !== null && (typeof assignedToId !== 'string' || assignedToId.trim() === '')) {
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
