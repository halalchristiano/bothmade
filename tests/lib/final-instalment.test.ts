import { describe, expect, it } from 'vitest';
import { finalInstalment } from '@/lib/instalments';
import { launchReadiness, LAUNCH_CHECKS } from '@/lib/launch';

/**
 * Which row is "the final payment", and why it may not be the last one in the
 * array you were handed.
 *
 * The launch board selected a project's instalments with no ORDER BY and then
 * took `rows[rows.length - 1]`. Postgres makes no promise about the order of
 * an unordered select, and it is specifically an UPDATE that breaks it: the
 * row is rewritten and moves. So the ordinary lifecycle of a project — mark
 * Payment 1 paid at signing, mark Payment 2 paid after design approval —
 * can leave the rows arriving as [3, 1, 2].
 *
 * Read positionally, "the final instalment" is then Payment 2, which is paid,
 * and Section 7's gate reads as cleared while Payment 3 is still outstanding.
 * The board drew a full readiness ring and "Clear to go live" on a project the
 * contract forbids launching — and the project's own deployment page, backed
 * by an API that does order its rows, said the opposite.
 *
 * The helper picks by index, so no caller can reintroduce it by forgetting an
 * ORDER BY.
 */

const P = (index: number, status: string) => ({ index, status, label: `Payment ${index} of 3` });

describe('finalInstalment', () => {
  it('picks the highest index, not the last element', () => {
    // The exact order the heap hands back after 1 and 2 were marked paid.
    const shuffled = [P(3, 'due'), P(1, 'paid'), P(2, 'paid')];

    expect(finalInstalment(shuffled)?.index).toBe(3);
  });

  it('agrees with itself whatever order the rows arrive in', () => {
    const rows = [P(1, 'paid'), P(2, 'paid'), P(3, 'due')];
    const orders = [
      rows,
      [...rows].reverse(),
      [rows[2], rows[0], rows[1]],
      [rows[1], rows[2], rows[0]],
    ];

    const picked = orders.map((o) => finalInstalment(o)?.index);
    expect(picked).toEqual([3, 3, 3, 3]);
  });

  it('ignores void rows, which are not owed', () => {
    // A change order that reduces scope voids the instalments it removes; the
    // launch cannot be gated on money nobody will ever owe.
    expect(finalInstalment([P(1, 'paid'), P(2, 'paid'), P(3, 'void')])?.index).toBe(2);
  });

  it('has no answer for a project with no schedule', () => {
    expect(finalInstalment([])).toBeNull();
    expect(finalInstalment([P(1, 'void')])).toBeNull();
  });

  it('does not care that indexes start at 1 or run contiguously', () => {
    expect(finalInstalment([P(2, 'paid'), P(7, 'due')])?.index).toBe(7);
  });
});

/**
 * The consequence, stated where it actually bit: readiness.
 */
describe('Section 7’s gate, read off an unordered schedule', () => {
  const allDone = Object.fromEntries(LAUNCH_CHECKS.map((c) => [c.key, { done: true }]));
  const domainName = 'havis.co.uk';

  it('still blocks the launch when the rows come back out of order', () => {
    const shuffled = [P(3, 'due'), P(1, 'paid'), P(2, 'paid')];
    const finalRow = finalInstalment(shuffled);

    const verdict = launchReadiness(allDone, {
      finalInstalmentPaid: finalRow ? finalRow.status === 'paid' : true,
      hasSchedule: true,
      domainName,
    });

    // Read positionally this said "clear to go live" on an unpaid project.
    expect(verdict.ready).toBe(false);
    expect(verdict.blockers.map((b) => b.key)).toContain('payment-3');
    expect(verdict.percent).toBeLessThan(100);
  });

  it('clears once the actual final payment lands, in any order', () => {
    const shuffled = [P(3, 'paid'), P(1, 'paid'), P(2, 'paid')];
    const finalRow = finalInstalment(shuffled);

    const verdict = launchReadiness(allDone, {
      finalInstalmentPaid: finalRow ? finalRow.status === 'paid' : true,
      hasSchedule: true,
      domainName,
    });

    expect(verdict.ready).toBe(true);
  });
});
