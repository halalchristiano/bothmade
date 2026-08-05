import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { resolveSiteUrl } from '@/lib/site-url';
import { sendChangeOrderEmail } from '@/lib/email';
import { formatCentsExact } from '@/lib/pricing';

/**
 * Send a Change Order for signature, or withdraw one.
 *
 * Sending is the only thing that puts the document in front of a client, and
 * it is deliberately a separate step from drafting: a price change should be
 * read once by the person proposing it before it lands in a client's inbox.
 *
 * Withdrawing is how a draft or an unsigned sent order dies. A *signed* one
 * never can — it is an executed amendment to a contract, and the way to undo
 * one is another change order going the other way, which is also how it works
 * on paper.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ changeOrderId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const { changeOrderId } = await params;
    const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
    const action = body?.action;

    if (action !== 'send' && action !== 'withdraw') {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }

    const order = await prisma.changeOrder.findUnique({
      where: { id: changeOrderId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            status: true,
            client: { select: { company: true, email: true, contactName: true } },
          },
        },
      },
    });
    if (!order) {
      return NextResponse.json({ error: 'That change order no longer exists.' }, { status: 404 });
    }

    if (order.status === 'signed') {
      return NextResponse.json(
        {
          error:
            'That change order is signed and in force. To undo it, raise another one going the other way — the same as you would on paper.',
        },
        { status: 409 }
      );
    }

    if (action === 'withdraw') {
      const withdrawn = await prisma.changeOrder.update({
        where: { id: order.id },
        data: { status: 'withdrawn' },
      });
      return NextResponse.json({ success: true, changeOrder: withdrawn }, { status: 200 });
    }

    if (order.status === 'declined' || order.status === 'withdrawn') {
      return NextResponse.json(
        { error: `${order.number} was ${order.status}. Draft a fresh one rather than reviving it.` },
        { status: 409 }
      );
    }

    const signUrl = `${resolveSiteUrl()}/change/${order.token}`;
    const sent = await sendChangeOrderEmail({
      to: order.project.client.email,
      contactName: order.project.client.contactName,
      company: order.project.client.company,
      projectName: order.project.name,
      number: order.number,
      summary: order.summary,
      deltaLabel: `${order.deltaCents > 0 ? '+' : '−'}${formatCentsExact(Math.abs(order.deltaCents))}`,
      previousTotalLabel: formatCentsExact(order.previousTotalCents),
      newTotalLabel: formatCentsExact(order.newTotalCents),
      timelineExtensionDays: order.timelineExtensionDays,
      signUrl,
    }).catch((error: unknown) => {
      console.error(`Change order ${order.number}: send failed:`, error);
      return { sent: false, reason: 'The email did not go out.' };
    });

    // Marked sent whether or not the email landed: the link is live either
    // way, and leaving it as a draft would hide it from the very list someone
    // would use to chase it. The reason comes back so the UI can say so.
    const updated = await prisma.changeOrder.update({
      where: { id: order.id },
      data: { status: 'sent', sentAt: order.sentAt ?? new Date() },
    });

    return NextResponse.json(
      {
        success: true,
        changeOrder: updated,
        signUrl,
        emailSent: Boolean(sent?.sent),
        emailReason: sent?.sent ? null : ('reason' in (sent ?? {}) ? sent.reason : null),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Change order action error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
