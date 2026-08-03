import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { forbiddenResponse, requireTeamManager } from '@/lib/middleware';
import { isPrivilegedRole, isUserRole } from '@/lib/roles';

/**
 * Would this change leave nobody able to manage the team?
 *
 * The team page is the only way back in, so demoting or deleting the last
 * privileged account locks the CRM's user management behind a database
 * console — exactly the situation this feature exists to end. Counting is
 * cheap; recovering is not.
 */
async function wouldOrphanTeam(targetId: string, nextRole: string | null): Promise<boolean> {
  const privileged = await prisma.user.findMany({
    where: { role: { in: ['owner', 'admin'] } },
    select: { id: true },
  });

  const remaining = privileged.filter((u) => u.id !== targetId).length;
  // nextRole null means the account is going away entirely.
  const targetStaysPrivileged = nextRole !== null && isPrivilegedRole(nextRole);

  return remaining === 0 && !targetStaysPrivileged;
}

/** Change a teammate's role, name or title. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const manager = await requireTeamManager();
    if (!manager) return forbiddenResponse();

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

    if (name !== undefined) {
      data.name = typeof name === 'string' && name.trim() ? name.trim() : null;
    }
    if (title !== undefined) {
      data.title = typeof title === 'string' && title.trim() ? title.trim() : null;
    }

    if (role !== undefined) {
      if (!isUserRole(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }

      // Changing your own role is how you accidentally demote yourself out of
      // the page you are standing on. Someone else with the rights can do it.
      if (userId === manager.userId && role !== target.role) {
        return NextResponse.json(
          { error: "You can't change your own role. Ask another owner or admin." },
          { status: 409 }
        );
      }

      if (await wouldOrphanTeam(userId, role)) {
        return NextResponse.json(
          { error: 'Someone has to keep owner or admin access. Promote another account first.' },
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
    const manager = await requireTeamManager();
    if (!manager) return forbiddenResponse();

    const { userId } = await params;

    if (userId === manager.userId) {
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
        { error: 'Someone has to keep owner or admin access. Promote another account first.' },
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
