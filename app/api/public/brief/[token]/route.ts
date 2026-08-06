import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import {
  briefToLeadFields,
  isWorthRecording,
  parseBriefSubmission,
} from '@/lib/client-brief-form';
import { buildSalesNote } from '@/lib/contact-enquiry';

/**
 * A client filling in their own brief.
 *
 * The token is the lead's `shareToken`, which is how the link in their email
 * knows which lead this is. It is not an authentication: anyone holding the
 * link can answer, which is deliberate — a business owner forwards it to the
 * person who actually knows the answers, and making that person log in is how
 * a form goes unanswered.
 *
 * What it cannot do is read anything back. The response carries no lead data,
 * so a guessed token reveals nothing about anybody.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limited = await enforceRateLimit(
      request,
      'briefForm',
      RATE_LIMITS.briefForm,
      'Too many submissions. Please try again shortly.'
    );
    if (limited) return limited;

    const { token } = await params;
    const lead = await prisma.lead
      .findUnique({ where: { shareToken: token }, select: { id: true, painPoints: true } })
      .catch(() => null);
    if (!lead) return NextResponse.json({ error: 'That link is no longer valid.' }, { status: 404 });

    const submission = parseBriefSubmission(await request.json().catch(() => ({})));
    if (!isWorthRecording(submission)) {
      return NextResponse.json({ error: 'Nothing was answered.' }, { status: 400 });
    }

    const fields = briefToLeadFields(submission);

    /*
     * Merged with what is already there, never replacing it.
     *
     * By the time this arrives the lead may have been researched, so the
     * client's own answers are added to the picture rather than overwriting
     * somebody's work. The exception is the qualification fields, which are
     * questions only the client can actually answer — if they answered one,
     * theirs is the better version.
     */
    const merged = [
      ...new Set([...(lead.painPoints ?? '').split(',').filter(Boolean), ...submission.problems]),
    ];

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        painPoints: merged.join(','),
        currentSiteAssessment: fields.currentSiteAssessment || undefined,
        salesNote: buildSalesNote(submission.problems, submission.extra) || undefined,
        companySize: fields.companySize ?? undefined,
        industry: fields.industry ?? undefined,
        qualNeed: fields.qualNeed ?? undefined,
        qualAuthority: fields.qualAuthority ?? undefined,
        qualTiming: fields.qualTiming ?? undefined,
        qualMotivation: fields.qualMotivation ?? undefined,
        // They came back to us unprompted. That is the same signal as a reply
        // and it stops the daily follow-up.
        replyReceivedAt: new Date(),
      },
    });

    await prisma.leadActivity
      .create({
        data: {
          leadId: lead.id,
          type: 'note',
          content: [
            'Client filled in the brief form.',
            '',
            fields.currentSiteAssessment,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      })
      .catch((e) => console.error('Brief form activity not written:', e));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Brief form submission error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
