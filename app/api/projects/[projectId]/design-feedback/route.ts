import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { forbiddenResponse, requirePrincipal } from '@/lib/middleware';
import {
  acknowledgement,
  consumesRound,
  readFeedbackDraft,
  revisionState,
  triage,
} from '@/lib/design-feedback';
import { sendDesignFeedbackAckEmail } from '@/lib/email';
import { clientWantsEmail } from '@/lib/email-preferences';
import { notifyAdminsDesignFeedback } from '@/lib/notify';

/**
 * "Not yet" — with reasons, sorted.
 *
 * The counterpart to approve-design. Approval had a button and rejection had
 * nothing, so a client who did not like the design wrote a paragraph in the
 * message box, and the studio got opinions with no record of which of them it
 * actually owed them under the agreement.
 *
 * Everything about what this costs lives in lib/design-feedback.ts. This
 * route's only jobs are: authorise, store what was said, spend a round if one
 * was spent, and tell both sides. It deliberately does NOT decide whether new
 * scope gets quoted or absorbed — that is a judgement about the relationship,
 * so the studio is told and the client is not pre-billed by software.
 */
export async function POST(
  request: NextRequest,
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
        status: true,
        clientId: true,
        designPresentedAt: true,
        designApprovedAt: true,
        designRound: true,
        designRevisionsUsed: true,
        client: {
          select: { company: true, email: true, contactName: true, emailPreferences: true },
        },
      },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (session.type === 'client' && project.clientId !== session.clientId) {
      return forbiddenResponse();
    }

    // Nothing to give feedback on until a design has been presented. The form
    // should not exist on their screen before then, and a crafted request
    // must not be able to spend a revision round out of nowhere.
    if (!project.designPresentedAt) {
      return NextResponse.json(
        { error: "There's no design waiting for your feedback on this project yet." },
        { status: 409 }
      );
    }
    /**
     * Approved already.
     *
     * Refused rather than accepted-and-ignored: under Section 9 a design the
     * client approved and then wants changed is a Change Order, not a late
     * revision, and silently filing it as feedback would blur exactly the
     * line the allowance depends on. They can still say it — the message box
     * is right there — and then it gets quoted properly.
     */
    if (project.designApprovedAt) {
      return NextResponse.json(
        {
          error:
            "You've already approved this design, so we've started building it. Send us a message with what you'd like changed and we'll come back to you.",
        },
        { status: 409 }
      );
    }

    const draft = readFeedbackDraft(await request.json().catch(() => null));
    if (!draft.ok || !draft.submission) {
      return NextResponse.json({ error: draft.error ?? 'Nothing was submitted.' }, { status: 400 });
    }

    const { liked, items, note } = draft.submission;
    const spends = consumesRound(items);
    const t = triage(items);

    const feedback = await prisma.designFeedback.create({
      data: {
        projectId,
        round: project.designRound,
        items: items as unknown as object[],
        liked,
        note,
        consumedRound: spends,
      },
    });

    /**
     * The clock stops.
     *
     * Section 4's deemed approval is for a client who does not respond. This
     * one has, in detail — leaving the countdown running would approve their
     * design out from under them five days after they told us what was wrong
     * with it, which is the opposite of what the clause is for.
     */
    const usedAfter = project.designRevisionsUsed + (spends ? 1 : 0);
    await prisma.project.update({
      where: { id: projectId },
      data: {
        designReviewEndsAt: null,
        designRevisionsUsed: usedAfter,
      },
    });

    const state = revisionState(usedAfter);

    await prisma.projectUpdate
      .create({
        data: {
          projectId,
          title: 'Your feedback is with us',
          description: acknowledgement(t, state),
          statusStage: project.status,
          userId: null,
        },
      })
      .catch((error) => console.error(`Design feedback timeline entry failed for ${projectId}:`, error));

    await notifyAdminsDesignFeedback({
      projectId,
      projectName: project.name,
      company: project.client.company,
      round: project.designRound,
      liked,
      note,
      notAsAgreed: t.notAsAgreed,
      changes: t.changes,
      newScope: t.newScope,
      consumedRound: spends,
      revisionsUsed: usedAfter,
      revisionsIncluded: state.included,
    }).catch((error) => console.error(`Design feedback notify failed for ${projectId}:`, error));

    if (clientWantsEmail(project.client.emailPreferences, 'statusUpdates')) {
      await sendDesignFeedbackAckEmail({
        to: project.client.email,
        contactName: project.client.contactName,
        projectName: project.name,
        body: acknowledgement(t, state),
        dashboardUrl: `/client/${projectId}`,
      }).catch((error) => console.error(`Design feedback ack email failed for ${projectId}:`, error));
    }

    return NextResponse.json(
      {
        success: true,
        feedbackId: feedback.id,
        consumedRound: spends,
        revisions: state,
        acknowledgement: acknowledgement(t, state),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Design feedback error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Everything the client has said about this project's designs, newest first.
 *
 * Open to the client as well as the studio: they wrote it, and being able to
 * see what they already asked for is the difference between a form and a
 * black hole.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { session, response } = await requirePrincipal();
    if (!session) return response;

    const { projectId } = await params;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true, designRevisionsUsed: true, designRound: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (session.type === 'client' && project.clientId !== session.clientId) {
      return forbiddenResponse();
    }

    const feedback = await prisma.designFeedback.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
      {
        success: true,
        feedback,
        round: project.designRound,
        revisions: revisionState(project.designRevisionsUsed),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get design feedback error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Mark a round of feedback as read.
 *
 * Studio only. The unread flag is what puts it on the dashboard, and a client
 * being able to clear it would hide their own feedback from the people who
 * need to act on it.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { session, response } = await requirePrincipal();
    if (!session) return response;
    if (session.type !== 'user') return forbiddenResponse();

    const { projectId } = await params;
    const body = (await request.json().catch(() => null)) as { feedbackId?: unknown } | null;
    const feedbackId = typeof body?.feedbackId === 'string' ? body.feedbackId : null;

    await prisma.designFeedback.updateMany({
      where: { projectId, ...(feedbackId ? { id: feedbackId } : {}), reviewedAt: null },
      data: { reviewedAt: new Date() },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Mark design feedback read error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
