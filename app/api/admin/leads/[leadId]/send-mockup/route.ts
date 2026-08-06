import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isFurtherAlong } from '@/lib/leads';
import { sendMockupEmail } from '@/lib/email';
import { resolveSiteUrl } from '@/lib/site-url';
import { isValidEmail } from '@/lib/validation';
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

    /*
     * Where it goes, and what that does to the record.
     *
     * The address on file is usually info@ off their website. A rep who has
     * been on the phone often has the owner's own address, and sending the
     * work to a shared inbox that a receptionist triages is how a mockup
     * gets seen by nobody. So an override is offered — and once it is used
     * it becomes the lead's address, replacing the generic one, because
     * every follow-up after this should go where this one went. Sending
     * somewhere the record does not reflect is how the next email lands
     * back in the inbox this one was routed around.
     */
    const body = await request.json().catch(() => ({}));
    const override = typeof body?.email === 'string' ? body.email.trim() : '';
    if (override && !isValidEmail(override)) {
      return NextResponse.json({ error: `"${override}" is not an email address.` }, { status: 400 });
    }
    const toEmail = override || lead.email;

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
    if (!toEmail) {
      return NextResponse.json(
        { error: 'This lead has no email on file — add one, or send it to a different address below.' },
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
      existing?.id ??
      (
        await recordLeadMockup({
          leadId,
          url: link,
          userId: session.userId,
          // The folder already has a column. Caching it as the "latest
          // mockup" would overwrite the preview build with it and put both
          // links back in one field.
          cacheAsLatest: false,
        })
      ).mockup.id;

    // Stamped before the send: an email that goes out against a row still
    // marked draft is a link the client can open and the tracker will 404.
    const sentAt = new Date();
    const updated = await markMockupSent(mockupId, sentAt);
    const viewUrl = `${resolveSiteUrl()}/m/${updated.shareToken}`;

    // Written before the send, so a mail that goes out is always against a
    // record saying where it went. The old address is not kept: a lead with
    // two addresses is a lead somebody eventually mails on the wrong one.
    if (override && override !== lead.email) {
      const previous = lead.email;
      await prisma.lead.update({ where: { id: leadId }, data: { email: override } });
      await prisma.leadActivity
        .create({
          data: {
            leadId,
            type: 'note',
            content: previous
              ? `Email changed to ${override} (was ${previous}) — sending the mockup there, and everything after it.`
              : `Email set to ${override} while sending the mockup.`,
            createdById: session.userId,
          },
        })
        .catch((e) => console.error('Email-change activity not written:', e));
    }

    const result = await sendMockupEmail({
      toEmail,
      contactName: lead.contactName,
      company: lead.company,
      viewUrl,
      note: existing?.note ?? '',
      observation: lead.personalizedObservation,
    });

    await prisma.leadActivity
      .create({
        data: {
          leadId,
          type: 'email',
          content: result.sent
            ? `Mockup sent to ${toEmail} — tracked link, expires in 30 days.`
            : `Mockup link generated for ${toEmail} but the email did not send${
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
        sentTo: toEmail,
        emailUpdated: Boolean(override && override !== lead.email),
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
