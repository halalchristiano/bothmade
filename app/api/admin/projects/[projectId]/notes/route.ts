import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';

export async function GET(
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


    const { projectId } = await params;

    const notes = await prisma.teamNote.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ success: true, notes }, { status: 200 });
  } catch (error) {
    console.error('Get team notes error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
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


    const { projectId } = await params;
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);

    /*
     * `if (!content)` was the whole check, and it let three things through.
     *
     * A string of spaces is falsy only when it is empty, so "   " passed and
     * became a note that renders as a blank grey box nobody can explain or
     * delete. A non-string passed too — the create then failed on the column
     * type and answered 500, which reads as our fault rather than as a bad
     * request. And there was no ceiling at all on something typed into a
     * textarea that is read back in a scrolling panel.
     */
    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    if (!content) {
      return NextResponse.json(
        { error: 'Write something first — a blank note helps nobody.' },
        { status: 400 }
      );
    }

    /*
     * And the project has to exist. Without this the create failed on the
     * foreign key and answered 500 — "we broke" for what is really a stale
     * tab writing to a project somebody else deleted, which is the ordinary
     * way this happens with several people in the admin at once.
     */
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'That project no longer exists.' }, { status: 404 });
    }

    const note = await prisma.teamNote.create({
      data: { projectId, content: content.slice(0, 5000), authorId: session.userId },
      include: { author: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ success: true, note }, { status: 201 });
  } catch (error) {
    console.error('Create team note error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
