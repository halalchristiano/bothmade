import { describe, expect, it } from 'vitest';
import {
  MOCKUP_EXPIRY_WARNING_DAYS,
  MOCKUP_LINK_DAYS,
  mockupDaysLeft,
  mockupExpiryFrom,
  mockupLinkExpired,
  mockupLinkExpiringSoon,
  mockupSignal,
  type LeadMockupDTO,
} from '@/lib/mockups';

/**
 * A link that still works and is about to stop.
 *
 * THE FAILURE. Nothing said anything about expiry until the link was already
 * dead — the signal read "Link expired, re-send to reopen it", which is a
 * useful sentence a week too late. The person who finds out first is the
 * PROSPECT, clicking a link we sent them and getting nothing.
 *
 * And the timing is the worst possible: a mockup reaches thirty days old
 * precisely during a slow, considered deal — the ones still worth having.
 * Re-sending resets the clock and the button already exists. The only thing
 * missing was knowing to press it.
 */

const NOW = new Date('2026-08-20T12:00:00Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

const mockup = (over: Partial<LeadMockupDTO> = {}): LeadMockupDTO => ({
  id: 'm1',
  url: 'https://preview.bothmade.studio/ridgeline',
  fileName: null,
  note: '',
  uploadedAt: inDays(-30),
  uploadedByName: 'Kiana',
  status: 'sent',
  shareToken: 'tok',
  sentAt: inDays(-27),
  firstViewedAt: null,
  lastViewedAt: null,
  viewCount: 0,
  expiresAt: inDays(3),
  expired: false,
  expiringSoon: true,
  expiredViewCount: 0,
  lastExpiredViewAt: null,
  respondedAt: null,
  responseNote: null,
  sendFailedAt: null,
  sendFailedReason: null,
  ...over,
});

describe('when a link is about to stop working', () => {
  it('warns inside the window and not before it', () => {
    expect(mockupLinkExpiringSoon({ expiresAt: inDays(2) }, NOW)).toBe(true);
    expect(mockupLinkExpiringSoon({ expiresAt: inDays(MOCKUP_EXPIRY_WARNING_DAYS - 0.5) }, NOW)).toBe(
      true
    );
    expect(mockupLinkExpiringSoon({ expiresAt: inDays(MOCKUP_EXPIRY_WARNING_DAYS + 1) }, NOW)).toBe(
      false
    );
  });

  /**
   * "About to expire" and "expired" are different problems with different
   * fixes, and a row claiming both would be telling somebody to hurry about
   * something that has already happened.
   */
  it('stops warning once it has actually expired', () => {
    expect(mockupLinkExpiringSoon({ expiresAt: inDays(-1) }, NOW)).toBe(false);
    expect(mockupLinkExpired({ expiresAt: inDays(-1) }, NOW)).toBe(true);
  });

  /** A mockup that was never sent has no clock running on it. */
  it('says nothing about a link with no expiry', () => {
    expect(mockupLinkExpiringSoon({ expiresAt: null }, NOW)).toBe(false);
    expect(mockupDaysLeft({ expiresAt: null }, NOW)).toBeNull();
  });

  it('counts whole days, rounded up, so today never reads as zero', () => {
    expect(mockupDaysLeft({ expiresAt: inDays(2.4) }, NOW)).toBe(3);
    expect(mockupDaysLeft({ expiresAt: inDays(0.2) }, NOW)).toBe(1);
    expect(mockupDaysLeft({ expiresAt: inDays(-1) }, NOW)).toBe(0);
  });

  /** The warning has to fit inside the life of the link it warns about. */
  it('leaves room to act before the link dies', () => {
    expect(MOCKUP_EXPIRY_WARNING_DAYS).toBeLessThan(MOCKUP_LINK_DAYS);
    const expires = mockupExpiryFrom(NOW);
    expect(mockupLinkExpiringSoon({ expiresAt: expires }, NOW)).toBe(false);
  });
});

/**
 * The one line a rep reads before picking up the phone. A deadline belongs on
 * it — but only ever appended, because "opened 4 times" and "dies in 2 days"
 * are both true and only the pair of them is a reason to act today.
 */
describe('what the row says', () => {
  it('adds the deadline to a mockup the client has been reading', () => {
    const line = mockupSignal(
      mockup({ status: 'viewed', viewCount: 4, lastViewedAt: inDays(-1), expiresAt: inDays(2) }),
      NOW
    );

    expect(line).toMatch(/opened 4 times/i);
    expect(line).toMatch(/link dies in 2 days/i);
  });

  it('adds it to one that was sent and never opened', () => {
    const line = mockupSignal(mockup({ expiresAt: inDays(3) }), NOW);

    expect(line).toMatch(/never opened/i);
    expect(line).toMatch(/link dies in 3 days/i);
  });

  it('says tomorrow rather than "in 1 days"', () => {
    expect(mockupSignal(mockup({ expiresAt: inDays(0.5) }), NOW)).toMatch(/dies tomorrow/i);
  });

  it('says nothing about expiry while there is plenty of time', () => {
    expect(mockupSignal(mockup({ expiresAt: inDays(20) }), NOW)).not.toMatch(/dies/i);
  });

  /**
   * A send that never reached anybody outranks a deadline on a link nobody
   * has. Chasing the expiry there would be fixing the wrong thing.
   */
  it('still leads with a failed send', () => {
    const line = mockupSignal(mockup({ sendFailedAt: inDays(-1), expiresAt: inDays(1) }), NOW);

    expect(line).toMatch(/nobody received this/i);
    expect(line).not.toMatch(/dies/i);
  });

  it('still leads with what the client said', () => {
    expect(mockupSignal(mockup({ status: 'approved', expiresAt: inDays(1) }), NOW)).toBe(
      'Approved by the client'
    );
  });
});

/**
 * A client who came back to a dead link.
 *
 * The strongest signal in the pipeline and it used to leave no trace: the page
 * told them to reply to the email, most people will not, and nobody here found
 * out it had happened. Whoever hits a thirty-day-old link is in the slow,
 * considered part of a deal that is still very much alive.
 */
describe('somebody knocking on a dead link', () => {
  it('says so, and says when, instead of just "expired"', () => {
    const line = mockupSignal(
      mockup({
        expired: true,
        expiringSoon: false,
        expiresAt: inDays(-2),
        expiredViewCount: 1,
        lastExpiredViewAt: inDays(-1),
      }),
      NOW
    );

    expect(line).toMatch(/tried to open this/i);
    expect(line).toMatch(/24h ago|1d ago/i);
    expect(line).toMatch(/re-send/i);
  });

  /** Four attempts and one attempt are different amounts of interest. */
  it('counts repeat attempts, because they mean more', () => {
    const line = mockupSignal(
      mockup({
        expired: true,
        expiringSoon: false,
        expiresAt: inDays(-5),
        expiredViewCount: 4,
        lastExpiredViewAt: inDays(-0.02),
      }),
      NOW
    );

    expect(line).toMatch(/4 times/i);
  });

  /**
   * Outranks a failed send. That client has never known there was anything to
   * look at; this one is trying to look right now.
   */
  it('outranks a send that never arrived', () => {
    const line = mockupSignal(
      mockup({
        expired: true,
        expiringSoon: false,
        sendFailedAt: inDays(-3),
        expiredViewCount: 1,
        lastExpiredViewAt: inDays(-0.5),
      }),
      NOW
    );

    expect(line).toMatch(/tried to open this/i);
  });

  /** But not what the client said in words, which is a decision, not a click. */
  it('does not outrank an approval', () => {
    const line = mockupSignal(
      mockup({ status: 'approved', expired: true, expiringSoon: false, expiredViewCount: 2 }),
      NOW
    );

    expect(line).toBe('Approved by the client');
  });

  it('falls back to the plain expiry line when nobody has knocked', () => {
    const line = mockupSignal(
      mockup({ expired: true, expiringSoon: false, expiresAt: inDays(-2) }),
      NOW
    );

    expect(line).toBe('Link expired — re-send to reopen it');
  });
});
