import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { readTaskDueAt, readTaskTitle } from '@/lib/tasks';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { taskId } = await params;
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.assignedToId !== session.userId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const { title, done, dueAt } = await request.json();

    /*
     * The same rules the create route applies, which this one did not.
     *
     * `title: title !== undefined ? title : undefined` wrote whatever
     * arrived, so a PATCH could blank a title that POST refuses outright —
     * leaving a checkbox on the list with nothing beside it and no way to
     * tell which task it was. And `dueAt ? new Date(dueAt) : null` turned an
     * unparseable date into an Invalid Date, which Prisma rejects and the
     * catch below reported as "Internal server error" for one bad field.
     *
     * Both are checked only when the field is actually being changed:
     * ticking a box sends `{ done }` alone and must not be made to justify a
     * title it never mentioned.
     */
    let nextTitle: string | undefined;
    if (title !== undefined) {
      const parsed = readTaskTitle(title);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      nextTitle = parsed.title;
    }

    let nextDue: Date | null | undefined;
    if (dueAt !== undefined) {
      const parsed = readTaskDueAt(dueAt);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      nextDue = parsed.dueAt;
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        title: nextTitle,
        done: done !== undefined ? Boolean(done) : undefined,
        dueAt: nextDue,
      },
    });

    return NextResponse.json({ success: true, task: updated }, { status: 200 });
  } catch (error) {
    console.error('Update task error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { taskId } = await params;
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.assignedToId !== session.userId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    await prisma.task.delete({ where: { id: taskId } });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Delete task error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
