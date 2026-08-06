import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isFurtherAlong } from '@/lib/leads';
import { markMockupSent } from '@/lib/mockups';

/**
 * "I sent this one myself."
 *
 * The send button mails the folder on a tracked link, and the email it writes
 * says the mockup is "a working preview, not a picture of one". That is true
 * almost every time and it was not true once — so the right call was a
 * written email describing what had actually been made, and the button was
 * deliberately not pressed.
 *
 * Which left the lead on the build queue as outstanding work forever. The
 * only thing that could clear it was the button that should not have been
 * used, so finished work sat there looking undone, and a queue you have to
 * mentally subtract from is a queue people stop trusting.
 *
 * This records the third state the system was missing: delivered, just not
 * through here. It is not a send — nothing is emailed, and the tracked link
 * and its open-tracking do not exist for a message we did not compose. That
 * is the honest cost of doing it by hand, and it is said out loud rather than
 * papered over with a fake "sent" that implies tracking nobody has.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { leadId } = await params;
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        company: true,
        status: true,
        email: true,
        mockupFolderUrl: true,
        mockupSentManuallyAt: true,
      },
    });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (lead.mockupSentManuallyAt) {
      return NextResponse.json(
        { error: 'This one is already marked as sent by hand.' },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const note =
      typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null;

    const sentAt = new Date();
    await prisma.lead.update({
      where: { id: leadId },
      data: { mockupSentManuallyAt: sentAt, mockupSentManuallyNote: note },
    });

    /*
     * Any version already attached is stamped too.
     *
     * A lead with a folder shows on the Built tab as a mockup nobody has
     * sent. Leaving it that way would take the lead off one queue and leave
     * it looking undone on the other, which is half a fix.
     */
    const existing = await prisma.leadMockup
      .findFirst({ where: { leadId, sentAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true } })
      .catch(() => null);
    if (existing) {
      await markMockupSent(existing.id, sentAt).catch((e) =>
        console.error('Could not stamp the attached mockup as sent:', e)
      );
    }

    await prisma.leadActivity
      .create({
        data: {
          leadId,
          type: 'email',
          content: [
            `Mockup sent to ${lead.email ?? 'the client'} by hand, outside the system.`,
            note,
            'No tracked link, so there is no record of them opening it.',
          ]
            .filter(Boolean)
            .join('\n\n'),
          createdById: session.userId,
        },
      })
      .catch((e) => console.error('Manual mockup send activity not written:', e));

    // Same stage move a real send makes: they have been shown the work, and a
    // pipeline that says otherwise describes last week.
    if (isFurtherAlong(lead.status, 'presented')) {
      await prisma.lead
        .update({ where: { id: leadId }, data: { status: 'presented' } })
        .catch((e) => console.error('Lead stage not advanced after a manual send:', e));
    }

    return NextResponse.json({ success: true, sentAt }, { status: 200 });
  } catch (error) {
    console.error('Manual mockup send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
