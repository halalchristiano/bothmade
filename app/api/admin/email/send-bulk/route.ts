import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { sendTemplatedEmail } from '@/lib/send-templated-email';

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
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { templateId, sharedFields, recipients } = await request.json();

    if (!templateId || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: 'Template and at least one recipient are required' }, { status: 400 });
    }
    if (recipients.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `Max ${MAX_RECIPIENTS} recipients per send` }, { status: 400 });
    }

    const results: Array<{ leadId: string; company?: string; ok: boolean; error?: string }> = [];

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
        leadId: recipient.leadId,
      });
      results.push({ leadId: recipient.leadId, company: recipient.company, ok: result.ok, error: result.error });
    }

    const sentCount = results.filter((r) => r.ok).length;
    return NextResponse.json({ success: true, sentCount, total: results.length, results }, { status: 200 });
  } catch (error) {
    console.error('Bulk send email error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
