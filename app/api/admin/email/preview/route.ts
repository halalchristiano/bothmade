import { NextRequest, NextResponse } from 'next/server';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { buildTemplatedEmail } from '@/lib/send-templated-email';

/**
 * Renders the exact HTML a Compose Email send would produce, without
 * sending anything — powers the live preview pane so Evan/Kiana can see
 * what a client will actually receive before hitting send.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { templateId, toName, company, fields, attachments } = await request.json();
    if (!templateId) {
      return NextResponse.json({ error: 'Template is required' }, { status: 400 });
    }

    const result = await buildTemplatedEmail({
      senderId: session.userId,
      templateId,
      toName,
      company,
      fields,
      attachments,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ subject: result.subject, html: result.html }, { status: 200 });
  } catch (error) {
    console.error('Email preview error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
