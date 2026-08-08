import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { sanitizeAttachments, visibleToWhere } from '@/lib/team-chat';

/**
 * The team thread.
 *
 * Two bugs this route used to carry, both now gone. It fetched the OLDEST
 * 200 rows (orderBy asc + take), so once system traffic pushed history past
 * 200 the newest messages never appeared at all — the chat silently froze
 * in the past. And listing had write side effects: every poll stamped read
 * receipts and teamChatReadAt, so a background tab marked everything read
 * forever. Reads now read; marking read is its own POST (/read), called by
 * the page only when it's actually visible.
 *
 * ?after=<ISO date> returns only newer rows, which is what lets the page
 * poll cheaply instead of refetching the world every 15 seconds.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const after = request.nextUrl.searchParams.get('after');
    const afterDate = after ? new Date(after) : null;
    const validAfter = afterDate && !Number.isNaN(afterDate.getTime()) ? afterDate : null;

    // Broadcasts and MY conversations only — a DM between two other people
    // is not this caller's to read, and the page's "Only the two of you see
    // this" promise has to be true at the API, not just in the filter the
    // browser applies.
    const visibility = visibleToWhere(session.userId);
    const messages = await prisma.teamMessage.findMany({
      where: validAfter ? { AND: [visibility, { createdAt: { gt: validAfter } }] } : visibility,
      // Newest 200, presented oldest-first. The reverse matters: "the most
      // recent two hundred" is what a chat means by history.
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        fromUser: { select: { id: true, name: true, email: true } },
      },
    });
    messages.reverse();

    /*
     * The state of the flags, alongside the new rows.
     *
     * A poll asks for `createdAt > after`, which is the right question for
     * "what has been said since" and the wrong one for "what has changed".
     * Resolving a flag edits a row without moving its timestamp, so it was
     * invisible to every other tab: one person cleared an urgent question and
     * everybody else's rail kept counting it, and their Flags view kept
     * offering to resolve something already resolved, until they happened to
     * reload. On the one board in the app whose whole promise is that a flag
     * stays up until somebody deals with it, that is the promise breaking.
     *
     * There is no `updatedAt` on this table to poll against, and adding one
     * is a migration against the production database for a column only this
     * would read. The flagged set is small and bounded instead — ids and a
     * boolean, scoped by the same visibility rule as the messages themselves
     * — so a poll can reconcile what it already has rather than refetch the
     * world. Sent on polls only; a first load has just read the truth.
     */
    const flags = validAfter
      ? await prisma.teamMessage.findMany({
          where: { AND: [visibility, { urgent: true }] },
          select: { id: true, resolved: true },
          orderBy: { createdAt: 'desc' },
          take: 200,
        })
      : undefined;

    return NextResponse.json({ success: true, messages, ...(flags ? { flags } : {}) }, { status: 200 });
  } catch (error) {
    console.error('List team messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { content, toUserId, relatedLeadId, relatedProjectId, urgent, attachments } =
      await request.json();
    const files = sanitizeAttachments(attachments);
    if ((!content || typeof content !== 'string' || !content.trim()) && files.length === 0) {
      return NextResponse.json({ error: 'Say something or attach something' }, { status: 400 });
    }

    // A DM to a user that doesn't exist would store silently and never be
    // seen by anyone — the worst kind of sent message.
    if (toUserId) {
      const recipient = await prisma.user.findUnique({ where: { id: String(toUserId) }, select: { id: true } });
      if (!recipient) {
        return NextResponse.json({ error: 'That teammate no longer exists' }, { status: 400 });
      }
    }

    const message = await prisma.teamMessage.create({
      data: {
        content: typeof content === 'string' ? content.trim() : '',
        fromUserId: session.userId,
        toUserId: toUserId || null,
        relatedLeadId: relatedLeadId || null,
        relatedProjectId: relatedProjectId || null,
        urgent: Boolean(urgent),
        attachments: files as unknown as Prisma.InputJsonValue,
      },
      include: {
        fromUser: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, message }, { status: 201 });
  } catch (error) {
    console.error('Send team message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
