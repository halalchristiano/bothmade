import { NextRequest, NextResponse } from 'next/server';
import { resolveSiteUrl } from '@/lib/site-url';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isFurtherAlong } from '@/lib/leads';
import { sendMockupEmail } from '@/lib/email';
import { markMockupSent, mockupInclude, toMockupDTO } from '@/lib/mockups';

/**
 * Send a mockup to the client, on a link the studio can see through.
 *
 * The queue used to hand a rep a URL to paste into an email they wrote
 * themselves, which meant three facts went unrecorded every time: that it was
 * sent, when, and whether it was ever opened. Sending it from here stamps all
 * three, moves the lead's stage, and gives the client a page with an approve
 * button on it — so "they liked it" stops being something a rep has to
 * remember to type in.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string; mockupId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { leadId, mockupId } = await params;
    const mockup = await prisma.leadMockup.findFirst({
      where: { id: mockupId, leadId },
      include: mockupInclude,
    });
    if (!mockup) return NextResponse.json({ error: 'Mockup not found' }, { status: 404 });

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (!lead.email) {
      return NextResponse.json(
        { error: 'This lead has no email on file — add one, or copy the link and send it yourself.' },
        { status: 400 }
      );
    }
    if (lead.doNotContact) {
      return NextResponse.json(
        { error: `${lead.company} is marked do-not-contact. Nothing was sent.` },
        { status: 400 }
      );
    }

    // Stamped before the send, not after. An email that goes out against a
    // row still marked draft is a link the client can open and the tracker
    // will 404 — the record has to be true by the time the mail lands.
    const sentAt = new Date();
    const updated = await markMockupSent(mockup.id, sentAt);

    const siteUrl = resolveSiteUrl();
    const viewUrl = `${siteUrl}/m/${updated.shareToken}`;

    const result = await sendMockupEmail({
      toEmail: lead.email,
      contactName: lead.contactName,
      company: lead.company,
      viewUrl,
      note: mockup.note,
    });

    await prisma.leadActivity
      .create({
        data: {
          leadId,
          type: 'email',
          content: result.sent
            ? `Mockup sent to ${lead.email} — tracked link, expires in 30 days.`
            : `Mockup link generated for ${lead.email} but the email did not send${result.reason ? ` (${result.reason})` : ''}.`,
          url: viewUrl,
          createdById: session.userId,
        },
      })
      .catch((e) => console.error('Mockup send activity not written:', e));

    // Showing someone the work is a real stage change, and leaving it to be
    // set by hand is how a pipeline ends up describing last week.
    if (result.sent && isFurtherAlong(lead.status, 'presented')) {
      await prisma.lead
        .update({ where: { id: leadId }, data: { status: 'presented' } })
        .catch((e) => console.error('Lead stage not advanced after mockup send:', e));
    }

    return NextResponse.json(
      {
        success: true,
        sent: result.sent,
        reason: result.sent ? null : result.reason,
        viewUrl,
        mockup: toMockupDTO({ ...updated, uploadedBy: mockup.uploadedBy }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Send mockup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
