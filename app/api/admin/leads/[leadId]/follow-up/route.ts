import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { decryptSecret } from '@/lib/crypto';
import { sendAsUser } from '@/lib/mailer';
import { renderShell } from '@/lib/email';
import { escParagraphs } from '@/lib/html';
import { advanceToContactedOnOutreach } from '@/lib/leads';
import { resolveSiteUrl } from '@/lib/site-url';
import { unsubscribeLinks } from '@/lib/unsubscribe';

/**
 * Sends the post-call follow-up as the rep, from their own mailbox.
 *
 * Deliberately not routed through the generic activity endpoint, which sends
 * from the shared address: a follow-up to a conversation the rep just had has
 * to come from the rep, land in their Sent folder, and have replies go back
 * to them. Anything else and the customer replies into a void.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { leadId } = await params;
    const { subject, body } = await request.json();

    if (!subject?.trim() || !body?.trim()) {
      return NextResponse.json({ error: 'Subject and message are both needed.' }, { status: 400 });
    }

    const [lead, sender] = await Promise.all([
      prisma.lead.findUnique({ where: { id: leadId } }),
      prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          name: true,
          email: true,
          avatarUrl: true,
          gmailAddress: true,
          gmailAppPassword: true,
          googleRefreshToken: true,
        },
      }),
    ]);

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    /*
     * The hard stop, which this path was missing.
     *
     * Every other send checks it — the cold drafts, the bulk sender, the
     * mockup sends, the automated follow-up. This one did not, and it is the
     * one a person presses deliberately seconds after a call, which makes it
     * more likely to reach somebody who has asked to be left alone rather
     * than less.
     */
    if (lead.doNotContact) {
      return NextResponse.json(
        {
          error: `${lead.company} has asked not to be contacted. Nothing was sent.`,
        },
        { status: 400 }
      );
    }
    if (!sender) return NextResponse.json({ error: 'Sender not found' }, { status: 404 });
    if (!lead.email) {
      return NextResponse.json(
        { error: 'This lead has no email address — there is nowhere to send it.' },
        { status: 400 }
      );
    }

    const bodyHtml = escParagraphs(body);

    /*
     * The way out travels with the follow-up too.
     *
     * This one is hand-written and follows a conversation, so it feels like
     * ordinary correspondence — but it goes to somebody who never asked to
     * hear from us, which is the only test that matters. Leaving it off here
     * would mean a prospect who wants to stop has an unsubscribe in the first
     * email and none in the second, and the control they reach for instead is
     * "Report spam".
     */
    const unsubscribe = unsubscribeLinks(resolveSiteUrl(), lead.shareToken);

    const result = await sendAsUser(
      {
        name: sender.name,
        email: sender.email,
        gmailAddress: sender.gmailAddress,
        gmailAppPassword: sender.gmailAppPassword ? decryptSecret(sender.gmailAppPassword) : null,
        googleRefreshToken: sender.googleRefreshToken ? decryptSecret(sender.googleRefreshToken) : null,
      },
      {
        to: lead.email,
        subject: subject.trim(),
        html: renderShell({
          title: subject.trim(),
          bodyHtml,
          footerNote: `${sender.name || 'Bothmade'} — bothmade.studio`,
          footerAvatarUrl: sender.avatarUrl,
          unsubscribeUrl: unsubscribe?.pageUrl,
        }),
        unsubscribeUrl: unsubscribe?.oneClickUrl,
      }
    );

    if (!result.ok) {
      const reason = "Couldn't send — the address may be invalid or no longer active. Call instead.";
      await prisma.lead
        .update({
          where: { id: leadId },
          data: { emailDeliveryFailedAt: new Date(), emailDeliveryFailedReason: reason },
        })
        .catch(() => null);
      return NextResponse.json({ error: reason }, { status: 502 });
    }

    await prisma.$transaction([
      prisma.leadActivity.create({
        data: {
          leadId,
          type: 'email',
          content: `Follow-up sent — ${subject.trim()}\n\n${body.trim()}`,
          createdById: session.userId,
        },
      }),
      prisma.lead.update({
        where: { id: leadId },
        data: {
          status: advanceToContactedOnOutreach(lead.status),
          emailDeliveryFailedAt: null,
          emailDeliveryFailedReason: null,
          updatedAt: new Date(),
        },
      }),
    ]);

    return NextResponse.json({ success: true, sentVia: result.sentVia }, { status: 200 });
  } catch (error) {
    console.error('Follow-up send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
