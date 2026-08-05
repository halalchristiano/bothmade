import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readDeliverable } from '@/lib/deliverables';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import crypto from 'crypto';

interface Deliverable {
  id: string;
  name: string;
  url: string;
  size?: string;
  addedAt: string;
}

async function getDeliverables(projectId: string): Promise<Deliverable[]> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project?.deliverables) return [];
  try {
    return JSON.parse(project.deliverables) as Deliverable[];
  } catch {
    return [];
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


    const { name, url, size } = await request.json();
    // "File name and URL are required" only checked they were non-empty, so a
    // name typed into the URL box passed and became a permanent link that
    // opens nothing — on the client's dashboard too, where there is no Delete.
    const parsed = readDeliverable({ name, url });
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const deliverables = await getDeliverables((await params).projectId);
    const newDeliverable: Deliverable = {
      id: crypto.randomUUID(),
      name: parsed.name,
      url: parsed.url,
      size,
      addedAt: new Date().toISOString(),
    };
    deliverables.push(newDeliverable);

    await prisma.project.update({
      where: { id: (await params).projectId },
      data: { deliverables: JSON.stringify(deliverables) },
    });

    return NextResponse.json({ success: true, deliverables }, { status: 201 });
  } catch (error) {
    console.error('Add deliverable error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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


    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json(
        { error: 'Deliverable id is required' },
        { status: 400 }
      );
    }

    const deliverables = (await getDeliverables((await params).projectId)).filter(
      (d) => d.id !== id
    );

    await prisma.project.update({
      where: { id: (await params).projectId },
      data: { deliverables: JSON.stringify(deliverables) },
    });

    return NextResponse.json({ success: true, deliverables }, { status: 200 });
  } catch (error) {
    console.error('Delete deliverable error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
