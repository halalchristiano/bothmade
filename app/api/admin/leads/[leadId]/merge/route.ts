import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { LEAD_STATUSES, isFurtherAlong, type LeadStatus } from '@/lib/leads';

/**
 * Merge a duplicate lead into this one.
 *
 * Duplicates are a fact of life with overlapping research CSVs, and until
 * now the only remedies were deleting one row — losing its call history —
 * or leaving both, which ends with two reps ringing the same business in
 * one week. The lead page already *detects* likely duplicates; this is the
 * action that was missing next to the warning.
 *
 * Merge policy, deliberately conservative:
 *   - the surviving lead's non-empty fields always win; the duplicate only
 *     fills blanks (a human chose to keep this one — respect their edits)
 *   - the activity timeline is the exception: both histories are moved
 *     over in full, because calls that happened, happened
 *   - pipeline status keeps whichever is further along, and won/lost on
 *     either side survives
 *   - notes are concatenated rather than one clobbering the other
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { leadId } = await params;
    const { duplicateId } = await request.json();

    if (typeof duplicateId !== 'string' || !duplicateId) {
      return NextResponse.json({ error: 'duplicateId is required' }, { status: 400 });
    }
    if (duplicateId === leadId) {
      return NextResponse.json({ error: "A lead can't be merged into itself" }, { status: 400 });
    }

    const [target, source] = await Promise.all([
      prisma.lead.findUnique({ where: { id: leadId } }),
      prisma.lead.findUnique({ where: { id: duplicateId } }),
    ]);
    if (!target || !source) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Whichever side is further down the pipeline defines the truth about
    // the relationship. Terminal states always win.
    const furthest = (a: string, b: string): string => {
      if (a === 'won' || b === 'won') return 'won';
      if (a === 'lost' && !LEAD_STATUSES.includes(b as LeadStatus)) return 'lost';
      return isFurtherAlong(a, b as LeadStatus) ? b : a;
    };

    const fill = <T>(mine: T | null | undefined, theirs: T | null | undefined): T | undefined =>
      mine ? undefined : theirs ?? undefined;

    const mergedNotes =
      [target.notes, source.notes].filter(Boolean).join('\n\n---\n\n') || undefined;
    const mergedPainPoints =
      [
        ...new Set(
          `${target.painPoints},${source.painPoints}`
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        ),
      ].join(',') || undefined;

    await prisma.$transaction([
      // Both histories, in full — calls that happened, happened.
      prisma.leadActivity.updateMany({
        where: { leadId: duplicateId },
        data: { leadId },
      }),
      prisma.lead.update({
        where: { id: leadId },
        data: {
          contactName: fill(target.contactName, source.contactName),
          email: fill(target.email, source.email),
          phone: fill(target.phone, source.phone),
          source: fill(target.source, source.source),
          originalWebsite: fill(target.originalWebsite, source.originalWebsite),
          salesNote: fill(target.salesNote, source.salesNote),
          personalizedObservation: fill(
            target.personalizedObservation,
            source.personalizedObservation
          ),
          coldEmailDraft: fill(target.coldEmailDraft, source.coldEmailDraft),
          currentSiteAssessment: fill(target.currentSiteAssessment, source.currentSiteAssessment),
          customPainPoints: fill(target.customPainPoints, source.customPainPoints),
          essentialPoints: fill(target.essentialPoints, source.essentialPoints),
          upsellPoints: fill(target.upsellPoints, source.upsellPoints),
          estimatedValue: fill(target.estimatedValue, source.estimatedValue),
          estimateLowCents: fill(target.estimateLowCents, source.estimateLowCents),
          estimateHighCents: fill(target.estimateHighCents, source.estimateHighCents),
          nextFollowUpAt: fill(target.nextFollowUpAt, source.nextFollowUpAt),
          replyReceivedAt: fill(target.replyReceivedAt, source.replyReceivedAt),
          wonAt: fill(target.wonAt, source.wonAt),
          notes: mergedNotes,
          painPoints: mergedPainPoints,
          hotLead: target.hotLead || source.hotLead,
          status: furthest(target.status, source.status),
        },
      }),
      prisma.leadActivity.create({
        data: {
          leadId,
          type: 'note',
          content: `Merged duplicate "${source.company}"${source.email ? ` <${source.email}>` : ''} into this lead — its history is now part of this timeline.`,
          createdById: session.userId,
        },
      }),
      prisma.lead.delete({ where: { id: duplicateId } }),
    ]);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Merge lead error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
