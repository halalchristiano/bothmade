import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { requireRole, ANY_STAFF } from '@/lib/authz';
import { unauthorizedResponse } from '@/lib/middleware';
import { isLeadActivityType } from '@/lib/leads';
import { sendEmail } from '@/lib/email';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

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
      emailSent = await sendEmail({
        to: lead.email,
        subject: emailSubject || `Following up — ${lead.company}`,
        html: `<div style="font-family: -apple-system, sans-serif; white-space: pre-wrap;">${content}</div>`,
      });
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

    await prisma.lead.update({ where: { id: leadId }, data: { updatedAt: new Date() } });

    return NextResponse.json({ success: true, activity, emailSent }, { status: 201 });
  } catch (error) {
    console.error('Log lead activity error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
