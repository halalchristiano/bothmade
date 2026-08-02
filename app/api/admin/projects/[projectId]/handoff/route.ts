import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

/**
 * Acknowledge (or un-acknowledge) a sales → ops handoff.
 *
 * This used to be a flag smuggled into the generic PUT on
 * /api/projects/[projectId] — the same route clients read their project
 * from. It is a team-only workflow action with its own side effect, so it
 * gets its own admin endpoint rather than widening the surface of a route
 * that faces clients at all.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const { projectId } = await params;
    const { acknowledged } = await request.json();

    if (typeof acknowledged !== 'boolean') {
      return NextResponse.json(
        { error: 'acknowledged must be true or false' },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Only a genuine transition does anything. Re-acknowledging an already
    // acknowledged handoff must not post a second "picked this up" message
    // into team chat.
    const isNewAcknowledgement = acknowledged && !project.handoffAcknowledgedAt;

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { handoffAcknowledgedAt: acknowledged ? project.handoffAcknowledgedAt ?? new Date() : null },
    });

    if (isNewAcknowledgement && project.convertedFromLeadId) {
      const lead = await prisma.lead.findUnique({
        where: { id: project.convertedFromLeadId },
        select: { id: true, company: true },
      });
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
      { success: true, handoffAcknowledgedAt: updated.handoffAcknowledgedAt },
      { status: 200 }
    );
  } catch (error) {
    console.error('Acknowledge handoff error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
