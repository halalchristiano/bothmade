import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCronAuth } from '@/lib/cron-auth';
import { sendEnquiryNudge } from '@/lib/email';
import { MAX_NUDGES, leadProblems, nudgeCopy, shouldNudge } from '@/lib/enquiry-nudge';

export const maxDuration = 60;

/**
 * Writes daily to everyone who filled in the enquiry form and has not
 * answered yet.
 *
 * They started this conversation, so it is theirs to end — every message
 * carries a one-click unsubscribe that works without logging into anything,
 * and a reply of any kind stops it. Nothing here decides on its own that
 * somebody is worth pursuing: the only leads it touches are ones who
 * volunteered an email address on our own website.
 *
 * Every send is written to the lead's timeline, including the ones that fail,
 * so "why has this person had nine emails" always has an answer on the page
 * rather than in a log.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const candidates = await prisma.lead.findMany({
      where: {
        source: 'inbound',
        doNotContact: false,
        replyReceivedAt: null,
        status: { in: ['new', 'contacted'] },
        email: { not: null },
      },
      select: {
        id: true,
        company: true,
        contactName: true,
        email: true,
        status: true,
        doNotContact: true,
        replyReceivedAt: true,
        emailDeliveryFailedAt: true,
        painPoints: true,
        shareToken: true,
        activities: {
          where: { type: 'email', content: { startsWith: 'Nudge' } },
          select: { id: true },
        },
      },
      take: 200,
    });

    let sent = 0;
    let stopped = 0;

    for (const lead of candidates) {
      const already = lead.activities.length;
      if (!shouldNudge(lead, already)) {
        if (already >= MAX_NUDGES) stopped += 1;
        continue;
      }

      const copy = nudgeCopy(already, lead.company, leadProblems(lead.painPoints));
      const result = await sendEnquiryNudge({
        toEmail: lead.email!,
        contactName: lead.contactName,
        company: lead.company,
        shareToken: lead.shareToken,
        copy,
        dayNumber: already + 1,
      });

      // Written whether or not it left, because the count is what paces the
      // next one — a send that failed silently and then retried tomorrow at
      // day one again would restart the whole sequence.
      await prisma.leadActivity
        .create({
          data: {
            leadId: lead.id,
            type: 'email',
            content: result.sent
              ? `Nudge ${already + 1} of ${MAX_NUDGES} sent to ${lead.email} — "${copy.subject}".`
              : `Nudge ${already + 1} of ${MAX_NUDGES} to ${lead.email} did not send${
                  result.reason ? ` (${result.reason})` : ''
                }.`,
          },
        })
        .catch((e) => console.error('Nudge activity not written:', e));

      if (result.sent) sent += 1;
    }

    return NextResponse.json({ success: true, considered: candidates.length, sent, stopped });
  } catch (error) {
    console.error('Enquiry nudge cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
