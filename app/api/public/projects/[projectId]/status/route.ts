import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Public (no login) — read-only status snapshot a client can forward to
 * their own team, same trust model as the lead proposal link: the cuid
 * itself is the unguessable "token". Deliberately excludes anything
 * internal or financial (messages, payments, pricing) so an accidentally
 * forwarded link doesn't leak more than "here's where things stand."
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: { select: { company: true } },
        updates: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, title: true, description: true, createdAt: true },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        success: true,
        project: {
          name: project.name,
          company: project.client.company,
          statusStage: project.statusStage,
          estimatedCompletionDate: project.estimatedCompletionDate,
          updates: project.updates,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get public project status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
