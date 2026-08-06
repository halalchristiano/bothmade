/**
 * The daily nudge to somebody who asked us to get in touch and then went
 * quiet.
 *
 * They filled in a form on our website, so this is not cold mail — it is a
 * conversation they started and we are keeping open. That is also exactly why
 * it has to be easy to end: an unsubscribe link in every one, honoured on a
 * single click with nothing to log into.
 *
 * A word on the cadence, because it is the risk in this file. Daily is what
 * was asked for and daily is what this does, but every one of these that gets
 * marked as spam costs the sending domain reputation — and that domain also
 * sends the invoices. `MAX_NUDGES` is the brake: past it we stop and leave the
 * lead for a human, on the grounds that somebody who has ignored a fortnight
 * of daily email is not going to be won by a fifteenth. Raise it, or set it to
 * Infinity, in one place.
 */

import { PAIN_POINTS, type PainPointKey, isPainPointKey } from '@/lib/leads';

/** How many days running we will write before leaving them alone. */
export const MAX_NUDGES = 14;

/** How the message changes as the days pass, so day nine is not day one again. */
export interface NudgeCopy {
  subject: string;
  opening: string;
  /** The one line before the sign-off. */
  closing: string;
}

/**
 * A different email each day, for as long as it can be different.
 *
 * The same message resent every morning is the definition of the thing
 * filters are built to catch, and it also stops being a nudge and starts
 * being noise. So the first few say genuinely different things — we read it,
 * here is what we would look at, here is what it would take — and only then
 * does it settle into a short standing offer.
 */
export function nudgeCopy(day: number, company: string, problems: PainPointKey[]): NudgeCopy {
  const first = problems[0] ? PAIN_POINTS[problems[0]].toLowerCase() : null;

  if (day <= 1) {
    return {
      subject: `Following up — ${company}`,
      opening:
        'Just making sure this reached somebody. You filled in the form on our site, so this is us keeping our end of it.',
      closing: 'A one-line reply is plenty — even "not right now" means we stop.',
    };
  }
  if (day === 2) {
    return {
      subject: first ? `About the ${first}` : `About your enquiry — ${company}`,
      opening: first
        ? `You told us the ${first} was the problem. That is usually the cheapest thing on the list to fix, and the one that changes the most.`
        : 'We had a proper look at what you sent. There is a version of this that is smaller and quicker than most people expect.',
      closing: 'Happy to talk it through for fifteen minutes, with nothing to sign at the end of it.',
    };
  }
  if (day === 3) {
    return {
      subject: `Want us to build ${company} something to look at?`,
      opening:
        'We usually build a concept before anyone commits to anything — a working homepage for your business, so you can judge it rather than imagine it. It costs you nothing and you keep the ideas either way.',
      closing: 'Say the word and we will put one together.',
    };
  }
  return {
    subject: `Still here whenever you are — ${company}`,
    opening:
      'Nothing new from us, just leaving the door open. Whenever the timing is right, we pick up where this left off.',
    closing: 'If now is not the time, unsubscribing below stops these and costs you nothing.',
  };
}

/**
 * Whether today is a day this lead gets written to.
 *
 * Everything that means "they answered" stops it: a reply, a call, being
 * marked do-not-contact, or the deal simply moving on. Deliberately generous
 * about what counts as an answer — the cost of stopping too early is one
 * unsent email, and the cost of stopping too late is a complaint.
 */
export function shouldNudge(
  lead: {
    email: string | null;
    doNotContact: boolean;
    status: string;
    replyReceivedAt: Date | null;
    emailDeliveryFailedAt?: Date | null;
  },
  nudgesSent: number
): boolean {
  if (!lead.email) return false;
  if (lead.doNotContact) return false;
  if (lead.replyReceivedAt) return false;
  // A bounced address is not a silent prospect, it is a dead address.
  if (lead.emailDeliveryFailedAt) return false;
  if (!['new', 'contacted'].includes(lead.status)) return false;
  return nudgesSent < MAX_NUDGES;
}

/** Parses the stored comma list back into keys, ignoring anything unknown. */
export function leadProblems(painPoints: string): PainPointKey[] {
  return painPoints
    .split(',')
    .map((p) => p.trim())
    .filter((p): p is PainPointKey => isPainPointKey(p));
}
