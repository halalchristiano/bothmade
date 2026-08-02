import { prisma } from '@/lib/prisma';
import { getTemplate } from '@/lib/email-templates';
import { renderShell } from '@/lib/email';
import { sendAsUser } from '@/lib/mailer';
import { advanceToContactedOnOutreach } from '@/lib/leads';

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
  sentVia?: 'delegated' | 'gmail-app-password' | 'resend' | 'failed';
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
  const { senderId, templateId, toName, company, fields } = input;

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
    select: { name: true, email: true, gmailAddress: true, gmailAppPassword: true, avatarUrl: true },
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
    footerAvatarUrl: sender.avatarUrl,
  });

  const result = await sendAsUser(
    { name: sender.name, email: sender.email, gmailAddress: sender.gmailAddress, gmailAppPassword: sender.gmailAppPassword },
    { to, subject: built.subject, html }
  );

  if (!result.ok) return { ok: false, error: 'Failed to send email' };

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

    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { status: true } });
    if (lead) {
      const nextStatus = advanceToContactedOnOutreach(lead.status);
      if (nextStatus !== lead.status) {
        await prisma.lead.update({ where: { id: leadId }, data: { status: nextStatus } }).catch(() => null);
      }
    }
  }

  return { ok: true, sentVia: result.sentVia };
}
