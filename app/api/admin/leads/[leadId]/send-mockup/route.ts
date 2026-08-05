import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isFurtherAlong } from '@/lib/leads';
import { sendMockupEmail } from '@/lib/email';
import { resolveSiteUrl } from '@/lib/site-url';
import {
  clientMockupLink,
  markMockupSent,
  mockupInclude,
  recordLeadMockup,
  toMockupDTO,
} from '@/lib/mockups';

/**
 * One button: send this lead their mockup.
 *
 * The per-version send already existed, four clicks down inside the mockups
 * panel, and needed somebody to have attached a version first. In practice
 * the folder is put together, the link is pasted on the lead, and then the
 * rep writes the email by hand — which is how three facts stopped being
 * recorded (that it went, when, and whether it was opened) and how a
 * password-protected preview deployment ended up being what got sent.
 *
 * So this takes the one link that may go to a client, makes a mockup version
 * out of it if there isn't one already, and sends it down the same tracked
 * path as everything else. Nothing here is a second way of sending: it
 * resolves to a mockup and calls the same two functions the panel does.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { leadId } = await params;
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const link = clientMockupLink(lead);
    if (!link) {
      return NextResponse.json(
        {
          error:
            'No mockup folder on this lead yet. Add the folder link — the preview build is ours to look at and never goes to a client.',
        },
        { status: 400 }
      );
    }
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

    // Find the version this link already is, rather than stacking a new row
    // every time somebody presses the button. recordLeadMockup returns the
    // existing one when the URL matches, which is exactly this case.
    const existing = await prisma.leadMockup.findFirst({
      where: { leadId, url: link },
      include: mockupInclude,
      orderBy: { createdAt: 'desc' },
    });
    const mockupId =
      existing?.id ?? (await recordLeadMockup({ leadId, url: link, userId: session.userId })).mockup.id;

    // Stamped before the send: an email that goes out against a row still
    // marked draft is a link the client can open and the tracker will 404.
    const sentAt = new Date();
    const updated = await markMockupSent(mockupId, sentAt);
    const viewUrl = `${resolveSiteUrl()}/m/${updated.shareToken}`;

    const result = await sendMockupEmail({
      toEmail: lead.email,
      contactName: lead.contactName,
      company: lead.company,
      viewUrl,
      note: existing?.note ?? '',
    });

    await prisma.leadActivity
      .create({
        data: {
          leadId,
          type: 'email',
          content: result.sent
            ? `Mockup sent to ${lead.email} — tracked link, expires in 30 days.`
            : `Mockup link generated for ${lead.email} but the email did not send${
                result.reason ? ` (${result.reason})` : ''
              }.`,
          url: viewUrl,
          createdById: session.userId,
        },
      })
      .catch((e) => console.error('Mockup send activity not written:', e));

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
        mockup: toMockupDTO({ ...updated, uploadedBy: existing?.uploadedBy ?? null }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Send mockup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
