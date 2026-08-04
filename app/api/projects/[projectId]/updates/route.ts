import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { requirePrincipal } from '@/lib/middleware';
import { sendStatusUpdateEmail } from '@/lib/email';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { session, response } = await requirePrincipal();
    if (!session) return response;

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { projectId } = await params;

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Check authorization
    if (session.type === 'client' && project.clientId !== session.clientId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const updates = await prisma.projectUpdate.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(
      { success: true, updates },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get updates error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();

    if (!session || session.type !== 'user') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { projectId } = await params;
    const { title, description, statusStage } = await request.json();

    if (!title || !description || !statusStage) {
      return NextResponse.json(
        { error: 'Title, description, and statusStage are required' },
        { status: 400 }
      );
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Create update
    const update = await prisma.projectUpdate.create({
      data: {
        projectId,
        title,
        description,
        statusStage,
        userId: session.userId,
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    // Update project status if statusStage provided
    if (statusStage) {
      // 'complete' was missing, so the update that mattered most — telling
      // the client their project is DONE — posted its text but never
      // advanced the stage, and the index came from key order, which is one
      // reordering away from renumbering every stage.
      const STAGE_INDEX: Record<string, number> = {
        discovery: 0,
        design: 1,
        build: 2,
        launch: 3,
        complete: 4,
      };

      if (statusStage in STAGE_INDEX) {
        await prisma.project.update({
          where: { id: projectId },
          data: {
            status: statusStage,
            statusStage: STAGE_INDEX[statusStage],
          },
        });
      }
    }

    // Send notification email to client
    const prefs = await prisma.emailPreferences.findUnique({
      where: { clientId: project.clientId },
    });

    if (prefs?.notificationsEnabled && prefs?.statusUpdates) {
      await sendStatusUpdateEmail(
        project.client.email,
        project.client.company,
        project.name,
        title,
        description,
        projectId
      );
    }

    return NextResponse.json(
      { success: true, update },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
