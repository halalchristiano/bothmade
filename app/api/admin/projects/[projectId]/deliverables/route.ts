import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

/**
 * Deliverables, as rows.
 *
 * These used to be a JSON array on `Project.deliverables`, and both handlers
 * did read-modify-write: load the whole array, splice it, write the whole
 * array back. Two uploads finishing in the same second both read the old
 * array, both appended their own file, and whichever wrote second erased
 * the other — a delivered file gone, with the client already told it had
 * been sent. Deleting one file while another was uploading did the same
 * thing in reverse.
 *
 * A child table makes each file its own row, so concurrent writes touch
 * different rows and cannot clobber each other.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { projectId } = await params;
    const deliverables = await prisma.deliverable.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ success: true, deliverables }, { status: 200 });
  } catch (error) {
    console.error('List deliverables error:', error);
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
    const { name, url, size } = await request.json();

    if (!name || !url) {
      return NextResponse.json(
        { error: 'File name and URL are required' },
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

    await prisma.deliverable.create({
      data: {
        projectId,
        name: String(name).slice(0, 300),
        url: String(url),
        size: size ? String(size).slice(0, 40) : null,
      },
    });

    const deliverables = await prisma.deliverable.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ success: true, deliverables }, { status: 201 });
  } catch (error) {
    console.error('Add deliverable error:', error);
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
      return NextResponse.json({ error: 'Deliverable id is required' }, { status: 400 });
    }

    // Scoped to the project in the path, so an id belonging to another
    // project can't be deleted through this route.
    const { count } = await prisma.deliverable.deleteMany({
      where: { id, projectId },
    });

    if (count === 0) {
      return NextResponse.json(
        { error: 'That file is not on this project' },
        { status: 404 }
      );
    }

    const deliverables = await prisma.deliverable.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ success: true, deliverables }, { status: 200 });
  } catch (error) {
    console.error('Delete deliverable error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
