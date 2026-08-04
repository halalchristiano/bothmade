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

export interface TeamAttachment {
  name: string;
  url: string;
}

/**
 * Unread = not sent by me, addressed to me or broadcast, arrived since I
 * last opened the chat. Keying off the per-user teamChatReadAt rather than
 * the shared TeamMessage.readAt is the point: readAt is one column on the
 * message, so the first person to open a broadcast would mark it read for
 * everybody.
 */
export function unreadWhere(userId: string, readAt: Date | null): Prisma.TeamMessageWhereInput {
  return {
    fromUserId: { not: userId },
    OR: [{ toUserId: userId }, { toUserId: null }],
    ...(readAt ? { createdAt: { gt: readAt } } : {}),
  };
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
  fromUserId: string;
  relatedLeadId?: string | null;
  relatedProjectId?: string | null;
  urgent?: boolean;
}): Promise<void> {
  await prisma.teamMessage.create({
    data: {
      content: input.content,
      fromUserId: input.fromUserId,
      relatedLeadId: input.relatedLeadId ?? null,
      relatedProjectId: input.relatedProjectId ?? null,
      urgent: Boolean(input.urgent),
      kind: 'system',
    },
  });
}

/** Parse an attachments payload from the client into the stored shape, dropping anything malformed. */
export function sanitizeAttachments(raw: unknown): TeamAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (a): a is { name: unknown; url: unknown } =>
        typeof a === 'object' && a !== null && 'name' in a && 'url' in a
    )
    .map((a) => ({ name: String(a.name).slice(0, 200), url: String(a.url) }))
    .filter((a) => a.name.length > 0 && /^https?:\/\//.test(a.url))
    .slice(0, 10);
}
