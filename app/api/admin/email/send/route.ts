import { NextRequest, NextResponse } from 'next/server';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { sendTemplatedEmail } from '@/lib/send-templated-email';

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { templateId, to, toName, company, fields, attachments, leadId } = await request.json();

    if (!templateId || !to) {
      return NextResponse.json({ error: 'Template and recipient are required' }, { status: 400 });
    }

    const result = await sendTemplatedEmail({
      senderId: session.userId,
      templateId,
      to,
      toName,
      company,
      fields,
      attachments,
      leadId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.error === 'Unknown template' ? 400 : 500 });
    }

    return NextResponse.json({ success: true, sentVia: result.sentVia }, { status: 200 });
  } catch (error) {
    console.error('Send client email error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
