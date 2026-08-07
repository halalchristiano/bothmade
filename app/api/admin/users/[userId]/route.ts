import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { forbiddenResponse, requireOwner } from '@/lib/middleware';
import { isUserRole } from '@/lib/roles';
import { FIELD_LIMITS } from '@/lib/validation';

/**
 * Would this change leave nobody holding `owner`?
 *
 * This page is the only way back in, and only an owner can use it — so
 * demoting or deleting the last one locks user management behind a database
 * console, exactly the situation this feature exists to end. Counting is
 * cheap; recovering is not.
 */
async function wouldOrphanTeam(targetId: string, nextRole: string | null): Promise<boolean> {
  const owners = await prisma.user.findMany({
    where: { role: 'owner' },
    select: { id: true },
  });

  const remaining = owners.filter((u) => u.id !== targetId).length;
  // nextRole null means the account is going away entirely.
  const targetStaysOwner = nextRole === 'owner';

  return remaining === 0 && !targetStaysOwner;
}

/** Change a teammate's role, name or title. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await requireOwner();
    if (!session) return forbiddenResponse('Only an owner can change a teammate.');

    const { userId } = await params;
    const { name, role, title } = await request.json();

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ error: 'No such team member' }, { status: 404 });
    }

    const data: { name?: string | null; role?: string; title?: string | null } = {};

    // Capped the same way Settings caps them when somebody edits their own.
    // These two fields are written from three places; a limit that lives in
    // one of them is a limit the other two do not have.
    if (name !== undefined) {
      data.name =
        typeof name === 'string' && name.trim() ? name.trim().slice(0, FIELD_LIMITS.name) : null;
    }
    if (title !== undefined) {
      data.title =
        typeof title === 'string' && title.trim() ? title.trim().slice(0, FIELD_LIMITS.title) : null;
    }

    if (role !== undefined) {
      if (!isUserRole(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }

      // Changing your own role is how you accidentally demote yourself out of
      // the page you are standing on. Someone else with the rights can do it.
      if (userId === session.userId && role !== target.role) {
        return NextResponse.json(
          { error: "You can't change your own role. Ask another owner." },
          { status: 409 }
        );
      }

      if (await wouldOrphanTeam(userId, role)) {
        return NextResponse.json(
          { error: 'Someone has to stay an owner. Promote another account first.' },
          { status: 409 }
        );
      }

      data.role = role;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, role: true, title: true, createdAt: true },
    });

    return NextResponse.json({ success: true, user }, { status: 200 });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Remove a teammate. Their leads survive, unassigned. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await requireOwner();
    if (!session) return forbiddenResponse('Only an owner can remove a teammate.');

    const { userId } = await params;

    if (userId === session.userId) {
      return NextResponse.json(
        { error: "You can't remove your own account." },
        { status: 409 }
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: 'No such team member' }, { status: 404 });
    }

    if (await wouldOrphanTeam(userId, null)) {
      return NextResponse.json(
        { error: 'Someone has to stay an owner. Promote another account first.' },
        { status: 409 }
      );
    }

    // Leads point at their owner with onDelete: SetNull, so nothing in the
    // pipeline is destroyed here — it goes unassigned. Report how many, so
    // whoever did this knows there is a reassignment waiting on /admin/leads.
    const orphanedLeads = await prisma.lead.count({ where: { assignedToId: userId } });

    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({ success: true, orphanedLeads }, { status: 200 });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
