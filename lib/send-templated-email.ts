import { prisma } from '@/lib/prisma';
import { getTemplate } from '@/lib/email-templates';
import { renderShell } from '@/lib/email';
import { parseAttachments, renderAttachments } from '@/lib/email-attachments';
import { safeUrl } from '@/lib/html';
import { sendAsUser, type createGmailBatchTransport } from '@/lib/mailer';
import { type GmailOAuthClient } from '@/lib/gmail-oauth';
import { advanceToContactedOnOutreach } from '@/lib/leads';
import { leadOpenPixelUrl } from '@/lib/lead-opens';
import { resolveSiteUrl } from '@/lib/site-url';

export interface SendTemplatedEmailInput {
  senderId: string;
  templateId: string;
  to: string;
  toName?: string;
  company?: string;
  fields?: Record<string, string>;
  /** PDFs, pictures and links, rendered as buttons under the message. */
  attachments?: unknown;
  leadId?: string;
  /** Pass one shared pooled transport/client (from createGmailBatchTransport / createGmailOAuthBatchClient) when sending many in a loop — see those functions' docs for why. */
  gmailTransport?: ReturnType<typeof createGmailBatchTransport>;
  gmailOAuthClient?: GmailOAuthClient;
}

export interface SendTemplatedEmailResult {
  ok: boolean;
  error?: string;
  sentVia?: 'delegated' | 'oauth' | 'gmail-app-password' | 'resend' | 'failed';
}

export interface BuiltTemplatedEmail {
  ok: boolean;
  error?: string;
  subject?: string;
  html?: string;
}

/**
 * Builds (but does not send) the exact HTML an email would go out as —
 * shared by the send path and the live preview endpoint so what you preview
 * is guaranteed to be what actually sends, not an approximation.
 */
export async function buildTemplatedEmail(
  input: Omit<SendTemplatedEmailInput, 'leadId' | 'to'>
): Promise<BuiltTemplatedEmail> {
  const { senderId, templateId, toName, company, fields, attachments } = input;

  const template = getTemplate(templateId);
  if (!template) return { ok: false, error: 'Unknown template' };

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { name: true, avatarUrl: true },
  });
  if (!sender) return { ok: false, error: 'Sender not found' };

  const built = template.build({
    recipientName: toName || '',
    company: company || '',
    senderName: sender.name || 'Bothmade',
    fields: fields || {},
  });

  const html = renderShell({
    eyebrow: built.eyebrow,
    title: built.title,
    bodyHtml: built.bodyHtml,
    attachmentsHtml: renderAttachments(parseAttachments(attachments)),
    signOffHtml: built.signOffHtml,
    ctaLabel: built.ctaLabel,
    ctaUrl: built.ctaUrl,
    footerNote: `${sender.name || 'Bothmade'} — bothmade.studio`,
    footerAvatarUrl: sender.avatarUrl,
  });

  return { ok: true, subject: built.subject, html };
}

/**
 * Builds and sends one templated email as a given team member, and logs it
 * to the lead's activity timeline if a leadId is given. Shared by the single
 * Compose Email flow and the bulk-send flow so both behave identically.
 */
