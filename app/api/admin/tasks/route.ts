import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { readTaskDueAt, readTaskTitle } from '@/lib/tasks';

export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const tasks = await prisma.task.findMany({
      where: { assignedToId: session.userId },
      orderBy: [{ done: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ success: true, tasks }, { status: 200 });
  } catch (error) {
    console.error('List tasks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { title, dueAt, assignedToId, relatedLeadId, relatedProjectId } = await request.json();

    const parsedTitle = readTaskTitle(title);
    if (!parsedTitle.ok) {
      return NextResponse.json({ error: parsedTitle.error }, { status: 400 });
    }

    /*
     * A date that is not a date is a bad field, not a broken server.
     *
     * This used to be `dueAt ? new Date(dueAt) : null`, so anything that
     * failed to parse became an Invalid Date, which Prisma refuses, which
     * landed in the catch below and came back as "Internal server error".
     * The one thing the caller could not learn from that is which field to
     * fix.
     */
    const parsedDue = readTaskDueAt(dueAt);
    if (!parsedDue.ok) {
      return NextResponse.json({ error: parsedDue.error }, { status: 400 });
    }

    /*
     * And an assignee has to be somebody.
     *
     * `assignedToId` arrives from the request body and went straight into the
     * write, so an id belonging to nobody hit the foreign key and produced
     * another 500. Checked here so the answer names the problem, and scoped
     * to staff because a task is work for this studio.
     */
    let owner = session.userId;
    if (assignedToId && assignedToId !== session.userId) {
      if (typeof assignedToId !== 'string') {
        return NextResponse.json({ error: 'Unknown assignee' }, { status: 400 });
      }
      const exists = await prisma.user.findUnique({
        where: { id: assignedToId },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json({ error: 'Unknown assignee' }, { status: 400 });
      }
      owner = assignedToId;
    }

    const task = await prisma.task.create({
      data: {
        title: parsedTitle.title,
        dueAt: parsedDue.dueAt,
        assignedToId: owner,
        createdById: session.userId,
        relatedLeadId: relatedLeadId || null,
        relatedProjectId: relatedProjectId || null,
      },
    });

    return NextResponse.json({ success: true, task }, { status: 201 });
  } catch (error) {
    console.error('Create task error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
