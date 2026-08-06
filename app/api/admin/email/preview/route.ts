import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { buildTemplatedEmail } from '@/lib/send-templated-email';
import { composeOnly, type ComposedEmail } from '@/lib/email-preview';
import { mockupRequestEmail, renderShell, sendMockupEmail } from '@/lib/email';
import { escMultiline, escParagraphs } from '@/lib/html';
import { clientMockupLink } from '@/lib/mockups';
import { findDesigner } from '@/lib/notify';
import { parseSalesPoints } from '@/lib/leads';
import { resolveSiteUrl } from '@/lib/site-url';
import { sendRouteFor } from '@/lib/email-send-routes';

/**
 * What an email would look like, without sending it.
 *
 * Two callers. The compose screen's live pane, which has always been here and
 * still posts `templateId` directly. And the confirmation dialog, which posts
 * the request a send button is *about* to make — path, method and body — and
 * gets back the message that request would put in somebody's inbox.
 *
 * Nothing here writes. That is the whole reason previews are built from the
 * `sendXEmail` functions rather than by running the routes: those functions
 * are composition plus one call to the transport, so running one with the
 * transport intercepted (`composeOnly`) yields exactly the bytes that would
 * have gone out, with no rows stamped and no stages moved on the strength of
 * a send nobody has agreed to yet.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const body = await request.json().catch(() => ({}));

    // The original compose-pane contract, untouched.
    if (body?.templateId && !body?.previewOf) {
      const result = await buildTemplatedEmail({
        senderId: session.userId,
        templateId: body.templateId,
        toName: body.toName,
        company: body.company,
        fields: body.fields,
        attachments: body.attachments,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ subject: result.subject, html: result.html }, { status: 200 });
    }

    const path: string = typeof body?.previewOf === 'string' ? body.previewOf : '';
    const spec = sendRouteFor(path, body?.method ?? 'POST', body?.body ?? {});
    if (!spec) {
      return NextResponse.json({ error: 'That is not a send.' }, { status: 400 });
    }

    const emails = await buildPreview(spec.preview, path, body?.body ?? {}, session.userId);
    return NextResponse.json(
      {
        action: spec.action,
        // An empty list is a real answer, not a failure: the dialog says it
        // could not render this one and asks anyway. Silently letting it
        // through instead would be the one outcome this must never have.
        emails,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Email preview error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** The id in `/api/admin/leads/<id>/…`, and friends. */
function segmentAfter(path: string, name: string): string | null {
  const parts = path.split('?')[0].split('/');
  const at = parts.indexOf(name);
  return at >= 0 && parts[at + 1] ? parts[at + 1] : null;
}

async function buildPreview(
  kind: string | undefined,
  path: string,
  payload: Record<string, unknown>,
  userId: string
): Promise<ComposedEmail[]> {
  switch (kind) {
    case 'mockup': {
      const leadId = segmentAfter(path, 'leads');
      if (!leadId) return [];
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) return [];
      const override = typeof payload.email === 'string' ? payload.email.trim() : '';
      const link = clientMockupLink(lead);
      if (!link) return [];
      // The tracked link the client is given. Reuses the existing version's
      // token when there is one so the preview shows the real address; a new
      // send has no token yet, and the shape of the URL is what matters.
      const existing = await prisma.leadMockup.findFirst({
        where: { leadId, url: link },
        orderBy: { createdAt: 'desc' },
        select: { shareToken: true, note: true },
      });
      return composeOnly(() =>
        sendMockupEmail({
          toEmail: override || lead.email || '',
          contactName: lead.contactName,
          company: lead.company,
          viewUrl: `${resolveSiteUrl()}/m/${existing?.shareToken ?? 'the-tracked-link'}`,
          note: existing?.note ?? '',
          observation: lead.personalizedObservation,
        })
      );
    }

    case 'mockup-request': {
      const leadId = segmentAfter(path, 'leads');
      if (!leadId) return [];
      const [lead, designer, requester] = await Promise.all([
        prisma.lead.findUnique({ where: { id: leadId } }),
        findDesigner(),
        prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      ]);
      if (!lead) return [];
      const mail = mockupRequestEmail({
        company: lead.company,
        requestedBy: requester?.name ?? null,
        leadUrl: `${resolveSiteUrl()}/admin/leads/${leadId}`,
        currentSite: lead.originalWebsite,
        assessment: lead.currentSiteAssessment,
        essentials: parseSalesPoints(lead.essentialPoints).map((p) => p.point),
        note: lead.salesNote,
      });
      return [{ to: [designer.email], subject: mail.subject, html: mail.html }];
    }

    case 'follow-up': {
      const leadId = segmentAfter(path, 'leads');
      const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
      const text = typeof payload.body === 'string' ? payload.body.trim() : '';
      if (!leadId || !subject || !text) return [];
      const [lead, sender] = await Promise.all([
        prisma.lead.findUnique({ where: { id: leadId }, select: { email: true } }),
        prisma.user.findUnique({ where: { id: userId }, select: { name: true, avatarUrl: true } }),
      ]);
      return [
        {
          to: [lead?.email ?? ''],
          subject,
          html: renderShell({
            title: subject,
            bodyHtml: escParagraphs(text),
            footerNote: `${sender?.name || 'Bothmade'} — bothmade.studio`,
            footerAvatarUrl: sender?.avatarUrl,
          }),
        },
      ];
    }

    case 'lead-activity': {
      // Only the branch that actually mails anybody. Logging a call is not a
      // send, and stopping to confirm one would train people to click through
      // the dialog without reading it — which would cost more than it saves.
      if (payload.type !== 'email' || !payload.sendEmailNow) return [];
      const leadId = segmentAfter(path, 'leads');
      if (!leadId) return [];
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { email: true, company: true },
      });
      const content = typeof payload.content === 'string' ? payload.content : '';
      return [
        {
          to: [lead?.email ?? ''],
          subject:
            (typeof payload.emailSubject === 'string' && payload.emailSubject) ||
            `Following up — ${lead?.company ?? ''}`,
          html: `<div style="font-family: -apple-system, sans-serif; white-space: pre-wrap;">${escMultiline(content)}</div>`,
        },
      ];
    }

    case 'templated': {
      const built = await buildTemplatedEmail({
        senderId: userId,
        templateId: String(payload.templateId ?? ''),
        toName: payload.toName as string | undefined,
        company: payload.company as string | undefined,
        fields: payload.fields as Record<string, string> | undefined,
        attachments: payload.attachments,
      });
      if (!built.ok) return [];
      return [{ to: [String(payload.to ?? '')], subject: built.subject ?? '', html: built.html ?? '' }];
    }

    default:
      return [];
  }
}
