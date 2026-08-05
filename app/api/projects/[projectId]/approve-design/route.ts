import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { forbiddenResponse, requirePrincipal } from '@/lib/middleware';
import { notifyAdminsDesignApprovedByClient } from '@/lib/notify';

/**
 * The client approving their own design.
 *
 * Until now approval was one of two things: somebody here recording it, or
 * five business days of silence. Both work, and neither is as good as the
 * client actually pressing a button — an explicit approval is worth
 * considerably more than a deemed one if it is ever argued about, and it
 * arrives days earlier, which moves Payment 2 forward by the same amount.
 *
 * Deliberately only ever sets approval, never withdraws it. A design the
 * client has approved and then changed their mind about is a Change Order
 * under Section 9, not an undo button — the work has started on the strength
 * of that approval.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { session, response } = await requirePrincipal();
    if (!session) return response;

    const { projectId } = await params;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        clientId: true,
        status: true,
        designPresentedAt: true,
        designApprovedAt: true,
        client: { select: { company: true } },
      },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (session.type === 'client' && project.clientId !== session.clientId) {
      return forbiddenResponse();
    }

    // Nothing to approve until a design has actually been presented — this
    // button should not exist on their screen before then, and a crafted
    // request must not be able to start the project's clock from the outside.
    if (!project.designPresentedAt) {
      return NextResponse.json(
        { error: 'There is no design waiting for your approval on this project yet.' },
        { status: 409 }
      );
    }
    if (project.designApprovedAt) {
      return NextResponse.json({ success: true, alreadyApproved: true }, { status: 200 });
    }

    const now = new Date();
    await prisma.project.update({
      where: { id: projectId },
      data: { designApprovedAt: now, designApprovalDeemed: false },
    });

    await prisma.projectUpdate
      .create({
        data: {
          projectId,
          title: 'Design approved',
          description:
            "You've approved the design — thank you. We're building it now, and we'll be back when there's something to click through.",
          statusStage: project.status,
          userId: null,
        },
      })
      .catch((error) => console.error(`Design approval timeline entry failed for ${projectId}:`, error));

    await notifyAdminsDesignApprovedByClient({
      projectId,
      projectName: project.name,
      company: project.client.company,
    }).catch((error) => console.error(`Design approval notify failed for ${projectId}:`, error));

    return NextResponse.json({ success: true, approvedAt: now }, { status: 200 });
  } catch (error) {
    console.error('Client design approval error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
