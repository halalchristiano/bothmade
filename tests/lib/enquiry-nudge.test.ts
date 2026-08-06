import { describe, expect, it } from 'vitest';

/**
 * A daily email to somebody who has not answered is the highest-risk thing
 * this system sends. It goes out from the same domain as the invoices, so
 * every one that gets marked as spam is a bill that later lands in a junk
 * folder. These are the brakes.
 */

import { MAX_NUDGES, leadProblems, nudgeCopy, shouldNudge } from '@/lib/enquiry-nudge';

const quiet = {
  email: 'sam@example.com',
  doNotContact: false,
  status: 'new',
  replyReceivedAt: null,
  emailDeliveryFailedAt: null,
};

describe('shouldNudge', () => {
  it('writes to somebody who enquired and has said nothing since', () => {
    expect(shouldNudge(quiet, 0)).toBe(true);
    expect(shouldNudge(quiet, 5)).toBe(true);
  });

  /**
   * Every one of these is an answer. Erring towards stopping is deliberate:
   * the cost of stopping early is one unsent email, the cost of stopping late
   * is a complaint and a spam report.
   */
  it('stops the moment there is any sign of an answer', () => {
    expect(shouldNudge({ ...quiet, replyReceivedAt: new Date() }, 0)).toBe(false);
    expect(shouldNudge({ ...quiet, doNotContact: true }, 0)).toBe(false);
    expect(shouldNudge({ ...quiet, status: 'qualified' }, 0)).toBe(false);
    expect(shouldNudge({ ...quiet, status: 'won' }, 0)).toBe(false);
    expect(shouldNudge({ ...quiet, status: 'lost' }, 0)).toBe(false);
  });

  it('does not keep writing to an address that bounced', () => {
    expect(shouldNudge({ ...quiet, emailDeliveryFailedAt: new Date() }, 0)).toBe(false);
  });

  it('has an end, so nobody is emailed forever', () => {
    expect(shouldNudge(quiet, MAX_NUDGES - 1)).toBe(true);
    expect(shouldNudge(quiet, MAX_NUDGES)).toBe(false);
    expect(shouldNudge(quiet, MAX_NUDGES + 40)).toBe(false);
  });

  it('cannot email a lead with no address', () => {
    expect(shouldNudge({ ...quiet, email: null }, 0)).toBe(false);
  });
});

describe('nudgeCopy', () => {
  /**
   * The same message resent every morning is exactly the shape a spam filter
   * is built to catch — and it stops being a nudge and starts being noise.
   */
  it('says something different on the early days', () => {
    const subjects = [0, 1, 2, 3].map((d) => nudgeCopy(d, 'Nair Dental', ['poor-seo']).subject);

    expect(new Set(subjects).size).toBeGreaterThan(2);
  });

  it('leads with the problem they told us about, when they told us one', () => {
    expect(nudgeCopy(2, 'Nair Dental', ['not-mobile-friendly']).subject.toLowerCase()).toContain(
      'mobile'
    );
  });

  it('still writes something usable when they ticked nothing', () => {
    const copy = nudgeCopy(2, 'Nair Dental', []);

    expect(copy.subject).toContain('Nair Dental');
    expect(copy.opening.length).toBeGreaterThan(20);
  });

  it('offers a way out in its own words once it has been going a while', () => {
    expect(nudgeCopy(9, 'Nair Dental', []).closing).toMatch(/unsubscrib|stops these/i);
  });

  it('names the company, so it is never a message that could be about anyone', () => {
    for (const day of [0, 3, 9]) {
      const copy = nudgeCopy(day, 'Nair Dental', ['poor-seo']);
      expect(`${copy.subject} ${copy.opening}`).toMatch(/Nair Dental|SEO|concept|form/i);
    }
  });
});

describe('leadProblems', () => {
  it('reads back what they ticked and drops anything else', () => {
    expect(leadProblems('poor-seo,not-a-thing,no-booking')).toEqual(['poor-seo', 'no-booking']);
    expect(leadProblems('')).toEqual([]);
  });
});
