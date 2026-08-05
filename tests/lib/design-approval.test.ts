import { describe, expect, it } from 'vitest';
import {
  approvalSource,
  designApproved,
  daysRemaining,
  hasLapsed,
  reviewNoticeLine,
  startReview,
} from '@/lib/design-approval';

/**
 * Section 4's Review Period decides when Payment 2 falls due, so these are
 * about the case the clause was actually written for: a client who never
 * replies. That is the one the old dropdown inference could not see.
 */

const wed = new Date(2026, 7, 5, 10, 0); // Wednesday
const clock = (over: Partial<ReturnType<typeof base>> = {}) => ({ ...base(), ...over });
const base = () => ({
  presentedAt: wed,
  endsAt: startReview(wed).endsAt,
  approvedAt: null as Date | null,
  deemed: false,
});

describe('starting the clock', () => {
  it('ends five business days later, not five calendar days', () => {
    const { endsAt } = startReview(wed);

    expect(endsAt.getDay()).toBe(3); // the following Wednesday
    expect(endsAt.getDate()).toBe(12);
  });

  /**
   * Stored rather than derived on read: the client is told this date, and a
   * later change to how business days are counted must not move a deadline
   * somebody already has in writing.
   */
  it('tells the client the date, in the notice', () => {
    const { endsAt } = startReview(wed);

    expect(reviewNoticeLine(endsAt)).toMatch(/Wednesday, August 12/);
    expect(reviewNoticeLine(endsAt)).toMatch(/take that as approval/);
    expect(reviewNoticeLine(endsAt)).toMatch(/Section 4/);
  });
});

describe('lapsing into deemed approval', () => {
  it('does not lapse while the period is still running', () => {
    expect(hasLapsed(clock(), new Date(2026, 7, 10))).toBe(false);
  });

  it('lapses once the period is up', () => {
    expect(hasLapsed(clock(), new Date(2026, 7, 12, 10, 0))).toBe(true);
  });

  /**
   * "They said yes" and "they said nothing for a week" are different facts,
   * and only one of them is worth anything if it is ever disputed.
   */
  it('never overwrites an approval the client actually gave', () => {
    const answered = clock({ approvedAt: new Date(2026, 7, 6) });

    expect(hasLapsed(answered, new Date(2027, 0, 1))).toBe(false);
    expect(approvalSource(answered)).toBe('client');
  });

  it('does not run at all when no design has been presented', () => {
    expect(hasLapsed({ presentedAt: null, endsAt: null, approvedAt: null, deemed: false }, new Date())).toBe(false);
  });

  it('says which kind of approval it was', () => {
    expect(approvalSource(clock({ approvedAt: wed, deemed: true }))).toBe('deemed');
    expect(approvalSource(clock({ approvedAt: wed }))).toBe('client');
    expect(approvalSource(clock())).toBe('none');
  });
});

describe('the payment gate', () => {
  it('opens on a recorded approval', () => {
    expect(designApproved({ designApprovedAt: wed, statusStage: 1 })).toBe(true);
  });

  /**
   * Every project that existed before this clock did has no presentedAt. The
   * old inference is still the best evidence available for those, so they
   * degrade to what they had rather than to nothing.
   */
  it('falls back to the old stage inference for projects that predate the clock', () => {
    expect(designApproved({ designApprovedAt: null, statusStage: 2 })).toBe(true);
    expect(designApproved({ designApprovedAt: null, statusStage: 1 })).toBe(false);
  });
});

describe('how long they have left', () => {
  it('counts down', () => {
    expect(daysRemaining(clock(), new Date(2026, 7, 10, 10, 0))).toBe(2);
  });

  it('floors at zero rather than going negative', () => {
    expect(daysRemaining(clock(), new Date(2026, 7, 20))).toBe(0);
  });

  it('is null once answered, and null when no clock runs', () => {
    expect(daysRemaining(clock({ approvedAt: wed }), new Date())).toBeNull();
    expect(daysRemaining({ presentedAt: null, endsAt: null, approvedAt: null, deemed: false }, new Date())).toBeNull();
  });
});
