/**
 * "Is there anything new on this project?" — the green dot in the client
 * portal, in one place instead of three.
 *
 * The rule is per-device by design: it reads localStorage, not the database.
 * Nobody wants "mark as read" to be a thing they administer, and a client who
 * opens the portal on their laptop and again on their phone is one person
 * looking twice, not two people.
 *
 * ## The bug this was extracted to fix
 *
 * The two halves of the signal were not written the same way, and only one of
 * them said so.
 *
 * `bothmade_last_visit_<id>` is stamped every time the project page opens, and
 * the reader guards it with `lastVisit > 0` — so a device that has never seen
 * a project reports nothing new, rather than announcing the project's whole
 * history as unread. That is a deliberate choice and the right one.
 *
 * `bothmade_seen_messages_<id>` was only ever written from **inside the
 * Messages tab**, and read as `Number(... || 0)`. An absent key and a genuine
 * zero were the same number, so the comparison read
 *
 *     project._count.messages > 0
 *
 * for every device that had not opened that one tab. Any project with a single
 * message in its history lit the dot, on the Projects nav link and on the
 * project card, and **opening the project did not clear it** — only clicking
 * into Messages did. A client on a new phone, in a private window, or after
 * clearing site data saw every project permanently flagged.
 *
 * An indicator that is always on is worse than no indicator, because it trains
 * the person to stop looking at it — and the one week there really is a new
 * message waiting, they don't.
 *
 * The fix is to make the message baseline behave like the visit stamp: absent
 * means "no baseline yet", not "zero seen", and the project page establishes
 * one the first time it loads on a device. After that, the comparison means
 * what it always claimed to — messages that arrived since you last looked.
 */

export const lastVisitKey = (projectId: string) => `bothmade_last_visit_${projectId}`;
export const seenMessagesKey = (projectId: string) => `bothmade_seen_messages_${projectId}`;

/** The subset of a project the signal needs, in the shape both pages already fetch. */
export type UnseenInput = {
  id: string;
  updates: Array<{ createdAt: string }>;
  _count: { messages: number };
};

/** Just enough of the Storage interface to be handed a fake in a test. */
export type ReadableStorage = Pick<Storage, 'getItem'>;

/**
 * The stored message baseline, or `null` when this device has never had one.
 *
 * The distinction is the whole point: `null` is "I have no idea what you've
 * read", which must not be reported as unread, and is a different fact from a
 * baseline of 0 on a project whose conversation genuinely hasn't started.
 *
 * Anything unparseable is treated as absent rather than coerced. `Number('')`
 * is 0 and `Number('what')` is NaN, and neither is a count somebody saw.
 */
export function readSeenMessageCount(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Milliseconds of the last visit stamp, or 0 when there isn't one. */
export function readLastVisit(raw: string | null): number {
  if (raw === null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export type UnseenSignals = {
  /** 0 when this device has never opened the project. */
  lastVisitAt: number;
  /** 0 when the project has no updates. */
  latestUpdateAt: number;
  /** What the server currently holds. */
  messageCount: number;
  /** `null` when this device has no baseline — see `readSeenMessageCount`. */
  seenMessageCount: number | null;
};

/**
 * Whether to show the dot.
 *
 * Both halves refuse to fire without a reference point, which is the property
 * the message half was missing.
 */
export function hasUnseenActivity(signals: UnseenSignals): boolean {
  const hasNewUpdate = signals.lastVisitAt > 0 && signals.latestUpdateAt > signals.lastVisitAt;

  const hasNewMessage =
    signals.seenMessageCount !== null && signals.messageCount > signals.seenMessageCount;

  return hasNewUpdate || hasNewMessage;
}

/** Read the signals for one project out of a storage. */
export function readUnseenSignals(
  project: UnseenInput,
  storage: ReadableStorage = localStorage
): UnseenSignals {
  return {
    lastVisitAt: readLastVisit(storage.getItem(lastVisitKey(project.id))),
    latestUpdateAt: project.updates[0] ? new Date(project.updates[0].createdAt).getTime() : 0,
    messageCount: project._count.messages,
    seenMessageCount: readSeenMessageCount(storage.getItem(seenMessagesKey(project.id))),
  };
}

/** The question both the header and the project list actually ask. */
export function projectHasUnseenActivity(
  project: UnseenInput,
  storage: ReadableStorage = localStorage
): boolean {
  return hasUnseenActivity(readUnseenSignals(project, storage));
}
