import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';

/**
 * Push a project off the Priorities list until a date, or pull it back.
 *
 * Deliberately the only thing this route does. Snoozing must not touch the
 * project's status, its balance, or the client's view of anything — the
 * problem is still there, it just isn't being shouted about today. A route
 * that could quietly mark work complete as a side effect of tidying a list is
 * a route somebody eventually uses to tidy a list.
 */

/** A month is the outside edge of "not right now" before it becomes forgetting. */
const MAX_SNOOZE_DAYS = 31;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const { days } = await request.json().catch(() => ({ days: null }));

    // null clears it — the row comes straight back to the list.
    let until: Date | null = null;
    if (days !== null && days !== undefined) {
      if (typeof days !== 'number' || !Number.isFinite(days) || days < 1 || days > MAX_SNOOZE_DAYS) {
        return NextResponse.json(
          { error: `Snooze for between 1 and ${MAX_SNOOZE_DAYS} days, or send null to undo it.` },
          { status: 400 }
        );
      }
      until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    const { projectId } = await params;
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // updatedAt is the input to the "gone quiet" check, and snoozing a row is
    // not somebody touching the work. Raw SQL rather than prisma.update
    // because @updatedAt stamps on every update and would reset the clock —
    // hiding a stale project from one list by making it look fresh to another.
    await prisma.$executeRaw`
      UPDATE "projects" SET "prioritySnoozedUntil" = ${until} WHERE "id" = ${projectId}
    `;

    return NextResponse.json({ success: true, prioritySnoozedUntil: until }, { status: 200 });
  } catch (error) {
    console.error('Snooze project error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
