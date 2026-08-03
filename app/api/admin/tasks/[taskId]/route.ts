import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';

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
    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        title: title !== undefined ? title : undefined,
        done: done !== undefined ? done : undefined,
        dueAt: dueAt !== undefined ? (dueAt ? new Date(dueAt) : null) : undefined,
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
