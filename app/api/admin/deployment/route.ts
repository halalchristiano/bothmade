import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { launchLane, launchReadiness, readChecklist, warrantyState } from '@/lib/launch';
import { finalInstalment } from '@/lib/instalments';

/**
 * The launch board: every project close enough to going live to be worth
 * looking at, and what stands between each one and shipping.
 *
 * Discovery and Design are excluded. A board that lists everything is a list,
 * and the question this screen answers is "what can I ship today" — which a
 * project that has not been built yet cannot be an answer to.
 *
 * Live projects stay on it rather than dropping off the moment the URL is
 * set, because the thirty-day Warranty Period under Section 16 starts at that
 * moment and is the part of a launch nobody was tracking at all.
 */
export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const projects = await prisma.project.findMany({
      where: { OR: [{ statusStage: { gte: 2 } }, { liveUrl: { not: null } }] },
      orderBy: [{ launchedAt: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        name: true,
        status: true,
        statusStage: true,
        liveUrl: true,
        domainName: true,
        domainAccess: true,
        hostingProvider: true,
        launchChecklist: true,
        readyForLaunchAt: true,
        launchedAt: true,
        warrantyEndsAt: true,
        handoverAt: true,
        estimatedCompletionDate: true,
        client: { select: { id: true, company: true, contactName: true, email: true } },
        // Section 7's gate. Read rather than asked about: the system already
        // knows whether the money arrived, and a checkbox claiming it did is
        // a checkbox somebody ticks optimistically on a Friday.
        instalments: {
          orderBy: { index: 'asc' },
          select: { index: true, status: true, amountCents: true, label: true },
        },
      },
    });

    const rows = projects.map((project) => {
      const live = project.instalments.filter((i) => i.status !== 'void');
      // By index, not by array position — see finalInstalment() for what the
      // positional read did to Section 7's gate on this very board.
      const finalRow = finalInstalment(project.instalments);
      const checklist = readChecklist(project.launchChecklist);
      const readiness = launchReadiness(checklist, {
        finalInstalmentPaid: finalRow ? finalRow.status === 'paid' : true,
        hasSchedule: live.length > 0,
        domainName: project.domainName,
      });

      const { instalments: _schedule, launchChecklist: _raw, ...rest } = project;

      return {
        ...rest,
        lane: launchLane(project),
        readiness,
        warranty: warrantyState(project.warrantyEndsAt),
        finalInstalment: finalRow
          ? {
              label: finalRow.label,
              status: finalRow.status,
              amountCents: finalRow.amountCents,
            }
          : null,
      };
    });

    return NextResponse.json({ success: true, projects: rows }, { status: 200 });
  } catch (error) {
    console.error('Deployment board error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
