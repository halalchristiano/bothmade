import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isLeadStatus } from '@/lib/leads';

/**
 * Puts a lead back exactly as it was before a call outcome was logged.
 *
 * Logging an outcome changes three things at once, which is the point — but
 * it also means one wrong tap does three kinds of damage, and "not
 * interested" marks the lead lost and drops it off every list. Someone new to
 * this will mis-tap on a phone, and without a way back the honest response is
 * to stop trusting the buttons.
 *
 * Takes the prior values from the client rather than keeping an audit trail:
 * undo is only ever offered immediately after the action that produced them,
 * and a full revision history is a much bigger thing to maintain than this
 * problem warrants.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { leadId } = await params;
    const { activityId, previous } = await request.json();

    if (!previous || typeof previous !== 'object') {
      return NextResponse.json({ error: 'Nothing to restore.' }, { status: 400 });
    }
    if (previous.status && !isLeadStatus(previous.status)) {
      return NextResponse.json({ error: 'Invalid previous status.' }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const restored = await prisma.lead.update({
      where: { id: leadId },
      data: {
        status: previous.status ?? undefined,
        nextFollowUpAt: previous.nextFollowUpAt ? new Date(previous.nextFollowUpAt) : null,
        lostReason: previous.lostReason ?? null,
        // Undoing a mis-tapped "wrong number" has to put the lead back in the
        // callable band, or the undo only half-worked.
        phoneInvalidAt: previous.phoneInvalidAt ? new Date(previous.phoneInvalidAt) : null,
        // Logging the call books an automated email three days out. An undone
        // call that leaves it booked sends "we spoke the other day" to
        // somebody whose call was never really logged — the one piece of this
        // undo that reaches outside the app, so it is the one that matters
        // most to put back.
        autoFollowUpDueAt: previous.autoFollowUpDueAt ? new Date(previous.autoFollowUpDueAt) : null,
        updatedAt: new Date(),
      },
    });

    // Remove the note too, scoped to this lead so an id from elsewhere can't
    // be used to delete someone else's activity.
    if (activityId) {
      await prisma.leadActivity
        .deleteMany({ where: { id: activityId, leadId } })
        .catch((err) => console.error('Could not remove the undone activity:', err));
    }

    return NextResponse.json({ success: true, lead: restored }, { status: 200 });
  } catch (error) {
    console.error('Call outcome undo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
