import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { PROJECT_STAGES, isProjectStatus } from '@/lib/project-status';

/**
 * Dated milestones on a project.
 *
 * Before this, the only date a project carried was a single
 * estimatedCompletionDate for the whole engagement, so "late" could only be
 * assessed once — at the very end, when it is far too late to do anything
 * about it. Per-milestone dates are what let a slip show up in week two.
 *
 * `wasLate` is stamped at completion rather than derived on read, so the
 * on-time rate is a record of what happened and cannot be rewritten by
 * moving a due date afterwards.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { projectId } = await params;
    const milestones = await prisma.milestone.findMany({
      where: { projectId },
      orderBy: [{ dueAt: 'asc' }, { order: 'asc' }],
    });

    const now = new Date();
    return NextResponse.json(
      {
        success: true,
        milestones: milestones.map((m) => ({
          ...m,
          overdue: !m.completedAt && m.dueAt < now,
          daysUntilDue: Math.round((m.dueAt.getTime() - now.getTime()) / 86400000),
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('List milestones error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { projectId } = await params;
    const { title, dueAt, stage } = await request.json();

    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'A title is required.' }, { status: 400 });
    }
    const due = dueAt ? new Date(dueAt) : null;
    if (!due || Number.isNaN(due.getTime())) {
      return NextResponse.json(
        { error: 'A due date is required — a milestone without one is just a note.' },
        { status: 400 }
      );
    }
    if (stage !== undefined && !isProjectStatus(stage)) {
      return NextResponse.json(
        { error: `stage must be one of: ${PROJECT_STAGES.join(', ')}` },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const count = await prisma.milestone.count({ where: { projectId } });
    const milestone = await prisma.milestone.create({
      data: {
        projectId,
        title: title.trim().slice(0, 200),
        dueAt: due,
        stage: stage ?? 'build',
        order: count,
      },
    });

    return NextResponse.json({ success: true, milestone }, { status: 201 });
  } catch (error) {
    console.error('Create milestone error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { projectId } = await params;
    const { id, completed, title, dueAt } = await request.json();

    if (typeof id !== 'string') {
      return NextResponse.json({ error: 'Milestone id is required' }, { status: 400 });
    }

    // Scoped to the project in the path, so an id from another project
    // can't be edited through this route.
    const existing = await prisma.milestone.findFirst({ where: { id, projectId } });
    if (!existing) {
      return NextResponse.json(
        { error: 'That milestone is not on this project' },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {};

    if (completed !== undefined) {
      if (completed) {
        const completedAt = existing.completedAt ?? new Date();
        data.completedAt = completedAt;
        // Recorded once, at the moment of completion. Deriving it on read
        // would let someone push the due date out afterwards and turn a
        // missed milestone into an on-time one.
        if (!existing.completedAt) data.wasLate = completedAt > existing.dueAt;
      } else {
        data.completedAt = null;
        data.wasLate = false;
      }
    }
    if (typeof title === 'string' && title.trim()) data.title = title.trim().slice(0, 200);
    if (dueAt !== undefined) {
      const due = new Date(dueAt);
      if (Number.isNaN(due.getTime())) {
        return NextResponse.json({ error: 'That due date is not a date.' }, { status: 400 });
      }
      data.dueAt = due;
    }

    const milestone = await prisma.milestone.update({ where: { id }, data });
    return NextResponse.json({ success: true, milestone }, { status: 200 });
  } catch (error) {
    console.error('Update milestone error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { projectId } = await params;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Milestone id is required' }, { status: 400 });
    }

    const { count } = await prisma.milestone.deleteMany({ where: { id, projectId } });
    if (count === 0) {
      return NextResponse.json(
        { error: 'That milestone is not on this project' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Delete milestone error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
