import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { forbiddenResponse, requirePrincipal, unauthorizedResponse } from '@/lib/middleware';
import { amountPaidTowardProject } from '@/lib/billing';
import { ensureInstalments } from '@/lib/instalments';
import { revisionState } from '@/lib/design-feedback';
import { designStage } from '@/lib/design-stages';
import { DIRECTION_STATEMENT, directionStatus } from '@/lib/design-direction';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { session, response } = await requirePrincipal();
    if (!session) return response;

    const { projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        instalments: { orderBy: { index: 'asc' } },
        designDirection: true,
        client: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
            client: {
              select: { id: true, email: true, company: true },
            },
          },
        },
        updates: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
        // One-off charges raised against this project. Both dashboards read
        // this list — it is the same record on either side, which is the
        // point: a client and the studio looking at the same invoice number
        // should never be looking at two different stories.
        invoices: {
          orderBy: { createdAt: 'desc' },
          include: { issuedBy: { select: { name: true, email: true } } },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Check authorization - client can only view their own project
    if (session.type === 'client') {
      if (project.clientId !== session.clientId) {
        return forbiddenResponse();
      }
    }

    // Filter sensitive data
    const clientData =
      session.type === 'client'
        ? project.client
        : {
            id: project.client.id,
            email: project.client.email,
            company: project.client.company,
            contactName: project.client.contactName,
          };

    // Only what was paid toward this project's own contracted price —
    // one-off invoices are settled separately and listed separately.
    const amountPaid = amountPaidTowardProject(project.payments);

    // A project older than the schedule gets one on first sight, derived
    // from what it has already been paid. Without this the client's own
    // dashboard shows them a lump "balance due" while their agreement, their
    // invoices and their emails all describe three named payments.
    const instalments =
      project.instalments.length > 0 ? project.instalments : await ensureInstalments(project.id);

    let sourcedLead: { id: string; company: string } | null = null;
    if (session.type === 'user' && project.convertedFromLeadId) {
      sourcedLead = await prisma.lead.findUnique({
        where: { id: project.convertedFromLeadId },
        select: { id: true, company: true },
      });
    }

    return NextResponse.json(
      {
        success: true,
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          statusStage: project.statusStage,
          baseService: project.baseService,
          addOns: project.addOns.split(',').filter(Boolean),
          customItems: project.customItems,
          timeline: project.timeline,
          basePrice: project.basePrice,
          totalPrice: project.totalPrice,
          estimatedCompletionDate: project.estimatedCompletionDate,
          liveUrl: project.liveUrl,
          amountPaid,
          balanceDue: project.totalPrice - amountPaid,
          payments: project.payments,
          // The schedule the whole instalment feature reads. Fetched above
          // since the feature shipped — but never actually returned, which
          // left the client's "Payment N of 3" list dead and the pay button
          // falling through to the lump-balance label. Checkout internals
          // (session ids, raw payment URLs) stay server-side; the client
          // pays through pay-balance, which validates freshness.
          instalments: instalments.map((inst) => ({
            id: inst.id,
            index: inst.index,
            count: inst.count,
            label: inst.label,
            percent: inst.percent,
            amountCents: inst.amountCents,
            trigger: inst.trigger,
            status: inst.status,
            invoiceNumber: inst.invoiceNumber,
            dueAt: inst.dueAt,
            paidAt: inst.paidAt,
          })),
          // Who raised an invoice is an internal detail — the client gets
          // the invoice, not the org chart.
          invoices: project.invoices.map((invoice) => ({
            id: invoice.id,
            number: invoice.number,
            description: invoice.description,
            lineItems: invoice.lineItems,
            amountCents: invoice.amountCents,
            status: invoice.status,
            pdfUrl: invoice.pdfUrl,
            paymentUrl: invoice.paymentUrl,
            createdAt: invoice.createdAt,
            paidAt: invoice.paidAt,
            // A client whose money came back must be able to see that here.
            // Both sides read this list precisely so the two of us can never
            // be looking at two different stories about the same number.
            refundedCents: invoice.refundedCents,
            refundMethod: invoice.refundMethod,
            refundedAt: invoice.refundedAt,
            // The reasons are written for the client — they are what goes in
            // their email — so there is nothing here to withhold.
            refundReason: invoice.refundReason,
            voidReason: invoice.voidReason,
            issuedBy: session.type === 'user' ? invoice.issuedBy?.name || invoice.issuedBy?.email || null : undefined,
            sentToEmail: session.type === 'user' ? invoice.sentToEmail : undefined,
          })),
          deliverables: project.deliverables
            ? JSON.parse(project.deliverables)
            : [],
          contractUrl: project.contractUrl,
          // The Section 4 review clock. Both dashboards read it: the client
          // needs to see the deadline they were given, and deemed approval
          // is only defensible if they could.
          designReview: {
            presentedAt: project.designPresentedAt,
            reviewEndsAt: project.designReviewEndsAt,
            approvedAt: project.designApprovedAt,
            deemed: project.designApprovalDeemed,
            // Which version they are looking at, and where they stand in the
            // two rounds Exhibit A includes. Shown to them rather than
            // tracked quietly: it makes people gather their thoughts into one
            // considered list instead of firing off three emails, and the day
            // a round becomes billable is never a surprise.
            round: project.designRound,
            // What this round is called, and what it means — one vocabulary,
            // shared with the email, so a client is never told "revision 1"
            // in one place and "initial design" in the other.
            stage: designStage(project.designRound),
            // Where the design actually is. Without it the dashboard asked
            // them to approve something it could not show them.
            designUrl: project.designUrl,
            revisions: revisionState(project.designRevisionsUsed),
          },
          // The brief they wrote and signed before we designed anything, and
          // the sentence they signed. Sent to the client because a brief they
          // cannot re-read is not much of an agreement — and because seeing
          // it beside the design is how they judge whether we hit it.
          designDirection: project.designDirection,
          designDirectionStatus: directionStatus(project.designDirection),
          designDirectionStatement: DIRECTION_STATEMENT,
          // Capability token for the public /status link. Only handed to
          // people already authorized to see the project — it's the secret
          // that makes the shared link work, so it travels no further than
          // the dashboard that offers "copy share link".
          shareToken: project.shareToken,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          client: clientData,
          messages: project.messages,
          updates: project.updates,
          sourcedLead: session.type === 'user' ? sourcedLead : undefined,
          handoffAcknowledgedAt: session.type === 'user' ? project.handoffAcknowledgedAt : undefined,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get project error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();

    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const { projectId } = await params;
    const body = await request.json();

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        name: body.name,
        description: body.description,
        status: body.status,
        statusStage: body.statusStage,
        // baseService, addOns, basePrice and totalPrice are deliberately NOT
        // settable here any more.
        //
        // This route accepted all four from any signed-in staff account. No
        // record was written, the client was never told, and the instalment
        // schedule did not follow — so a contracted price could be rewritten
        // and the three payments beneath it would go on describing the old
        // one. Nothing in the UI ever sent them, which is the only reason it
        // was never used.
        //
        // Section 9 of the contract is explicit that scope and fee move by
        // written amendment the client approves. That is what a Change Order
        // is, and it is now the only path: see
        // /api/public/change/[token], which moves the price, the scope and the
        // schedule together, inside one transaction, only once someone has
        // signed for it.
        timeline: body.timeline,
        estimatedCompletionDate:
          body.estimatedCompletionDate !== undefined
            ? body.estimatedCompletionDate
              ? new Date(body.estimatedCompletionDate)
              : null
            : undefined,
        liveUrl: body.liveUrl !== undefined ? body.liveUrl || null : undefined,
        deliverables: body.deliverables
          ? JSON.stringify(body.deliverables)
          : undefined,
        handoffAcknowledgedAt:
          body.acknowledgeHandoff === true && !project.handoffAcknowledgedAt
            ? new Date()
            : body.acknowledgeHandoff === false
            ? null
            : undefined,
      },
    });

    if (body.acknowledgeHandoff === true && !project.handoffAcknowledgedAt && project.convertedFromLeadId) {
      const lead = await prisma.lead.findUnique({ where: { id: project.convertedFromLeadId } });
      if (lead) {
        await prisma.teamMessage.create({
          data: {
            content: `👍 Picked up the handoff for ${lead.company} — starting Discovery.`,
            fromUserId: session.userId,
            relatedLeadId: lead.id,
            relatedProjectId: projectId,
          },
        });
      }
    }

    return NextResponse.json(
      { success: true, project: updatedProject },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update project error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
