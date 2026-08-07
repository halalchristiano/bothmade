// Team chat's shared server logic.
//
// Two things lived scattered before this file existed: the three-clause
// unread predicate, hand-copied (with the same explanatory comment) across
// the list route, the unread-count route, and the notifications bell — and
// the system messages, hand-rolled by eight call sites with ad-hoc "Re: X —"
// conventions and, worst, attributed to whichever real user the caller had
// to hand, so the Stripe webhook's celebration bubble rendered as words a
// person never wrote.

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { readAttachments, type Attachment } from '@/lib/attachments';

export type TeamAttachment = Attachment;

/**
 * Unread = not sent by me, addressed to me or broadcast, arrived since I
 * last opened the chat. Keying off the per-user teamChatReadAt rather than
 * the shared TeamMessage.readAt is the point: readAt is one column on the
 * message, so the first person to open a broadcast would mark it read for
 * everybody.
 */
export function unreadWhere(userId: string, readAt: Date | null): Prisma.TeamMessageWhereInput {
  // Deliberately its own OR rather than visibleToWhere() below: this clause
  // already excludes my own messages, so the "sent by me" arm that belongs in
  // a visibility check would be dead weight here and read as a contradiction.
  return {
    fromUserId: { not: userId },
    OR: [{ toUserId: userId }, { toUserId: null }],
    ...(readAt ? { createdAt: { gt: readAt } } : {}),
  };
}

/**
 * Which messages this person is allowed to touch at all.
 *
 * Broadcasts, and the two sides of their own DMs. Nothing else — a DM between
 * two other people is not theirs to read, and the chat's "Only the two of you
 * see this" is a promise the API has to keep rather than a filter the browser
 * applies.
 *
 * Here rather than inline because the listing route was the only place that
 * had it. Resolving a flag — `PATCH /api/admin/team-messages/[messageId]` —
 * looked a message up by id alone, so any staff account could clear or
 * re-raise the urgent flag on a conversation it could not open: the flag
 * vanishes from the other pair's bell, or reappears, and neither of them did
 * it. The id is a cuid and not discoverable through the listing route, which
 * is why this stayed quiet; it is still a write on somebody else's thread.
 */
export function visibleToWhere(userId: string): Prisma.TeamMessageWhereInput {
  return { OR: [{ toUserId: null }, { toUserId: userId }, { fromUserId: userId }] };
}

/**
 * The app narrating into the chat — a payment landed, a mockup shipped.
 *
 * kind: 'system' renders as a timeline row, not a speech bubble, which is
 * what stops automation from impersonating whoever findFirst returned. A
 * fromUserId is still required (the schema wants an author and a cascade
 * anchor), so callers pass the most-relevant user; the UI just no longer
 * puts the words in their mouth.
 */
export async function postSystemMessage(input: {
  content: string;
  /**
   * Optional, because some of these are narrated by an unauthenticated
   * request — a client approving their mockup from an emailed link has no
   * session and is not a team member. Left out, the message is attributed to
   * the lead's owner if there is one and to any staff account otherwise;
   * `kind: 'system'` is what stops it rendering as words that person typed.
   */
  fromUserId?: string | null;
  relatedLeadId?: string | null;
  relatedProjectId?: string | null;
  urgent?: boolean;
}): Promise<void> {
  let fromUserId = input.fromUserId ?? null;
  if (!fromUserId && input.relatedLeadId) {
    const lead = await prisma.lead
      .findUnique({ where: { id: input.relatedLeadId }, select: { assignedToId: true } })
      .catch(() => null);
    fromUserId = lead?.assignedToId ?? null;
  }
  if (!fromUserId) {
    fromUserId = (await prisma.user.findFirst({ select: { id: true } }))?.id ?? null;
  }
  // No staff account at all is a fresh install, not a failure worth throwing
  // over — the caller is narrating, not transacting.
  if (!fromUserId) return;

  await prisma.teamMessage.create({
    data: {
      content: input.content,
      fromUserId,
      relatedLeadId: input.relatedLeadId ?? null,
      relatedProjectId: input.relatedProjectId ?? null,
      urgent: Boolean(input.urgent),
      kind: 'system',
    },
  });
}

/**
 * Parse an attachments payload from the client into the stored shape,
 * dropping anything malformed.
 *
 * One implementation, shared with the project threads, because this is the
 * function that decides whether a string a browser sent us ends up as an
 * `href` — and `javascript:` has to be refused in every thread, not the one
 * whose route happened to have a filter in it.
 */
export function sanitizeAttachments(raw: unknown): TeamAttachment[] {
  return readAttachments(raw);
}
