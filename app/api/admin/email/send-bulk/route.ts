import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { sendTemplatedEmail } from '@/lib/send-templated-email';
import { createGmailBatchTransport } from '@/lib/mailer';
import { isDomainDelegationConfigured } from '@/lib/gmail-delegated';
import { createGmailOAuthBatchClient } from '@/lib/gmail-oauth';
import { decryptSecret } from '@/lib/crypto';

interface Recipient {
  leadId: string;
  to: string;
  toName?: string;
  company?: string;
  fields?: Record<string, string>;
}

const MAX_RECIPIENTS = 200;

/**
 * Sends the same template to many leads at once — each recipient still gets
 * their own merged field set (shared fields + whatever was personalized for
 * them specifically, e.g. the required observation line), so this is a mail
 * merge, not a single blast with one body to everyone.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { templateId, sharedFields, attachments, recipients } = await request.json();

    if (!templateId || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: 'Template and at least one recipient are required' }, { status: 400 });
    }
    if (recipients.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `Max ${MAX_RECIPIENTS} recipients per send` }, { status: 400 });
    }

    const results: Array<{ leadId: string; company?: string; ok: boolean; error?: string }> = [];

    // One pooled connection for the whole batch — sending each recipient
    // through its own fresh SMTP login is what makes Gmail throttle a batch
    // this size partway through, silently falling the rest back to Resend.
    const sender = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { gmailAddress: true, gmailAppPassword: true, googleRefreshToken: true },
    });
    const gmailOAuthClient =
      !isDomainDelegationConfigured() && sender?.googleRefreshToken
        ? createGmailOAuthBatchClient(decryptSecret(sender.googleRefreshToken))
        : undefined;
    const gmailTransport =
      !isDomainDelegationConfigured() && !gmailOAuthClient && sender?.gmailAddress && sender?.gmailAppPassword
        ? createGmailBatchTransport(sender.gmailAddress, sender.gmailAppPassword)
        : undefined;

    for (const recipient of recipients as Recipient[]) {
      if (!recipient.to || !recipient.leadId) {
        results.push({ leadId: recipient.leadId, company: recipient.company, ok: false, error: 'Missing recipient email' });
        continue;
      }
      const result = await sendTemplatedEmail({
        senderId: session.userId,
        templateId,
        to: recipient.to,
        toName: recipient.toName,
        company: recipient.company,
        fields: { ...(sharedFields || {}), ...(recipient.fields || {}) },
        // Shared across the batch: the same PDF or mockup link goes to every
        // recipient, the same way the shared fields do.
        attachments,
        leadId: recipient.leadId,
        gmailTransport,
        gmailOAuthClient,
      });
      results.push({ leadId: recipient.leadId, company: recipient.company, ok: result.ok, error: result.error });
    }

    gmailTransport?.close();

    const sentCount = results.filter((r) => r.ok).length;
    return NextResponse.json({ success: true, sentCount, total: results.length, results }, { status: 200 });
  } catch (error) {
    console.error('Bulk send email error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
