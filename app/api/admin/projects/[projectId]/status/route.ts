import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { sendStatusUpdateEmail } from '@/lib/email';
import { clientWantsEmail } from '@/lib/email-preferences';
import { gateOpenedBy, stageMessage } from '@/lib/stage-gates';

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


    // A body that is not JSON is a bad request, not a server fault. Unguarded,
    // `.json()` threw into the catch below and answered 500 — which reads as
    // "we broke" for what is really "you sent nothing". Every other route here
    // already does this; this one was the exception.
    const { status, description, title } = await request.json().catch(() => ({}) as Record<string, unknown>);

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
    // A project can be moved backwards to correct a mistake. That is not a
    // gate being passed, and prompting for money on it would be the system
    // asking to invoice because somebody fixed a typo.
    const movingForward = statusStage > project.statusStage;
    const movingBackward = statusStage < project.statusStage;

    /*
     * A correction is not an announcement.
     *
     * Everything below this line assumed the stage only ever goes up. So
     * moving a project back — a mis-click on the dropdown, a stage advanced
     * by the wrong person — did the full ceremony in reverse: it wrote the
     * earlier stage's forward-looking copy onto the client's timeline and
     * emailed it to them. A client whose site is in Build got "Design has
     * started — Discovery's done and we're designing... You'll see a concept
     * before a single line of code is written."
     *
     * That is not a small piece of noise. It reads as the project having gone
     * backwards, which is the single thing a client is most likely to ring up
     * about, and it is being said by us, in our own words, on purpose as far
     * as they can tell.
     *
     * So a backwards move with nothing written is treated as what it is: an
     * internal correction. The stage moves, and nobody is told. A backwards
     * move WITH a message is a different act — somebody has deliberately
     * written to the client about it — and that still goes.
     */
    const wrote = typeof description === 'string' && description.trim().length > 0;
    const silentCorrection = movingBackward && !wrote;

    const updatedProject = await prisma.project.update({
      where: { id: (await params).projectId },
      data: { status, statusStage },
    });

    if (silentCorrection) {
      return NextResponse.json(
        {
          success: true,
          project: updatedProject,
          update: null,
          gateOpened: null,
          // Named, so the page can say what just happened rather than
          // implying an update went out.
          correctedSilently: true,
        },
        { status: 200 }
      );
    }

    // What the client actually reads. The defaults used to be "Status changed
    // to build" and "Project moved to the build phase." — the software talking
    // about itself, telling them nothing the progress bar had not already
    // said. Whatever the caller sends wins; the default is only there so
    // sending stays one click on a busy day.
    const fallback = stageMessage(status);
    const update = await prisma.projectUpdate.create({
      data: {
        projectId: (await params).projectId,
        title: typeof title === 'string' && title.trim() ? title.trim().slice(0, 200) : fallback.title,
        description:
          typeof description === 'string' && description.trim() ? description.trim() : fallback.body,
        statusStage: status,
        userId: session.userId,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    /**
     * Did that move just make a payment invoiceable?
     *
     * Reported, never acted on. Section 7 has the second and third
     * instalments "invoiced on the day of approval", and that day used to
     * pass unmarked — the money became payable and nothing anywhere said so.
     *
     * It is an inference: the contract's gate is Design Approval, and a
     * dropdown moving to Build is our evidence for it rather than the thing
     * itself. So it comes back with the claim it is making and the clause
     * behind it, for a person to agree with or not. Nothing is invoiced here.
     */
    const instalments = await prisma.instalment.findMany({
      where: { projectId: project.id },
      orderBy: { index: 'asc' },
      select: { id: true, index: true, label: true, amountCents: true, trigger: true, status: true },
    });
    const gate = movingForward ? gateOpenedBy(status, instalments) : null;

    const prefs = await prisma.emailPreferences.findUnique({
      where: { clientId: project.clientId },
    });

    if (clientWantsEmail(prefs, 'statusUpdates')) {
      await sendStatusUpdateEmail(
        project.client.email,
        project.client.company,
        project.name,
        update.title,
        update.description,
        project.id
      ).catch((error) => console.error(`Status email failed for ${project.id}:`, error));
    }

    return NextResponse.json(
      { success: true, project: updatedProject, update, gateOpened: gate },
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
