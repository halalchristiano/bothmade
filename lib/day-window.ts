/**
 * When "today" starts, for the person looking at the screen.
 *
 * THE BUG THIS EXISTS FOR. Every "today" count in the admin was computed with
 * `new Date(); setHours(0, 0, 0, 0)` on the server — and the server runs in
 * UTC. For a rep working US hours that boundary lands mid-evening: at 8pm
 * Eastern the UTC date has already rolled over, so an afternoon of calls
 * counts as yesterday and the dashboard says "1 call logged today" to
 * somebody who made twelve. The number was not lying about the data; it was
 * answering a different question from the one on screen.
 *
 * A count with the wrong day boundary is worse than no count. It is the kind
 * of wrong that looks exactly like the app losing your work, which is the one
 * thing a work log cannot afford to look like.
 *
 * So the browser says where its day starts and the server takes it, within
 * sane bounds. The alternative — storing a timezone per user — is a second
 * source of truth that goes stale the moment somebody travels.
 */

/**
 * How far from the server's own clock a claimed day start may be.
 *
 * Real offsets run to ±14 hours; a day start is up to 24 hours behind the
 * current moment. 36 hours covers every genuine case with room to spare and
 * still refuses a value from a broken clock or a crafted request, either of
 * which would silently widen or empty every count on the page.
 */
const MAX_SKEW_MS = 36 * 60 * 60 * 1000;

/**
 * And how far into the future, which is a different number entirely.
 *
 * Midnight local is the same instant everywhere and is always already past,
 * whatever the offset — so a day start ahead of now is never a timezone, only
 * a clock a few seconds out or a value somebody made up. Allowing a
 * timezone's worth of it would let a request empty every count on the page,
 * which is the most alarming way a work log can fail.
 */
const MAX_FUTURE_MS = 5 * 60 * 1000;

/**
 * The start of the caller's local day, or the server's if it did not say.
 *
 * `raw` is whatever arrived on the query string — anything unparseable or
 * implausible falls back rather than throwing, because a dashboard that
 * refuses to load over a malformed timestamp is a worse failure than one
 * showing a day boundary an hour out.
 */
export function resolveDayStart(raw: string | null | undefined, now: Date = new Date()): Date {
  if (raw) {
    const claimed = new Date(raw);
    if (!Number.isNaN(claimed.getTime())) {
      const behindNow = now.getTime() - claimed.getTime();
      // Never meaningfully in the future, never more than a day and a half back.
      if (behindNow >= -MAX_FUTURE_MS && behindNow <= MAX_SKEW_MS) return claimed;
    }
  }

  const fallback = new Date(now);
  fallback.setHours(0, 0, 0, 0);
  return fallback;
}

/**
 * What the browser should send. Kept here beside the parser so the two halves
 * of the contract cannot drift — a client computing a different thing from
 * what the server expects is precisely the failure above, in a new costume.
 */
export function localDayStartParam(now: Date = new Date()): string {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}
