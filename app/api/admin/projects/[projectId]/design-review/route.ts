import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { resolveSiteUrl } from '@/lib/site-url';
import { reviewNoticeLine, startReview } from '@/lib/design-approval';
import { sendDesignPresentedEmail } from '@/lib/email';
import { designStage } from '@/lib/design-stages';
import { normalizeUrl } from '@/lib/html';

/**
 * Start the Section 4 review clock by telling the client their design is
 * ready.
 *
 * This is the moment that matters, and until now it left no trace: a design
 * went over by email or on a call, and the five business days the contract
 * gives the client to respond began ticking somewhere nobody could see. The
 * clause that turns their silence into approval — and Payment 2 into money
 * owed — could not fire, because nothing knew when the clock had started.
 *
 * The deadline is written into the email. Deemed approval is only fair if the
 * client knew the terms before their silence started counting against them; a
 * client told "by Friday, or we take it as a yes" has been treated properly,
 * and one who discovers the rule in an invoice has not.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const { projectId } = await params;
    const body = (await request.json().catch(() => null)) as {
      note?: unknown;
      notifyClient?: unknown;
      designUrl?: unknown;
    } | null;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        status: true,
        designPresentedAt: true,
        designApprovedAt: true,
        designRound: true,
        designUrl: true,
        client: { select: { email: true, contactName: true, company: true } },
      },
    });
    if (!project) {
      return NextResponse.json({ error: 'That project no longer exists.' }, { status: 404 });
    }
    if (project.designApprovedAt) {
      return NextResponse.json(
        { error: 'The design on this project is already approved — there is no review period to start.' },
        { status: 409 }
      );
    }

    const now = new Date();
    const { presentedAt, endsAt } = startReview(now);
    const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null;

    /**
     * A second presentation is a new round.
     *
     * Round 1 is the original concept under Exhibit A; each one after it is a
     * revision the client asked for. The number is what their feedback gets
     * filed against, so "they asked for this on round 2" stays answerable
     * however many versions the project ends up going through.
     *
     * The round advances on PRESENTING, not on their feedback — the feedback
     * belongs to the version they were looking at when they wrote it, and
     * bumping it any earlier would file it against a design that did not
     * exist yet.
     */
    const isRepresentation = Boolean(project.designPresentedAt);
    const round = project.designRound + (isRepresentation ? 1 : 0);
    const stage = designStage(round);

    /*
     * The design itself, saved with the clock that starts over it.
     *
     * Section 4 runs the review period from when a Deliverable "is made
     * available" — so the thing being made available belongs on the record
     * that starts the clock, not in a separate message. Without it the
     * client's dashboard asked them to approve something it could not show.
     */
    const designUrl =
      typeof body?.designUrl === 'string' && body.designUrl.trim()
        ? normalizeUrl(body.designUrl.trim())
        : null;

    await prisma.project.update({
      where: { id: projectId },
      data: {
        designPresentedAt: presentedAt,
        designReviewEndsAt: endsAt,
        ...(designUrl ? { designUrl } : {}),
        ...(isRepresentation ? { designRound: { increment: 1 } } : {}),
      },
    });

    const reviewEndsLabel = endsAt.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    let emailSent = false;
    if (body?.notifyClient !== false) {
      const sent = await sendDesignPresentedEmail({
        to: project.client.email,
        contactName: project.client.contactName,
        projectName: project.name,
        noticeLine: reviewNoticeLine(endsAt),
        reviewEndsLabel,
        dashboardUrl: `${resolveSiteUrl()}/client/${project.id}`,
        note,
        stageLabel: stage.label,
        stageMeaning: stage.meaning,
        designUrl: designUrl ?? project.designUrl,
      }).catch((error) => {
        console.error(`Design presented email failed for ${projectId}:`, error);
        return { sent: false };
      });
      emailSent = Boolean(sent?.sent);
    }

    // On their timeline too, with the date. The clock is only defensible if
    // the client can see when it started and when it runs out.
    await prisma.projectUpdate
      .create({
        data: {
          projectId,
          title: `${stage.label} — ready to review`,
          description:
            `${stage.meaning}\n\n` +
            (note ? `${note}\n\n` : '') +
            `Take a look and tell us what you think by ${reviewEndsLabel}. If we haven't heard from you by then, we'll take it as approved and start building.`,
          statusStage: project.status,
          userId: session.userId,
        },
      })
      .catch((error) => console.error(`Design presented timeline entry failed for ${projectId}:`, error));

    return NextResponse.json(
      { success: true, presentedAt, reviewEndsAt: endsAt, reviewEndsLabel, emailSent, stage },
      { status: 200 }
    );
  } catch (error) {
    console.error('Start design review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Record that the client approved the design.
 *
 * Separate from the deemed path on purpose: "they said yes" and "they said
 * nothing for a week" are different facts, and only one of them is worth
 * anything if it is ever disputed. This one sets deemed to false and stays
 * that way — the nightly job never overwrites an approval somebody gave.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const { projectId } = await params;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, status: true, designApprovedAt: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'That project no longer exists.' }, { status: 404 });
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
          description: "You've approved the design — we're building it.",
          statusStage: project.status,
          userId: session.userId,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, approvedAt: now }, { status: 200 });
  } catch (error) {
    console.error('Record design approval error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
