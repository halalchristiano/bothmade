import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { forbiddenResponse, unauthorizedResponse } from '@/lib/middleware';
import { toClientRef, toClientSelfView } from '@/lib/serialize';
import { PROJECT_STAGES, stageIndexFor, isProjectStatus } from '@/lib/project-status';

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

    // Both branches go through a whitelist. The client branch used to hand
    // back `project.client` whole — every column Prisma loaded, `password`
    // (a bcrypt hash) included — to the client's own browser. "It's their
    // own row" is not a defence: it lands in the network tab, in any proxy
    // on the path, and in whatever the page serialises its state into.
    const clientData =
      session.type === 'client'
        ? toClientSelfView(project.client)
        : toClientRef(project.client);

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
          liveUrl: project.liveUrl,
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

    // status and statusStage describe the same fact twice. Accepting both
    // from the request let a caller send status:'build' with statusStage:0
    // and produce a project whose label and progress bar disagree forever.
    // Take the name, derive the index.
    if (body.status !== undefined && !isProjectStatus(body.status)) {
      return NextResponse.json(
        { error: `status must be one of: ${PROJECT_STAGES.join(', ')}` },
        { status: 400 }
      );
    }
    const nextStatus = body.status !== undefined ? body.status : undefined;

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        name: body.name,
        description: body.description,
        status: nextStatus,
        statusStage: nextStatus !== undefined ? stageIndexFor(nextStatus) : undefined,
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
        // Handoff acknowledgement lives at
        // /api/admin/projects/[projectId]/handoff. It is a team-only
        // workflow action with its own side effect (a team message), and it
        // has no business riding along on the shared project-edit route
        // that clients also read from.
      },
    });

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
