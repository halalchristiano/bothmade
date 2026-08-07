import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isLeadActivityType, isMachineActivityType, advanceToContactedOnOutreach } from '@/lib/leads';
import { sendEmail } from '@/lib/email';
import { escMultiline } from '@/lib/html';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }

    const { leadId } = await params;
    const { type, content, url, sendEmailNow, emailSubject } = await request.json();

    if (!type || !isLeadActivityType(type) || !content) {
      return NextResponse.json({ error: 'Type and content are required' }, { status: 400 });
    }

    /*
     * A dial is not something anybody gets to write.
     *
     * It is recorded as the phone app takes the screen, which is the only
     * reason the dashboard can say "14 dialled, 3 written up" and have that
     * mean anything. A hand-written one costs the number the single property
     * that makes it worth having, so it is refused here as well as being
     * absent from the picker — a UI that merely hides a field is not a rule.
     */
    if (isMachineActivityType(type)) {
      return NextResponse.json(
        {
          error:
            'Dials are recorded by the app when a number is actually called — they cannot be added by hand.',
        },
        { status: 400 }
      );
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
        // `content` is whatever was typed into the activity box. It's staff
        // input, but it lands in a client's inbox, so it's escaped like any
        // other body text rather than trusted as markup.
        html: `<div style="font-family: -apple-system, sans-serif; white-space: pre-wrap;">${escMultiline(content)}</div>`,
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
