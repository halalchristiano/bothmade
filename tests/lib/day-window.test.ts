import { describe, expect, it } from 'vitest';
import { localDayStartParam, resolveDayStart } from '@/lib/day-window';

/**
 * When "today" starts, for the person looking at the screen.
 *
 * THE BUG. Every "today" count was `new Date(); setHours(0,0,0,0)` on a
 * server running in UTC. For anyone working US hours that boundary lands
 * mid-evening: at 8pm Eastern the UTC date has already rolled over, so an
 * afternoon of calls counts as yesterday and the dashboard says "1 call
 * logged today" to somebody who made twelve.
 *
 * That is worse than having no count at all. It is the kind of wrong that
 * looks exactly like the app losing your work, which is the one thing a work
 * log cannot afford to look like.
 */

const AT = (iso: string) => new Date(iso);

describe('the day the browser says it is', () => {
  /**
   * The exact case from the report: 8:24pm Eastern, which is 00:24 UTC the
   * next day. The server's own midnight is 24 minutes ago and would count
   * almost nothing; the browser's is 20 hours ago and counts the day's work.
   */
  it('takes a boundary the server would never have chosen', () => {
    const nowUtc = AT('2026-08-08T00:24:00Z');
    const easternMidnight = '2026-08-07T04:00:00Z';

    const start = resolveDayStart(easternMidnight, nowUtc);

    expect(start.toISOString()).toBe('2026-08-07T04:00:00.000Z');
    expect(nowUtc.getTime() - start.getTime()).toBeGreaterThan(20 * 60 * 60 * 1000);
  });

  it('works the other way for a browser ahead of the server', () => {
    const nowUtc = AT('2026-08-07T23:30:00Z');
    // Tokyo, where it is already the 8th.
    const start = resolveDayStart('2026-08-07T15:00:00Z', nowUtc);

    expect(start.toISOString()).toBe('2026-08-07T15:00:00.000Z');
  });
});

describe('when it will not take the browser at its word', () => {
  const NOW = AT('2026-08-07T12:00:00Z');
  const serverMidnight = (() => {
    const d = new Date(NOW);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();

  /**
   * A day start in the future empties every count on the page — the most
   * alarming possible failure for a work log, and one a broken device clock
   * produces on its own without anybody being malicious.
   */
  it('refuses a boundary in the future', () => {
    expect(resolveDayStart('2026-08-09T00:00:00Z', NOW).toISOString()).toBe(serverMidnight);
  });

  /** And one far enough back to sweep in a fortnight of work as "today". */
  it('refuses a boundary from days ago', () => {
    expect(resolveDayStart('2026-07-20T00:00:00Z', NOW).toISOString()).toBe(serverMidnight);
  });

  /**
   * Both real extremes are in the PAST, which is the point.
   *
   * Midnight local is the same instant everywhere and has always already
   * happened, whatever the offset — Honolulu at UTC-10 and Kiribati at UTC+14
   * both land a couple of hours back at this moment, and a rep an hour before
   * their own midnight lands nearly a full day back. A limit that rejected
   * either of those would recreate the bug for whoever lives there.
   */
  it('accepts the genuine extremes, all of which are behind now', () => {
    for (const claimed of ['2026-08-07T10:00:00Z', '2026-08-06T13:00:00Z']) {
      expect(resolveDayStart(claimed, NOW).toISOString()).toBe(
        new Date(claimed).toISOString()
      );
    }
  });

  /**
   * A dashboard that refuses to load over a malformed timestamp is a worse
   * failure than one showing a day boundary an hour out.
   */
  it('falls back rather than throwing on nonsense', () => {
    for (const junk of [null, undefined, '', 'yesterday please', '2026-13-45T99:99:99Z']) {
      expect(resolveDayStart(junk, NOW).toISOString()).toBe(serverMidnight);
    }
  });
});

/**
 * The two halves of the contract live in one file precisely so they cannot
 * drift: a client computing something different from what the server expects
 * is the same bug again in a new costume.
 */
describe('what the browser sends', () => {
  it('round-trips through the parser unchanged', () => {
    const now = AT('2026-08-07T18:00:00Z');
    const sent = localDayStartParam(now);

    expect(resolveDayStart(sent, now).toISOString()).toBe(sent);
  });

  it('is the local midnight before now, never after it', () => {
    const now = new Date();
    expect(new Date(localDayStartParam(now)).getTime()).toBeLessThanOrEqual(now.getTime());
  });
});
