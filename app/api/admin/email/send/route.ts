import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { getTemplate } from '@/lib/email-templates';
import { renderShell } from '@/lib/email';
import { sendAsUser } from '@/lib/mailer';

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { templateId, to, toName, company, fields, leadId, clientId, projectId } = await request.json();

    if (!templateId || !to) {
      return NextResponse.json({ error: 'Template and recipient are required' }, { status: 400 });
    }

    const template = getTemplate(templateId);
    if (!template) {
      return NextResponse.json({ error: 'Unknown template' }, { status: 400 });
    }

    for (const field of template.fields) {
      if (field.required && !fields?.[field.key]) {
        return NextResponse.json({ error: `"${field.label}" is required for this template` }, { status: 400 });
      }
    }

    const sender = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { name: true, email: true, gmailAddress: true, gmailAppPassword: true },
    });
    if (!sender) return unauthorizedResponse();

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
      { name: sender.name, gmailAddress: sender.gmailAddress, gmailAppPassword: sender.gmailAppPassword },
      { to, subject: built.subject, html }
    );

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    if (leadId) {
      await prisma.leadActivity
        .create({
          data: {
            leadId,
            type: 'email',
            content: built.subject,
            url: fields?.loomUrl || fields?.ctaUrl || fields?.signUrl || fields?.schedulingLink || fields?.meetingLink || fields?.onboardingLink || null,
            createdById: session.userId,
          },
        })
        .catch(() => null);
    }

    return NextResponse.json({ success: true, sentVia: sender.gmailAddress ? 'gmail' : 'resend' }, { status: 200 });
  } catch (error) {
    console.error('Send client email error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
