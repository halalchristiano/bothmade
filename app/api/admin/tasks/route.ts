import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    // Mine, plus anything I assigned to somebody else. Filtering to
    // assignedToId alone meant delegating a task made it vanish from the
    // delegator's own list — so "did Evan ever do that thing I asked?" had
    // no answer anywhere in the product.
    const tasks = await prisma.task.findMany({
      where: {
        OR: [{ assignedToId: session.userId }, { createdById: session.userId }],
      },
      orderBy: [{ done: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    // Resolve the linked lead/project names in two queries rather than one
    // per task, so a task can say what it's about instead of showing an id.
    const leadIds = [...new Set(tasks.map((t) => t.relatedLeadId).filter(Boolean) as string[])];
    const projectIds = [...new Set(tasks.map((t) => t.relatedProjectId).filter(Boolean) as string[])];

    const [leads, projects] = await Promise.all([
      leadIds.length
        ? prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, company: true } })
        : Promise.resolve([]),
      projectIds.length
        ? prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);
    const leadById = new Map(leads.map((l) => [l.id, l.company]));
    const projectById = new Map(projects.map((p) => [p.id, p.name]));

    const enriched = tasks.map((t) => ({
      ...t,
      assigneeName: t.assignedTo?.name || t.assignedTo?.email || null,
      assignedToMe: t.assignedToId === session.userId,
      relatedLabel: t.relatedLeadId
        ? leadById.get(t.relatedLeadId) ?? null
        : t.relatedProjectId
        ? projectById.get(t.relatedProjectId) ?? null
        : null,
      relatedHref: t.relatedLeadId
        ? `/admin/leads/${t.relatedLeadId}`
        : t.relatedProjectId
        ? `/admin/projects/${t.relatedProjectId}`
        : null,
    }));

    return NextResponse.json({ success: true, tasks: enriched }, { status: 200 });
  } catch (error) {
    console.error('List tasks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { title, dueAt, assignedToId, relatedLeadId, relatedProjectId } = await request.json();
    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        dueAt: dueAt ? new Date(dueAt) : null,
        assignedToId: assignedToId || session.userId,
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
