import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { forbiddenResponse, requireOwner, requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { accountingHoldReason, bulkDeletePhrase, matchesBulkDeletePhrase } from '@/lib/deletion-guards';

/**
 * Delete several projects at once — for clearing out test data, which is the
 * only reason this exists.
 *
 * A studio ends up with a handful of "Finale test" and "testing_company"
 * projects sitting in the handoff queue looking exactly like work waiting to
 * be picked up. Removing them one at a time means six page loads and six
 * typed company names, which is enough friction that they stay.
 *
 * Everything the single delete refuses, this refuses. It is the same guard
 * from lib/deletion-guards.ts, applied per project, and a project holding
 * payments or invoices is simply left behind and reported rather than
 * failing the whole batch — otherwise one real project among five test ones
 * means nothing gets deleted and the person has to work out which.
 *
 * ## Owner-only
 *
 * Matching bulk lead deletion, which took the same view: deleting records in
 * bulk is the most destructive thing the admin can do and is not part of a
 * rep's day. A single project delete stays open to any staff member.
 */

/**
 * Fifty is well above any real tidy-up and well below "the whole book by
 * accident". The list this is driven from has no pagination, so a select-all
 * on a studio with hundreds of projects would otherwise arrive here as one
 * request.
 */
const MAX_PROJECTS = 50;

export async function POST(request: NextRequest) {
  try {
    if (!(await requireStaff())) return unauthorizedResponse();
    const session = await requireOwner();
    if (!session) {
      return forbiddenResponse('Only an owner can delete projects in bulk. Ask Kiana to run this one.');
    }

    const body = await request.json().catch(() => null);
    const projectIds: unknown = body?.projectIds;

    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      return NextResponse.json({ error: 'No projects selected.' }, { status: 400 });
    }
    if (projectIds.some((id) => typeof id !== 'string')) {
      return NextResponse.json({ error: 'No projects selected.' }, { status: 400 });
    }
    if (projectIds.length > MAX_PROJECTS) {
      return NextResponse.json(
        { error: `${MAX_PROJECTS} projects at a time is the limit. Select fewer.` },
        { status: 400 }
      );
    }

    /*
     * The typed confirmation, which cannot be the company name here.
     *
     * Across six companies, typing one of the six names proves nothing about
     * the other five. The phrase carries the count instead, so it cannot be
     * typed ahead of the selection and stops matching the moment the
     * selection changes underneath it.
     */
    const ids = [...new Set(projectIds as string[])];
    if (!matchesBulkDeletePhrase(body?.confirm, ids.length)) {
      return NextResponse.json(
        { error: `Type "${bulkDeletePhrase(ids.length)}" exactly to confirm.` },
        { status: 400 }
      );
    }

    const projects = await prisma.project.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        client: { select: { company: true } },
        _count: { select: { payments: true, invoices: true } },
      },
    });

    if (projects.length === 0) {
      return NextResponse.json({ error: 'Those projects no longer exist.' }, { status: 404 });
    }

    const blocked: Array<{ id: string; name: string; company: string; reason: string }> = [];
    const deletable: Array<{ id: string; name: string; company: string }> = [];

    for (const p of projects) {
      const reason = accountingHoldReason(p._count);
      const row = { id: p.id, name: p.name, company: p.client.company };
      if (reason) blocked.push({ ...row, reason });
      else deletable.push(row);
    }

    if (deletable.length === 0) {
      return NextResponse.json(
        {
          error:
            'Every project selected has payments or invoices against it. Those are accounting records — decommission the client instead.',
          deleted: [],
          blocked,
        },
        { status: 409 }
      );
    }

    /*
     * One message for the batch, written before anything goes.
     *
     * The single delete announces each deletion, and six of those in a row
     * is a team chat nobody reads to the end. It still has to be written
     * first: every other place this could be recorded is inside what is
     * about to be deleted.
     */
    const summary = deletable.map((p) => `${p.company} — ${p.name}`).join(', ');
    await prisma.teamMessage
      .create({
        data: {
          content:
            `🗑️ Deleted ${deletable.length} project${deletable.length === 1 ? '' : 's'} and everything on them: ${summary}.` +
            (blocked.length > 0
              ? ` Left ${blocked.length} alone — ${blocked.map((b) => `${b.company} (${b.reason})`).join(', ')}.`
              : ''),
          fromUserId: session.userId,
          urgent: false,
        },
      })
      .catch((e) => console.error('Bulk project deletion not announced:', e));

    const { count } = await prisma.project.deleteMany({
      where: { id: { in: deletable.map((p) => p.id) } },
    });

    return NextResponse.json({ success: true, count, deleted: deletable, blocked }, { status: 200 });
  } catch (error) {
    console.error('Bulk delete projects error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
