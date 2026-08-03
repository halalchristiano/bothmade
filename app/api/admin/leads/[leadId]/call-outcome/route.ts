import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isFurtherAlong, type LeadStatus } from '@/lib/leads';
import { findCallOutcome } from '@/lib/call-outcomes';

/**
 * Records everything that follows from one phone call in a single request:
 * the activity note, the pipeline status, and the next follow-up date.
 *
 * Doing it as three separate actions meant reps skipped the boring two, and
 * a lead with no follow-up date is a lead nobody rings again. One tap here
 * has to do all of it or it doesn't get done at all.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }

    const { leadId } = await params;
    const { outcome: outcomeKey, note, followUpAt, lostReason } = await request.json();

    const outcome = findCallOutcome(outcomeKey);
    if (!outcome) {
      return NextResponse.json({ error: 'Unknown call outcome' }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Whatever the rep typed is the useful part; the canned line is only
    // there so the log is never empty.
    const content = note?.trim() ? `${outcome.note} ${note.trim()}` : outcome.note;

    // "Not interested" is the one status allowed to move a lead backwards —
    // every other outcome only ever advances it, so re-logging an early call
    // can't drag a lead back down the pipeline.
    let nextStatus: LeadStatus | undefined;
    if (outcome.status === 'lost') {
      nextStatus = 'lost';
    } else if (outcome.status && isFurtherAlong(lead.status, outcome.status)) {
      nextStatus = outcome.status;
    }

    let nextFollowUpAt: Date | null | undefined;
    if (followUpAt) {
      nextFollowUpAt = new Date(followUpAt);
    } else if (outcome.followUpDays !== null) {
      const d = new Date();
      d.setDate(d.getDate() + outcome.followUpDays);
      nextFollowUpAt = d;
    } else if (outcome.status === 'lost') {
      nextFollowUpAt = null; // stop it appearing in anyone's follow-up queue
    }

    // Captured before the write so a mis-tap can be put back exactly as it
    // was. A wrong "not interested" marks the lead lost, wipes its follow-up
    // and drops it off every list — the single most damaging mis-tap here.
    const previous = {
      status: lead.status,
      nextFollowUpAt: lead.nextFollowUpAt ? lead.nextFollowUpAt.toISOString() : null,
      lostReason: lead.lostReason,
    };

    const [activity, updated] = await prisma.$transaction([
      prisma.leadActivity.create({
        data: { leadId, type: 'call', content, createdById: session.userId },
        include: { createdBy: { select: { id: true, name: true } } },
      }),
      prisma.lead.update({
        where: { id: leadId },
        data: {
          status: nextStatus,
          nextFollowUpAt,
          lostReason: outcome.status === 'lost' ? lostReason?.trim() || 'Not interested (by phone)' : undefined,
          updatedAt: new Date(),
        },
      }),
    ]);

    return NextResponse.json(
      { success: true, activity, lead: updated, previous, activityId: activity.id },
      { status: 201 }
    );
  } catch (error) {
    console.error('Call outcome error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
