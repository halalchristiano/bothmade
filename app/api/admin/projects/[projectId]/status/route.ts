import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { sendStatusUpdateEmail } from '@/lib/email';

const STAGES = ['discovery', 'design', 'build', 'launch', 'complete'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }
    // Client records and project money are ops, not sales — the admin
    // nav already withholds these pages from a sales account.
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;


    const { status, description } = await request.json();

    if (typeof status !== 'string' || !STAGES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: (await params).projectId },
      include: { client: true },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const statusStage = STAGES.indexOf(status);

    const updatedProject = await prisma.project.update({
      where: { id: (await params).projectId },
      data: { status, statusStage },
    });

    const update = await prisma.projectUpdate.create({
      data: {
        projectId: (await params).projectId,
        title: `Status changed to ${status}`,
        description: description || `Project moved to the ${status} phase.`,
        statusStage: status,
        userId: session.userId,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    const prefs = await prisma.emailPreferences.findUnique({
      where: { clientId: project.clientId },
    });

    if (prefs?.notificationsEnabled && prefs?.statusUpdates) {
      await sendStatusUpdateEmail(
        project.client.email,
        project.client.company,
        project.name,
        update.title,
        update.description,
        project.id
      );
    }

    return NextResponse.json(
      { success: true, project: updatedProject, update },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update project status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
