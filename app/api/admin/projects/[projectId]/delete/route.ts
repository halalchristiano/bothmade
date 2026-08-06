import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';

/**
 * Delete a project, and everything hanging off it.
 *
 * Eleven tables cascade from this row: messages, updates, internal notes,
 * onboarding, instalments, payments, change orders, design feedback, the
 * design direction, the recurring offer. That is the whole record of an
 * engagement, and it does not come back.
 *
 * So two things guard it. A project with payments recorded against it cannot
 * be deleted at all — that is an accounting record, and no button should be
 * able to remove one; a test project that took real money is not a test
 * project. And the caller has to type the company name, which is the one
 * confirmation that cannot be satisfied by clicking through.
 *
 * What happened is written to team chat before the row goes, because every
 * other place it could be recorded is inside the thing being deleted.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const { projectId } = await params;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        totalPrice: true,
        client: { select: { company: true } },
        _count: { select: { payments: true, invoices: true, changeOrders: true } },
      },
    });
    if (!project) return NextResponse.json({ error: 'That project no longer exists.' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const typed = typeof body?.confirm === 'string' ? body.confirm.trim() : '';

    /*
     * Money makes it permanent.
     *
     * A payment is a record of something that actually happened between two
     * businesses. Cascading one away to tidy up a list is the kind of
     * deletion nobody discovers until an accountant asks about a figure that
     * no longer reconciles.
     */
    if (project._count.payments > 0) {
      return NextResponse.json(
        {
          error: `${project.client.company} has ${project._count.payments} payment${
            project._count.payments === 1 ? '' : 's'
          } recorded against it. Payments are an accounting record — this project cannot be deleted. Archive the client instead, or tell us what you actually need removed.`,
        },
        { status: 409 }
      );
    }

    // Case-insensitive, because the point is proving you know which project
    // this is, not proving you can match capitalisation.
    if (typed.toLowerCase() !== project.client.company.trim().toLowerCase()) {
      return NextResponse.json(
        { error: `Type "${project.client.company}" exactly to confirm.` },
        { status: 400 }
      );
    }

    // Written first. Everywhere else it could go is about to be deleted.
    await prisma.teamMessage
      .create({
        data: {
          content: `🗑️ Deleted the project "${project.name}" for ${project.client.company}, and everything on it — messages, updates, notes, onboarding, instalments and change orders.`,
          fromUserId: session.userId,
          urgent: false,
        },
      })
      .catch((e) => console.error('Project deletion not announced:', e));

    await prisma.project.delete({ where: { id: projectId } });

    return NextResponse.json({ success: true, company: project.client.company }, { status: 200 });
  } catch (error) {
    console.error('Delete project error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
