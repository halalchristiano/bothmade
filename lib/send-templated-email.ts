import { prisma } from '@/lib/prisma';
import { getTemplate } from '@/lib/email-templates';
import { renderShell } from '@/lib/email';
import { sendAsUser } from '@/lib/mailer';

export interface SendTemplatedEmailInput {
  senderId: string;
  templateId: string;
  to: string;
  toName?: string;
  company?: string;
  fields?: Record<string, string>;
  leadId?: string;
}

export interface SendTemplatedEmailResult {
  ok: boolean;
  error?: string;
  sentVia?: 'gmail' | 'resend';
}

/**
 * Builds and sends one templated email as a given team member, and logs it
 * to the lead's activity timeline if a leadId is given. Shared by the single
 * Compose Email flow and the bulk-send flow so both behave identically.
 */
export async function sendTemplatedEmail(input: SendTemplatedEmailInput): Promise<SendTemplatedEmailResult> {
  const { senderId, templateId, to, toName, company, fields, leadId } = input;

  const template = getTemplate(templateId);
  if (!template) return { ok: false, error: 'Unknown template' };

  for (const field of template.fields) {
    if (field.required && !fields?.[field.key]) {
      return { ok: false, error: `"${field.label}" is required for this template` };
    }
  }

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { name: true, email: true, gmailAddress: true, gmailAppPassword: true },
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
    ctaLabel: built.ctaLabel,
    ctaUrl: built.ctaUrl,
    footerNote: `${sender.name || 'Bothmade'} — bothmade.studio`,
  });

  const sent = await sendAsUser(
    { name: sender.name, email: sender.email, gmailAddress: sender.gmailAddress, gmailAppPassword: sender.gmailAppPassword },
    { to, subject: built.subject, html }
  );

  if (!sent) return { ok: false, error: 'Failed to send email' };

  if (leadId) {
    await prisma.leadActivity
      .create({
        data: {
          leadId,
          type: 'email',
          content: built.subject,
          url: fields?.loomUrl || fields?.ctaUrl || fields?.signUrl || fields?.schedulingLink || fields?.meetingLink || fields?.onboardingLink || null,
          createdById: senderId,
        },
      })
      .catch(() => null);
  }

  return { ok: true, sentVia: sender.gmailAddress ? 'gmail' : 'resend' };
}
