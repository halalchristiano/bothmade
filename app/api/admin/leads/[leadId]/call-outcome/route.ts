import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isFurtherAlong, lostAtForStatusChange, type LeadStatus } from '@/lib/leads';
import { findCallOutcome } from '@/lib/call-outcomes';
import { autoFollowUpDueDate, callEarnsAutoFollowUp } from '@/lib/auto-follow-up';
import { nextTouch } from '@/lib/next-touch';

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
      // 'YYYY-MM-DD' alone parses as UTC midnight, which the call list then
      // buckets against LOCAL start/end of day — so a follow-up booked for
      // tomorrow surfaced tonight and read overdue a day early in any
      // US timezone. Anchoring to local midnight makes the stored instant
      // agree with the queue that consumes it.
      nextFollowUpAt = /^\d{4}-\d{2}-\d{2}$/.test(followUpAt)
        ? new Date(`${followUpAt}T00:00:00`)
        : new Date(followUpAt);
    } else if (outcome.followUpDays !== null) {
      const d = new Date();
      d.setDate(d.getDate() + outcome.followUpDays);
      nextFollowUpAt = d;
    } else if (outcome.status === 'lost') {
      nextFollowUpAt = null; // stop it appearing in anyone's follow-up queue
    }

    /*
     * The second email, booked now rather than remembered later.
     *
     * Scheduled by the machine at the moment the call is logged, because the
     * alternative is a person deciding to write it in three days' time and
     * that is the decision that never gets made. Only for calls where
     * somebody was actually spoken to — see lib/auto-follow-up.ts for why an
     * unanswered ring must not produce a "we spoke the other day".
     *
     * Set here and not on the mockup answer, so that the follow-up happens
     * whichever surface logged the call and whether or not anybody stayed on
     * the screen long enough to answer a question. Asking for a mockup is
     * what cancels it; nothing is required to make it happen.
     */
    const startsAutoFollowUp =
      callEarnsAutoFollowUp(outcome) &&
      !lead.autoFollowUpSentAt &&
      !lead.autoFollowUpDueAt &&
      !lead.doNotContact &&
      !!lead.email &&
      // A mockup already on the way is the follow-up. Two in a week is how a
      // warm lead learns our emails are automatic.
      !lead.mockupRequested;

    // Captured before the write so a mis-tap can be put back exactly as it
    // was. A wrong "not interested" marks the lead lost, wipes its follow-up
    // and drops it off every list — the single most damaging mis-tap here.
    const previous = {
      status: lead.status,
      nextFollowUpAt: lead.nextFollowUpAt ? lead.nextFollowUpAt.toISOString() : null,
      lostReason: lead.lostReason,
      phoneInvalidAt: lead.phoneInvalidAt ? lead.phoneInvalidAt.toISOString() : null,
      autoFollowUpDueAt: lead.autoFollowUpDueAt ? lead.autoFollowUpDueAt.toISOString() : null,
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
          // "Not interested" is the other way a deal ends, and it needs the
          // decision date for the same reason winning one does.
          lostAt: lostAtForStatusChange(nextStatus, lead),
          nextFollowUpAt,
          lostReason: outcome.status === 'lost' ? lostReason?.trim() || 'Not interested (by phone)' : undefined,
          // A dead/wrong number pulls the lead out of the callable band, so
          // nobody dials it again tomorrow expecting a different result.
          phoneInvalidAt: outcome.phoneInvalid ? new Date() : undefined,
          autoFollowUpDueAt: startsAutoFollowUp
            ? autoFollowUpDueDate()
            : // A flat no cancels anything already booked. Emailing somebody
              // three days after they said no is how you get reported.
              outcome.status === 'lost'
              ? null
              : undefined,
          updatedAt: new Date(),
        },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        activity,
        lead: updated,
        previous,
        activityId: activity.id,
        // So the screen can say what was booked without guessing at the rule,
        // and can ask the one question that changes it.
        autoFollowUpDueAt: updated.autoFollowUpDueAt?.toISOString() ?? null,
        askAboutMockup: Boolean(outcome.spokeToThem) && outcome.status !== 'lost',
        /*
         * What now happens to this lead, in one sentence, computed from what
         * was actually written rather than from what the screen assumes.
         *
         * The single most useful thing to say the instant a call is logged is
         * "this one is handled, and here is when it comes back". Without it
         * the rep is left guessing whether the sheet will pester them about
         * the same business tomorrow — which is the friction the whole
         * post-call flow exists to remove.
         */
        nextTouch: nextTouch({
          // Freshly logged with a date on it, so it is not on today's sheet.
          reason: updated.nextFollowUpAt ? 'scheduled' : 'no-follow-up',
          nextFollowUpAt: updated.nextFollowUpAt,
          autoFollowUpDueAt: updated.autoFollowUpDueAt,
          autoFollowUpStage: updated.autoFollowUpStage,
          mockupRequested: updated.mockupRequested,
          mockupSentAt: updated.mockupSentManuallyAt,
        }),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Call outcome error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
