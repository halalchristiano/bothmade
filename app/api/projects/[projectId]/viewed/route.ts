import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { forbiddenResponse, unauthorizedResponse } from '@/lib/middleware';

/**
 * Records that the client has now seen this project's dashboard.
 *
 * "New since your last visit" badges were computed from localStorage, which
 * makes them a fact about a browser rather than about a person: an update
 * read on a laptop still showed as new on the phone, opening the dashboard
 * in a private window flagged everything, and clearing site data lit up
 * months of history at once. Worse, it silently reset the moment somebody
 * changed device — which is exactly when a client is most likely to think
 * they have missed something.
 *
 * Returns the *previous* timestamp, because that is what the badges need:
 * once the visit is recorded, "since last visit" has to mean the visit
 * before this one or nothing is ever new.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session) return unauthorizedResponse();

    const { projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true, clientLastViewedAt: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Only the client's own visits count. A team member opening the project
    // must not mark it seen on the client's behalf and quietly clear the
    // badges the client hasn't looked at yet.
    if (session.type !== 'client' || project.clientId !== session.clientId) {
      return NextResponse.json(
        { success: true, lastViewedAt: project.clientLastViewedAt, recorded: false },
        { status: 200 }
      );
    }

    const previous = project.clientLastViewedAt;

    await prisma.project.update({
      where: { id: projectId },
      data: { clientLastViewedAt: new Date() },
    });

    return NextResponse.json(
      { success: true, lastViewedAt: previous, recorded: true },
      { status: 200 }
    );
  } catch (error) {
    console.error('Record project view error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
