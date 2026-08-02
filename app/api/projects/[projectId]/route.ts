import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { forbiddenResponse, unauthorizedResponse } from '@/lib/middleware';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();

    if (!session) {
      return unauthorizedResponse();
    }

    const { projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        // Never `client: true` here — the client branch below returns this
        // object straight to the browser, and the full row includes the bcrypt
        // password hash, Stripe customer id, and subscription fields. Select
        // only what a project view legitimately needs.
        client: {
          select: {
            id: true,
            email: true,
            company: true,
            contactName: true,
            phone: true,
          },
        },
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

    const amountPaid = project.payments.reduce((sum, p) => sum + p.amount, 0);

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
          amountPaid,
          balanceDue: project.totalPrice - amountPaid,
          payments: project.payments,
          deliverables: project.deliverables
            ? JSON.parse(project.deliverables)
            : [],
          contractUrl: project.contractUrl,
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
        deliverables: body.deliverables
          ? JSON.stringify(body.deliverables)
          : undefined,
        handoffAcknowledgedAt:
          body.acknowledgeHandoff === true && !project.handoffAcknowledgedAt ? new Date() : undefined,
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
