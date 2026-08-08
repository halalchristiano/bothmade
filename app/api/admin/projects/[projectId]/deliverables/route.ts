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

function parseDeliverables(raw: string | null): Deliverable[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Deliverable[]) : [];
  } catch {
    return [];
  }
}

/**
 * Change the list under a lock, because it is one JSON string in one column.
 *
 * Both handlers here read the whole blob, changed it in memory, and wrote it
 * back. Two requests overlapping — which is precisely what handover looks
 * like, two people adding files from the pack at the same time — both read
 * the same list, and whichever wrote second silently erased the other's file.
 * No error anywhere; the file is simply not there, on the page the client
 * downloads their handover from.
 *
 * `FOR UPDATE` holds the project row for the rest of the transaction, so the
 * second request waits and reads the first one's result. A schema that stored
 * these as rows would not need this — but that is a migration against a live
 * database, and this is the same correctness for a lock and no downtime.
 *
 * Returns null when the project is gone, which the callers turn into a 404
 * rather than the 500 an update against a missing id used to produce.
 */
async function mutateDeliverables(
  projectId: string,
  change: (current: Deliverable[]) => Deliverable[]
): Promise<Deliverable[] | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ deliverables: string | null }>>`
      SELECT "deliverables" FROM "projects" WHERE "id" = ${projectId} FOR UPDATE
    `;
    if (rows.length === 0) return null;

    const next = change(parseDeliverables(rows[0].deliverables));
    await tx.project.update({
      where: { id: projectId },
      data: { deliverables: JSON.stringify(next) },
    });
    return next;
  });
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


    const { name, url, size } = await request
      .json()
      .catch(() => ({}) as Record<string, unknown>);
    // "File name and URL are required" only checked they were non-empty, so a
    // name typed into the URL box passed and became a permanent link that
    // opens nothing — on the client's dashboard too, where there is no Delete.
    const parsed = readDeliverable({ name, url });
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const newDeliverable: Deliverable = {
      id: crypto.randomUUID(),
      name: parsed.name,
      url: parsed.url,
      // Free text out of a form, straight onto the client's dashboard. Capped
      // and stringified rather than trusted — everything else on this record
      // goes through readDeliverable(), and this was the one field that did not.
      size: typeof size === 'string' && size.trim() ? size.trim().slice(0, 40) : undefined,
      addedAt: new Date().toISOString(),
    };

    const deliverables = await mutateDeliverables((await params).projectId, (current) => [
      ...current,
      newDeliverable,
    ]);
    if (!deliverables) {
      return NextResponse.json({ error: 'That project no longer exists.' }, { status: 404 });
    }

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

    let found = false;
    const deliverables = await mutateDeliverables((await params).projectId, (current) => {
      found = current.some((d) => d.id === id);
      return current.filter((d) => d.id !== id);
    });
    if (!deliverables) {
      return NextResponse.json({ error: 'That project no longer exists.' }, { status: 404 });
    }
    if (!found) {
      // Filtering nothing out and answering "success" is how a stale tab
      // reports a file removed that somebody else removed minutes ago — and
      // how it would report one removed that is still sitting there.
      return NextResponse.json(
        { error: 'That file is not on this project — it may already have been removed.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, deliverables }, { status: 200 });
  } catch (error) {
    console.error('Delete deliverable error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
