import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { forbiddenResponse, requirePrincipal, unauthorizedResponse } from '@/lib/middleware';
import { amountPaidTowardProject } from '@/lib/billing';

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
            issuedBy: session.type === 'user' ? invoice.issuedBy?.name || invoice.issuedBy?.email || null : undefined,
            sentToEmail: session.type === 'user' ? invoice.sentToEmail : undefined,
          })),
          deliverables: project.deliverables
            ? JSON.parse(project.deliverables)
            : [],
          contractUrl: project.contractUrl,
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
        baseService: body.baseService,
        addOns: Array.isArray(body.addOns)
          ? body.addOns.join(',')
          : body.addOns,
        timeline: body.timeline,
        basePrice: body.basePrice,
        totalPrice: body.totalPrice,
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
