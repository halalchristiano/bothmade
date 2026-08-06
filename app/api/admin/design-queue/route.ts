import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { designStage, nextDesignStage } from '@/lib/design-stages';
import { revisionState } from '@/lib/design-feedback';

/**
 * Every project's design, at whatever step it is on.
 *
 * The design conversation was spread across three screens that each showed a
 * slice of it: the project page had the send button, the dashboard's Deliver
 * lane surfaced unread feedback, and where a project actually stood — sent,
 * waiting, answered, waiting on us to send the next round — was answerable
 * only by opening each project in turn.
 *
 * It is a sequence, and a sequence deserves a screen: send it, wait, read
 * what came back, send the next one. This is that screen's data.
 */

/** Which step of the sequence a project is on, in the order they need attention. */
export type DesignStep = 'to-send' | 'changes-asked' | 'waiting' | 'approved';

export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const projects = await prisma.project.findMany({
      // Complete projects have nothing left to design. Everything else is in
      // the sequence somewhere, including the ones nothing has been sent on —
      // those are the whole point of the "to send" column.
      where: { status: { not: 'complete' } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        name: true,
        status: true,
        designUrl: true,
        designRound: true,
        designPresentedAt: true,
        designReviewEndsAt: true,
        designApprovedAt: true,
        designApprovalDeemed: true,
        designRevisionsUsed: true,
        client: { select: { company: true, contactName: true } },
        designFeedback: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, round: true, createdAt: true, reviewedAt: true, liked: true, note: true },
        },
      },
    });

    const rows = projects.map((p) => {
      const latestFeedback = p.designFeedback[0] ?? null;

      /*
       * The step, decided in one place.
       *
       * Order matters: approved beats everything, then a running clock, then
       * "they answered and we owe them the next round". A project that has
       * been presented but has no deadline left is one whose feedback stopped
       * the clock — the same state that made the old panel render its blank
       * "nothing sent yet" box mid-conversation.
       */
      const step: DesignStep = p.designApprovedAt
        ? 'approved'
        : p.designReviewEndsAt
          ? 'waiting'
          : p.designPresentedAt
            ? 'changes-asked'
            : 'to-send';

      const nextRound = p.designPresentedAt ? p.designRound + 1 : p.designRound;

      return {
        id: p.id,
        name: p.name,
        status: p.status,
        company: p.client.company,
        contactName: p.client.contactName,
        designUrl: p.designUrl,
        step,
        stage: designStage(p.designRound),
        // What the next send will be called, so the row can say it before
        // anybody opens the project.
        nextStage: p.designPresentedAt ? nextDesignStage(p.designRound) : designStage(nextRound),
        presentedAt: p.designPresentedAt,
        reviewEndsAt: p.designReviewEndsAt,
        approvedAt: p.designApprovedAt,
        deemed: p.designApprovalDeemed,
        revisions: revisionState(p.designRevisionsUsed),
        latestFeedback: latestFeedback && {
          id: latestFeedback.id,
          round: latestFeedback.round,
          createdAt: latestFeedback.createdAt,
          unread: latestFeedback.reviewedAt === null,
          liked: latestFeedback.liked,
          note: latestFeedback.note,
        },
      };
    });

    return NextResponse.json({ success: true, projects: rows }, { status: 200 });
  } catch (error) {
    console.error('Design queue error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
