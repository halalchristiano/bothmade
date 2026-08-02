import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { isLeadActivityType, advanceToContactedOnOutreach } from '@/lib/leads';
import { sendEmail } from '@/lib/email';
import { escapeHtml } from '@/lib/html';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const { leadId } = await params;
    const { type, content, url, sendEmailNow, emailSubject } = await request.json();

    if (!type || !isLeadActivityType(type) || !content) {
      return NextResponse.json({ error: 'Type and content are required' }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    let emailSent = false;
    if (type === 'email' && sendEmailNow) {
      if (!lead.email) {
        return NextResponse.json(
          { error: 'This lead has no email address on file' },
          { status: 400 }
        );
      }
      // The body is typed into a textarea, so an apostrophe-free sentence
      // containing "<3" or a stray angle bracket used to silently eat the
      // rest of the email. white-space: pre-wrap already preserves the line
      // breaks, so escaping loses nothing.
      emailSent = await sendEmail({
        to: lead.email,
        subject: emailSubject || `Following up — ${lead.company}`,
        html: `<div style="font-family: -apple-system, sans-serif; white-space: pre-wrap;">${escapeHtml(content)}</div>`,
      });

      // A send that fails is a lead we cannot reach, which is a different
      // thing from a lead nobody has emailed yet. Recording it here is what
      // puts them on the "couldn't reach — call instead" list rather than
      // letting them sit in the ready-to-send count forever.
      if (!emailSent) {
        await prisma.lead.update({
          where: { id: leadId },
          data: {
            emailDeliveryFailedAt: new Date(),
            emailDeliveryFailedReason: 'Send failed when logging a manual email activity',
          },
        }).catch(() => null);
      }
    }

    const activity = await prisma.leadActivity.create({
      data: {
        leadId,
        type,
        content,
        url: url || null,
        createdById: session.userId,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    const nextStatus = emailSent ? advanceToContactedOnOutreach(lead.status) : lead.status;
    await prisma.lead.update({
      where: { id: leadId },
      data: { updatedAt: new Date(), status: nextStatus },
    });

    return NextResponse.json({ success: true, activity, emailSent }, { status: 201 });
  } catch (error) {
    console.error('Log lead activity error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
