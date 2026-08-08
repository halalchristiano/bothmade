import { describe, expect, it } from 'vitest';
import { MAX_NUDGES, shouldNudge } from '@/lib/enquiry-nudge';

/**
 * How often a prospect who has not replied gets written to.
 *
 * The sequence was paced entirely by how many messages had gone: send number
 * four went out whenever the route next ran. That is once a day for exactly
 * as long as nothing runs the route twice — and the route loops up to 200
 * leads, emailing each, under `maxDuration = 60`. A timeout and a retry, or
 * one manual run, and every lead the first pass reached gets the next message
 * in the sequence minutes later.
 *
 * lib/payment-chase.ts already enforces one send per day for the other
 * automated sequence. This is the same rule for the other half of it.
 */

const LEAD = {
  email: 'dana@northgate.test',
  doNotContact: false,
  status: 'new',
  replyReceivedAt: null,
  emailDeliveryFailedAt: null,
};

/*
 * Both ends of every comparison come off one instant. Sampling `now` twice —
 * once for the fixture and once for the assertion — puts a few microseconds
 * between them, which is invisible everywhere except exactly on the boundary,
 * where it turns "twenty hours" into "twenty hours minus a hair" and the test
 * fails for a reason that has nothing to do with the rule.
 */
const NOW = new Date('2026-08-08T15:00:00.000Z');
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 60 * 60 * 1000);

describe('a second run on the same day', () => {
  it('does not advance the sequence twice', () => {
    expect(shouldNudge(LEAD, 1, at(0.5), NOW)).toBe(false);
  });

  it('is refused even minutes after the first', () => {
    expect(shouldNudge(LEAD, 3, at(0.05), NOW)).toBe(false);
  });

  /*
   * Measured in hours, not calendar days: 23:50 and 00:10 are two calendar
   * days and twenty minutes apart, which is the thing being prevented.
   */
  it('is refused across midnight when only twenty minutes have passed', () => {
    const justBeforeMidnight = new Date('2026-08-08T23:50:00.000Z');
    const justAfter = new Date('2026-08-09T00:10:00.000Z');

    expect(shouldNudge(LEAD, 1, justBeforeMidnight, justAfter)).toBe(false);
  });
});

describe('the next day', () => {
  it('sends, on a cron that has drifted slightly earlier', () => {
    expect(shouldNudge(LEAD, 1, at(23), NOW)).toBe(true);
  });

  it('sends at twenty hours, so a drifting schedule never skips a day', () => {
    expect(shouldNudge(LEAD, 1, at(20), NOW)).toBe(true);
  });

  it('does not send at nineteen', () => {
    expect(shouldNudge(LEAD, 1, at(19), NOW)).toBe(false);
  });
});

describe('the very first message', () => {
  it('goes without a previous one to wait for', () => {
    expect(shouldNudge(LEAD, 0, null, NOW)).toBe(true);
  });

  it('still goes for a caller that cannot see the history', () => {
    expect(shouldNudge(LEAD, 0)).toBe(true);
  });
});

describe('the reasons that were already there', () => {
  it.each([
    ['they replied', { replyReceivedAt: NOW }],
    ['they asked not to be contacted', { doNotContact: true }],
    ['the address bounced', { emailDeliveryFailedAt: NOW }],
    ['the deal moved on', { status: 'won' }],
    ['there is no address', { email: null }],
  ])('still stops when %s, however long it has been', (_why, over) => {
    expect(shouldNudge({ ...LEAD, ...over }, 1, at(72), NOW)).toBe(false);
  });

  it('stops at the end of the sequence', () => {
    expect(shouldNudge(LEAD, MAX_NUDGES, at(72), NOW)).toBe(false);
  });
});
