import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { CHANGE_ORDER_STATEMENT, USER_AGENT_MAX, normalizeSignerName } from '@/lib/clickwrap';
import { applyScope, recutSchedule, type ChangeOrderItem, type ScheduleRow } from '@/lib/change-orders';
import { addOnLabel, formatCents } from '@/lib/pricing';
import { notifyAdminsChangeOrderSigned } from '@/lib/notify';
import { sendChangeOrderSignedEmail } from '@/lib/email';
import { resolveSiteUrl } from '@/lib/site-url';

/**
 * The client's side of a Change Order: read it, then sign or decline.
 *
 * No login. The token in the URL is the capability, exactly as the
 * sign-and-pay page and the care-plan offer work — and for the same reason
 * the project id is not used for it: the id appears in admin URLs and Stripe
 * metadata, and knowing it must not be the same thing as being allowed to
 * agree to a price change.
 *
 * Signing is the moment everything moves. Until then the project's price,
 * scope and schedule are untouched, which is what Section 9 requires: "no such
 * work begins until the Client approves the additional scope and fee in
 * writing."
 */

/** What the client is shown. Deliberately no ids, no staff names, no internals. */
function present(order: {
  number: string;
  summary: string;
  items: unknown;
  deltaCents: number;
  previousTotalCents: number;
  newTotalCents: number;
  timelineExtensionDays: number;
  status: string;
  scheduleAfter: unknown;
  signedAt: Date | null;
  signerName: string | null;
  project: { name: string; client: { company: string; contactName: string | null } };
}) {
  return {
    number: order.number,
    summary: order.summary,
    items: order.items,
    deltaCents: order.deltaCents,
    previousTotalCents: order.previousTotalCents,
    newTotalCents: order.newTotalCents,
    timelineExtensionDays: order.timelineExtensionDays,
    status: order.status,
    schedule: order.scheduleAfter,
    signedAt: order.signedAt,
    signerName: order.signerName,
    company: order.project.client.company,
    contactName: order.project.client.contactName,
    projectName: order.project.name,
    statement: CHANGE_ORDER_STATEMENT,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const order = await prisma.changeOrder.findUnique({
      where: { token },
      include: { project: { select: { name: true, client: { select: { company: true, contactName: true } } } } },
    });
    if (!order || order.status === 'draft' || order.status === 'withdrawn') {
      // A draft has never been sent and a withdrawn one has been pulled. Both
      // are "this link isn't live", and neither should confirm the token was
      // otherwise real.
      return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
    }

    // First open is worth knowing — the difference between "they're thinking
    // about it" and "it never arrived" is the whole of a chase decision.
    if (!order.viewedAt) {
      await prisma.changeOrder
        .update({ where: { id: order.id }, data: { viewedAt: new Date() } })
        .catch(() => {});
    }

    return NextResponse.json({ success: true, changeOrder: present(order) }, { status: 200 });
  } catch (error) {
    console.error('Read change order error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const decision = body?.decision;

    if (decision !== 'sign' && decision !== 'decline') {
      return NextResponse.json({ error: 'Say whether you accept or decline.' }, { status: 400 });
    }

    const order = await prisma.changeOrder.findUnique({
      where: { token },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            status: true,
            totalPrice: true,
            addOns: true,
            customItems: true,
            estimatedCompletionDate: true,
            client: { select: { company: true, contactName: true, email: true } },
          },
        },
      },
    });
    if (!order) {
      return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
    }
    if (order.status !== 'sent') {
      return NextResponse.json(
        {
          error:
            order.status === 'signed'
              ? 'This change has already been agreed — there is nothing more to do here.'
              : 'This link is no longer valid.',
        },
        { status: 409 }
      );
    }

    if (decision === 'decline') {
      const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : null;
      await prisma.changeOrder.update({
        where: { id: order.id },
        data: { status: 'declined', declinedAt: new Date(), declineNote: note || null },
      });
      return NextResponse.json({ success: true, status: 'declined' }, { status: 200 });
    }

    const signerName = normalizeSignerName(body?.signerName);
    if (!signerName) {
      return NextResponse.json(
        { error: 'Type your full name to sign — the tick alone is a click, not a signature.' },
        { status: 400 }
      );
    }
    if (body?.agreed !== true) {
      return NextResponse.json({ error: 'Tick the box to confirm you agree.' }, { status: 400 });
    }

    /**
     * The schedule is recut from the instalments as they stand RIGHT NOW,
     * not from the projection stored when the order was drafted.
     *
     * What the client signs is the new Total Fee — that number is fixed on
     * the document and cannot move. The schedule beneath it is the contract's
     * rule ("later Instalments recalculate accordingly") applied to the state
     * at the moment of signing, and the state can legitimately have moved in
     * between: a draft written on Monday and signed on Friday may have had
     * Payment 2 invoiced on Wednesday.
     *
     * Applying the stale plan would rewrite a row that is now sitting in the
     * client's inbox on a live payment link — the exact thing recutSchedule
     * freezes rows to prevent. So the total is honoured and the split follows
     * reality, and whatever it produces is stored on the order as the record
     * of what actually happened.
     */
    const live = await prisma.instalment.findMany({
      where: { projectId: order.projectId },
      orderBy: { index: 'asc' },
      select: { id: true, index: true, label: true, amountCents: true, percent: true, status: true },
    });
    const before: ScheduleRow[] = live;
    const recut = recutSchedule(before, order.newTotalCents);
    const items = (order.items as unknown as ChangeOrderItem[]) ?? [];
    const scope = applyScope(
      {
        addOns: order.project.addOns,
        customItems: (order.project.customItems as unknown as Array<{ label: string; priceCents: number }>) ?? [],
      },
      items,
      addOnLabel
    );

    const timelineBase = order.project.estimatedCompletionDate;
    const extendedDate =
      order.timelineExtensionDays > 0 && timelineBase
        ? new Date(timelineBase.getTime() + order.timelineExtensionDays * 24 * 60 * 60 * 1000)
        : timelineBase;

    // The signature, the price, the scope and the schedule commit together or
    // not at all. A signed amendment sitting next to an unchanged price is the
    // one outcome nobody could untangle afterwards.
    await prisma.$transaction(async (tx) => {
      await tx.changeOrder.update({
        where: { id: order.id },
        data: {
          status: 'signed',
          signedAt: new Date(),
          signerName,
          signerEmail: typeof body?.signerEmail === 'string' ? body.signerEmail.trim().slice(0, 254) : null,
          signerIp: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
          signerUserAgent: (request.headers.get('user-agent') || '').slice(0, USER_AGENT_MAX) || null,
          // The statement the SERVER serves, hashed with the terms actually
          // shown — never a string the browser posted. A crafted request must
          // not be able to put words in the client's mouth.
          signedStatement: CHANGE_ORDER_STATEMENT,
          signedHash: createHash('sha256')
            .update(`${order.number}\n${order.summary}\n${order.newTotalCents}\n${CHANGE_ORDER_STATEMENT}`)
            .digest('hex'),
          scheduleAfter: recut.rows.map((r) => ({
            index: r.index,
            label: r.label,
            amountCents: r.newAmountCents,
            frozen: r.frozen,
          })),
        },
      });

      await tx.project.update({
        where: { id: order.projectId },
        data: {
          totalPrice: order.newTotalCents,
          addOns: scope.addOns,
          customItems: scope.customItems as unknown as Prisma.InputJsonValue,
          estimatedCompletionDate: extendedDate,
        },
      });

      // §9: "later Instalments recalculate accordingly." Only the rows that
      // moved are written — a frozen row must not have its updatedAt touched,
      // and a row whose amount is unchanged has nothing to say.
      for (const row of recut.rows) {
        if (row.frozen || !row.id || row.newAmountCents === row.amountCents) continue;
        await tx.instalment.update({
          where: { id: row.id },
          data: { amountCents: row.newAmountCents, percent: row.percent },
        });
      }
    });

    const direction = order.deltaCents > 0 ? 'increase' : 'reduction';
    await prisma.projectUpdate
      .create({
        data: {
          projectId: order.projectId,
          title: `${order.number} agreed`,
          description: `${order.summary} Your project total is now ${(order.newTotalCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}${
            order.timelineExtensionDays > 0
              ? `, and the timeline extends by ${order.timelineExtensionDays} day${order.timelineExtensionDays === 1 ? '' : 's'}`
              : ''
          }. Remaining payments have been updated to match.`,
          statusStage: order.project.status,
          userId: null,
        },
      })
      .catch((error) => console.error(`Change order ${order.number}: timeline entry failed:`, error));

    await notifyAdminsChangeOrderSigned({
      number: order.number,
      company: order.project.client.company,
      projectName: order.project.name,
      signerName,
      deltaCents: order.deltaCents,
      newTotalCents: order.newTotalCents,
      projectId: order.projectId,
    }).catch((error) => console.error(`Change order ${order.number}: admin notify failed:`, error));

    /*
     * The client's countersigned copy.
     *
     * They have just agreed to a new project total and, often, a later
     * delivery date — and until now the only party that got an email about it
     * was us. The copy goes to the client record's own address rather than
     * the `signerEmail` typed into the form: that field is unvalidated free
     * text on a public endpoint, and mailing whatever it contains would let
     * anyone holding a change-order link post our branded confirmation to an
     * address of their choosing. The contracting party is who the record
     * says it is.
     *
     * Best-effort, and last: the signature, the price and the schedule are
     * already committed, and a failed email must not tell the client their
     * signature didn't take.
     */
    if (order.project.client.email) {
      await sendChangeOrderSignedEmail({
        toEmail: order.project.client.email,
        contactName: order.project.client.contactName,
        company: order.project.client.company,
        projectName: order.project.name,
        number: order.number,
        summary: order.summary,
        signerName,
        signedOnLabel: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        deltaLabel: `${order.deltaCents >= 0 ? '+' : '−'}${formatCents(Math.abs(order.deltaCents))}`,
        newTotalLabel: formatCents(order.newTotalCents),
        timelineExtensionDays: order.timelineExtensionDays,
        newCompletionLabel:
          order.timelineExtensionDays > 0 && extendedDate
            ? extendedDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
            : null,
        dashboardUrl: `${resolveSiteUrl()}/client/${order.projectId}`,
      }).catch((error) =>
        console.error(`Change order ${order.number}: client copy failed:`, error)
      );
    }

    return NextResponse.json(
      { success: true, status: 'signed', direction, newTotalCents: order.newTotalCents },
      { status: 200 }
    );
  } catch (error) {
    console.error('Sign change order error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
