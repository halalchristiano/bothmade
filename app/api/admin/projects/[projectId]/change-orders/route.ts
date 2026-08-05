import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import {
  changeOrderNumber,
  readChangeOrderDraft,
  recutSchedule,
  scheduleForTotal,
  type ScheduleRow,
} from '@/lib/change-orders';
import { ensureInstalments } from '@/lib/instalments';

/**
 * Draft a Change Order, and list the ones a project already has.
 *
 * Drafting changes nothing. The project's price, its scope and its instalment
 * schedule are all untouched until the client signs — Section 9: "no such
 * work begins until the Client approves the additional scope and fee in
 * writing." What this route produces is a document and a link, not an edit.
 *
 * The recut schedule is computed here and stored on the draft so the client
 * signs the actual numbers. Computing it at signing time instead would mean
 * the page they agreed to and the schedule they got could differ by whatever
 * happened in between.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const { projectId } = await params;
    const orders = await prisma.changeOrder.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { name: true, email: true } } },
    });

    return NextResponse.json({ success: true, changeOrders: orders }, { status: 200 });
  } catch (error) {
    console.error('List change orders error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const { projectId } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

    const parsed = readChangeOrderDraft({
      summary: body?.summary,
      items: body?.items,
      timelineExtensionDays: body?.timelineExtensionDays,
    });
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { summary, items, deltaCents, timelineExtensionDays } = parsed.draft;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, totalPrice: true, status: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'That project no longer exists.' }, { status: 404 });
    }

    const newTotalCents = project.totalPrice + deltaCents;
    if (newTotalCents <= 0) {
      return NextResponse.json(
        { error: 'That would take the project price to zero or below. Cancel the project instead.' },
        { status: 400 }
      );
    }

    // A project from before instalments existed gets its schedule now, rather
    // than having a change order applied to nothing.
    const existing = await ensureInstalments(projectId);
    const before: ScheduleRow[] =
      existing.length > 0
        ? existing.map((i) => ({
            id: i.id,
            index: i.index,
            label: i.label,
            amountCents: i.amountCents,
            percent: i.percent,
            status: i.status,
          }))
        : scheduleForTotal(project.totalPrice);

    const recut = recutSchedule(before, newTotalCents);

    // One draft at a time. Two live change orders against the same project
    // would each have been priced against the same "before", so whichever was
    // signed second would apply its delta to a total that had already moved.
    const openOrder = await prisma.changeOrder.findFirst({
      where: { projectId, status: { in: ['draft', 'sent'] } },
      select: { number: true, status: true },
    });
    if (openOrder) {
      return NextResponse.json(
        {
          error: `${openOrder.number} is still ${openOrder.status === 'sent' ? 'out for signature' : 'a draft'}. Settle that one first — two open change orders would both be priced against the same starting total.`,
        },
        { status: 409 }
      );
    }

    const count = await prisma.changeOrder.count({ where: { projectId } });

    const order = await prisma.changeOrder.create({
      data: {
        projectId,
        number: changeOrderNumber(count + 1),
        summary,
        items: items as unknown as Prisma.InputJsonValue,
        deltaCents,
        previousTotalCents: project.totalPrice,
        newTotalCents,
        timelineExtensionDays,
        status: 'draft',
        scheduleBefore: before.map((r) => ({
          index: r.index,
          label: r.label,
          amountCents: r.amountCents,
          status: r.status,
        })),
        scheduleAfter: recut.rows.map((r) => ({
          index: r.index,
          label: r.label,
          amountCents: r.newAmountCents,
          frozen: r.frozen,
        })),
        createdById: session.userId,
      },
    });

    return NextResponse.json(
      {
        success: true,
        changeOrder: order,
        // Surfaced rather than buried: a reduction the client has already
        // overpaid is a refund conversation, and the person drafting this
        // needs to know before they send it.
        overpaidCents: recut.overpaidCents,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create change order error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
