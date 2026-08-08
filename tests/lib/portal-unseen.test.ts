import { describe, expect, it } from 'vitest';
import {
  hasUnseenActivity,
  projectHasUnseenActivity,
  readLastVisit,
  readSeenMessageCount,
  lastVisitKey,
  seenMessagesKey,
  type UnseenInput,
} from '@/lib/portal-unseen';

/**
 * The green "new activity" dot in the client portal, and the reason it used to
 * never go out.
 *
 * `bothmade_seen_messages_<id>` was written from exactly one place — the
 * Messages tab of the project page — and read in two others as
 * `Number(localStorage.getItem(key) || 0)`. That `|| 0` collapsed "this device
 * has no baseline" into "this device has seen zero messages", so the check was
 * really
 *
 *     project._count.messages > 0
 *
 * and any project with a single message in its history lit the dot for good.
 * Opening the project did not clear it. Only clicking into Messages did.
 *
 * The tests below are written against the two facts that made it a bug rather
 * than a rough edge: it fires with nothing new, and reading doesn't stop it.
 */

const store = (entries: Record<string, string>) => ({
  getItem: (k: string) => (k in entries ? entries[k] : null),
});

const project = (over: Partial<UnseenInput> = {}): UnseenInput => ({
  id: 'p1',
  updates: [],
  _count: { messages: 0 },
  ...over,
});

const DAY = 86_400_000;
const NOW = new Date('2026-08-08T12:00:00Z').getTime();

describe('a device that has never opened the project', () => {
  /**
   * The regression. Five messages of history, nothing new, no baseline — and
   * the old reader said "new activity" because 5 > 0.
   *
   * This is a client on a new phone, in a private window, or after clearing
   * site data. Every project they have lights up at once, which is exactly the
   * shape of an indicator nobody believes any more.
   */
  it('claims nothing is new, however much history the project has', () => {
    const seen = projectHasUnseenActivity(project({ _count: { messages: 5 } }), store({}));

    expect(seen).toBe(false);
  });

  /**
   * The update half already worked this way, guarded by `lastVisit > 0`. The
   * point of the fix is that both halves now agree — so this pins the sibling
   * behaviour too, since a later edit that removed the guard would be the same
   * bug in the other half.
   */
  it('says the same about updates, which is where the rule came from', () => {
    const seen = projectHasUnseenActivity(
      project({ updates: [{ createdAt: new Date(NOW).toISOString() }] }),
      store({})
    );

    expect(seen).toBe(false);
  });
});

describe('once the device has a baseline', () => {
  it('is quiet when nothing has arrived since', () => {
    const seen = projectHasUnseenActivity(
      project({ _count: { messages: 5 } }),
      store({ [seenMessagesKey('p1')]: '5' })
    );

    expect(seen).toBe(false);
  });

  /** And still does the job it exists for. */
  it('fires on a message that arrived after the baseline', () => {
    const seen = projectHasUnseenActivity(
      project({ _count: { messages: 6 } }),
      store({ [seenMessagesKey('p1')]: '5' })
    );

    expect(seen).toBe(true);
  });

  it('fires on an update posted since the last visit', () => {
    const seen = projectHasUnseenActivity(
      project({ updates: [{ createdAt: new Date(NOW).toISOString() }] }),
      store({ [lastVisitKey('p1')]: String(NOW - DAY) })
    );

    expect(seen).toBe(true);
  });

  it('ignores an update the client was already here for', () => {
    const seen = projectHasUnseenActivity(
      project({ updates: [{ createdAt: new Date(NOW - DAY).toISOString() }] }),
      store({ [lastVisitKey('p1')]: String(NOW) })
    );

    expect(seen).toBe(false);
  });

  /**
   * A baseline of 0 is a real answer — a project whose conversation genuinely
   * hasn't started — and must not be confused with an absent one. This is the
   * distinction the whole fix rests on, so it gets its own test: if
   * `readSeenMessageCount` ever goes back to returning 0 for a missing key,
   * the first test in this file passes for the wrong reason.
   */
  it('tells a stored zero apart from no baseline at all', () => {
    const first = projectHasUnseenActivity(
      project({ _count: { messages: 1 } }),
      store({ [seenMessagesKey('p1')]: '0' })
    );

    expect(first).toBe(true);
    expect(readSeenMessageCount('0')).toBe(0);
    expect(readSeenMessageCount(null)).toBeNull();
  });
});

describe('reading what is actually in localStorage', () => {
  /**
   * Everything here is a string somebody's browser handed back, so none of it
   * is trustworthy. Unparseable is treated as "no baseline" rather than
   * coerced: `Number('')` is 0 and `Number('what')` is NaN, and a NaN baseline
   * makes every comparison false, which silently disables the indicator
   * instead of resetting it.
   */
  it('treats empty and unparseable values as no baseline', () => {
    expect(readSeenMessageCount('')).toBeNull();
    expect(readSeenMessageCount('   ')).toBeNull();
    expect(readSeenMessageCount('what')).toBeNull();
    expect(readSeenMessageCount('-1')).toBeNull();
    expect(readSeenMessageCount('2.5')).toBeNull();
  });

  it('reads a real count', () => {
    expect(readSeenMessageCount('12')).toBe(12);
  });

  it('treats a missing or nonsense visit stamp as never visited', () => {
    expect(readLastVisit(null)).toBe(0);
    expect(readLastVisit('0')).toBe(0);
    expect(readLastVisit('what')).toBe(0);
    expect(readLastVisit(String(NOW))).toBe(NOW);
  });
});

describe('the rule itself', () => {
  /**
   * Stated directly, without storage in the way: neither half may fire
   * without a reference point. This is the assertion that kills the mutation
   * — dropping `seenMessageCount !== null` puts the original bug straight
   * back, and it is the one line in the module worth guarding.
   */
  it('will not report unread messages with no baseline to compare against', () => {
    expect(
      hasUnseenActivity({
        lastVisitAt: 0,
        latestUpdateAt: 0,
        messageCount: 99,
        seenMessageCount: null,
      })
    ).toBe(false);
  });

  it('will not report a new update with no visit to compare against', () => {
    expect(
      hasUnseenActivity({
        lastVisitAt: 0,
        latestUpdateAt: NOW,
        messageCount: 0,
        seenMessageCount: 0,
      })
    ).toBe(false);
  });

  /** Either half alone is enough — they are an `or`, not an `and`. */
  it('fires on either half on its own', () => {
    const base = { lastVisitAt: NOW - DAY, latestUpdateAt: 0, messageCount: 0, seenMessageCount: 0 };

    expect(hasUnseenActivity({ ...base, messageCount: 1 })).toBe(true);
    expect(hasUnseenActivity({ ...base, latestUpdateAt: NOW })).toBe(true);
    expect(hasUnseenActivity(base)).toBe(false);
  });
});
