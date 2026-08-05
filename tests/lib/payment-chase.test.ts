import { describe, expect, it } from 'vitest';
import { chaseState, daysBetween, nextChaseDay, unbilledUrgency } from '@/lib/payment-chase';

/**
 * The schedule is: nothing at all until the due date, then the escalation
 * every accounting package converges on. So what is pinned here is mostly
 * restraint — nothing sent while a client is still within the terms the
 * contract gave them — plus the two things that make an automated chase
 * survivable: never twice in a day, and never the same words twice.
 */

const invoicedAt = new Date(2026, 7, 5, 9, 0);
const dueAt = new Date(2026, 7, 19, 9, 0); // 14 days, per Section 7
const at = (day: number, hour = 10) => new Date(2026, 7, day, hour, 0);

const state = (now: Date, over: Partial<Parameters<typeof chaseState>[0]> = {}) =>
  chaseState({
    invoicedAt,
    dueAt,
    lastChasedAt: null,
    chaseCount: 0,
    now,
    label: 'Payment 2 of 3',
    amountLabel: '$6,000',
    ...over,
  });

describe('silence while they are still within terms', () => {
  /**
   * The contract gives a client fourteen days. A supplier who starts
   * reminding on day two has not given them fourteen days, whatever the
   * paperwork says.
   */
  it('sends nothing at all before the due date', () => {
    for (const day of [5, 6, 8, 12, 16, 18]) {
      expect(state(at(day)).shouldChase).toBe(false);
    }
  });

  it('knows they are not late yet', () => {
    expect(state(at(10)).phase).toBe('within-terms');
    expect(state(at(10)).needsCall).toBe(false);
  });
});

describe('the schedule', () => {
  it('makes first contact on the day it falls due', () => {
    expect(state(at(19)).shouldChase).toBe(true);
    expect(state(at(19)).phase).toBe('due');
  });

  it('follows the standard escalation, then goes weekly forever', () => {
    expect(nextChaseDay(0)).toBe(14);
    expect(nextChaseDay(1)).toBe(17);
    expect(nextChaseDay(2)).toBe(21);
    expect(nextChaseDay(3)).toBe(28);
    expect(nextChaseDay(4)).toBe(35);
    expect(nextChaseDay(10)).toBe(77);
  });

  it('keeps going indefinitely — until paid is until paid', () => {
    expect(state(new Date(2027, 0, 1), { chaseCount: 20 }).shouldChase).toBe(true);
  });

  /**
   * Driven by the count rather than by "is today in the list", so a cron that
   * misses a day — a deploy, an outage — catches up rather than skipping that
   * chase silently forever.
   */
  it('catches up after a missed run instead of skipping the chase', () => {
    // Day 14 was missed entirely; the first chase still goes on day 16.
    expect(state(at(21), { chaseCount: 0 }).shouldChase).toBe(true);
  });

  /** A cron that fires twice must not send two emails. */
  it('never chases twice in one day', () => {
    expect(state(at(19, 18), { lastChasedAt: at(19, 9) }).shouldChase).toBe(false);
  });
});

describe('what it says, and when', () => {
  it('is matter-of-fact on the day', () => {
    const s = state(at(19));

    expect(s.subject).toMatch(/due today/);
    expect(s.line).toMatch(/live right now/);
  });

  /**
   * Most late B2B payments are administrative rather than a refusal, so the
   * first late email asks what is in the way rather than pushing harder.
   */
  it('asks what is holding it up once they are late', () => {
    const s = state(at(22), { chaseCount: 1 });

    expect(s.phase).toBe('late');
    expect(s.line).toMatch(/due 3 days ago/);
    expect(s.line).toMatch(/PO number/);
  });

  /** Section 7's consequences, stated plainly, and only once they apply. */
  it('states the contract\'s consequences once they genuinely apply', () => {
    const s = state(at(26), { chaseCount: 2 });

    expect(s.phase).toBe('seriously-late');
    expect(s.line).toMatch(/pause work/);
    expect(s.line).toMatch(/statutory interest/);
  });

  it('does not repeat a subject line through the weekly tail', () => {
    const fifth = state(at(33), { chaseCount: 3 }).subject;
    const sixth = state(at(40), { chaseCount: 4 }).subject;

    expect(fifth).not.toBe(sixth);
  });
});

describe('getting a person to the phone', () => {
  /**
   * The highest-value signal here. Four minutes on the phone beats twenty
   * emails, and the schedule's real job is producing this moment.
   */
  it('calls for a phone call at a week past due, not before', () => {
    expect(state(at(25)).needsCall).toBe(false);
    expect(state(at(26)).needsCall).toBe(true);
  });

  it('escalates beyond email once the reminders are clearly not working', () => {
    expect(state(at(30)).needsHuman).toBe(false);
    expect(state(new Date(2026, 8, 5)).needsHuman).toBe(true);
  });

  it('keeps chasing even after escalating', () => {
    // Day 31, with four chases gone (14, 17, 21, 28) — the fifth is due.
    const s = state(new Date(2026, 8, 5), { chaseCount: 3 });

    expect(s.needsHuman).toBe(true);
    expect(s.shouldChase).toBe(true);
  });
});

describe('a missing due date', () => {
  it('falls back to the contract\'s fourteen days', () => {
    const s = state(at(20), { dueAt: null });

    expect(s.phase).toBe('late');
    expect(s.daysPastDue).toBe(1);
  });
});

describe('nagging ourselves about money nobody invoiced', () => {
  it('gets louder with age', () => {
    expect(unbilledUrgency(0)).toBe('quiet');
    expect(unbilledUrgency(3)).toBe('nudge');
    expect(unbilledUrgency(14)).toBe('loud');
  });
});

describe('day counting', () => {
  it('floors, so a chase at 9am on day 3 is day 3', () => {
    expect(daysBetween(invoicedAt, at(8, 8))).toBe(2);
    expect(daysBetween(invoicedAt, at(8, 10))).toBe(3);
  });
});