export async function sendTemplatedEmail(input: SendTemplatedEmailInput): Promise<SendTemplatedEmailResult> {
  const { senderId, templateId, to, toName, company, fields, attachments, leadId, gmailTransport, gmailOAuthClient } =
    input;

  const template = getTemplate(templateId);
  if (!template) return { ok: false, error: 'Unknown template' };

  for (const field of template.fields) {
    if (field.required && !fields?.[field.key]) {
      return { ok: false, error: `"${field.label}" is required for this template` };
    }
  }

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: {
      name: true,
      email: true,
      gmailAddress: true,
      gmailAppPassword: true,
      googleRefreshToken: true,
      avatarUrl: true,
    },
  });
  if (!sender) return { ok: false, error: 'Sender not found' };

  const built = template.build({
    recipientName: toName || '',
    company: company || '',
    senderName: sender.name || 'Bothmade',
    fields: fields || {},
  });

  // A button with a label but no link it can use renders as nothing at all.
  // That is how an email goes out looking finished, with the one thing the
  // recipient was supposed to click quietly missing — so it fails the send
  // instead, while the person who wrote it is still looking at the screen.
  if (built.ctaLabel && !safeUrl(built.ctaUrl)) {
    return {
      ok: false,
      error: built.ctaUrl
        ? `The "${built.ctaLabel}" button link isn't a usable web address, so the button wouldn't work. Check it and try again.`
        : `The "${built.ctaLabel}" button has no link, so it wouldn't do anything. Add one or clear the button text.`,
    };
  }

  const html = renderShell({
    eyebrow: built.eyebrow,
    title: built.title,
    bodyHtml: built.bodyHtml,
    attachmentsHtml: renderAttachments(parseAttachments(attachments)),
    signOffHtml: built.signOffHtml,
    ctaLabel: built.ctaLabel,
    ctaUrl: built.ctaUrl,
    footerNote: `${sender.name || 'Bothmade'} — bothmade.studio`,
    footerAvatarUrl: sender.avatarUrl,
    /*
     * The open pixel, on every email that goes to a lead.
     *
     * It was only ever added by the bulk cold-draft route, and this function
     * is what the Compose Email box and the bulk sender both call — so the
     * majority of mail leaving the app carried no pixel at all. The counts,
     * the call-sheet ranking and the "they just opened it" alert are all built
     * on that pixel, which meant a rep composing a follow-up by hand got
     * silence back and no way to tell it apart from a lead ignoring them.
     *
     * Only where there is a lead to attribute it to: a templated email with
     * no leadId is going to a client or a teammate, and neither of those is
     * something to count opens on. Deliberately NOT on buildTemplatedEmail()
     * above — that renders the preview, and previewing your own draft must
     * never register as the prospect opening it.
     */
    trackingPixelUrl: leadId ? leadOpenPixelUrl(resolveSiteUrl(), leadId) : null,
  });

  const result = await sendAsUser(
    {
      name: sender.name,
      email: sender.email,
      gmailAddress: sender.gmailAddress,
      gmailAppPassword: sender.gmailAppPassword,
      googleRefreshToken: sender.googleRefreshToken,
    },
    { to, subject: built.subject, html },
    { gmailTransport, gmailOAuthClient }
  );

  if (!result.ok) {
    if (leadId) {
      const reason = "Couldn't send — the address may be invalid or no longer active. Call instead.";
      await prisma.lead
        .update({ where: { id: leadId }, data: { emailDeliveryFailedAt: new Date(), emailDeliveryFailedReason: reason } })
        .catch(() => null);
    }
    return { ok: false, error: 'Failed to send email' };
  }

  if (leadId) {
    await prisma.leadActivity
      .create({
        data: {
          leadId,
          type: 'email',
          content: built.subject,
          url:
            fields?.loomUrl ||
            fields?.ctaUrl ||
            fields?.signUrl ||
            fields?.schedulingLink ||
            fields?.meetingLink ||
            fields?.onboardingLink ||
            parseAttachments(attachments)[0]?.url ||
            null,
          createdById: senderId,
        },
      })
      .catch(() => null);

    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { status: true } });
    if (lead) {
      const nextStatus = advanceToContactedOnOutreach(lead.status);
      await prisma.lead
        .update({
          where: { id: leadId },
          data: {
            status: nextStatus,
            emailDeliveryFailedAt: null,
            emailDeliveryFailedReason: null,
            /*
             * The send has to be recorded here, not only in the bulk route.
             *
             * The pixel endpoint refuses to count an open on a lead whose
             * coldEmailSentAt is null — deliberately, so a crawled URL cannot
             * invent engagement on a lead nobody has emailed. Which meant
             * adding the pixel to this path on its own would have changed
             * nothing at all: every fetch would have been thrown away by that
             * guard, and it would have looked exactly like the prospect
             * ignoring the email.
             */
            coldEmailSentAt: new Date(),
            /*
             * And the counters start again, matching the bulk sender. Opens
             * of the previous email are not evidence about this one, and
             * leaving them would put a lead at the top of the call sheet for
             * something it did last month — while the claimed alert flag
             * would stop the new email ever earning one of its own.
             */
            coldEmailOpens: 0,
            coldEmailOpenedAt: null,
            coldEmailLastOpenedAt: null,
            coldEmailOpenNotifiedAt: null,
          },
        })
        .catch(() => null);
    }
  }

  return { ok: true, sentVia: result.sentVia };
}
