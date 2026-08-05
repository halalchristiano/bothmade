import { REVIEW_PERIOD_BUSINESS_DAYS, addBusinessDays } from '@/lib/business-days';

/**
 * The Section 4 review clock.
 *
 * Section 7: "Payment 2 of 3 is due on Design Approval, including deemed
 * approval under Section 4." Section 4: "where the Client does not respond to
 * the presented design within the Review Period, Design Approval has occurred
 * for the purposes of Sections 5 and 7, including the second Instalment
 * falling due."
 *
 * That deemed approval is the clause that most protects the studio, and it
 * was the one thing in the whole agreement that nothing tracked. Approval was
 * inferred from somebody moving a dropdown to Build — which is fine when a
 * client says yes, and useless in the exact case the clause was written for:
 * a client who says nothing at all. Their silence approved the design a week
 * ago and the payment gate stayed shut, because a person has to move a
 * dropdown and no one was going to move it on behalf of a client who had
 * gone quiet.
 *
 * So the clock is recorded rather than inferred. Presented on a date, ends on
 * a date, and lapses on its own.
 */

export type ApprovalSource = 'client' | 'deemed' | 'none';

export interface ReviewClock {
  presentedAt: Date | null;
  endsAt: Date | null;
  approvedAt: Date | null;
  deemed: boolean;
}

/**
 * Start the clock. The deadline is computed once, here, and stored.
 *
 * Deliberately not derived on read: a client is told the date their review
 * period ends, and a later change to how business days are counted must not
 * be able to move a deadline somebody has already been given in writing.
 */
export function startReview(presentedAt: Date): { presentedAt: Date; endsAt: Date } {
  return {
    presentedAt,
    endsAt: addBusinessDays(presentedAt, REVIEW_PERIOD_BUSINESS_DAYS),
  };
}

/**
 * Has this review period lapsed into deemed approval?
 *
 * Only ever true for a clock that is running and unanswered. An approval the
 * client actually gave is never overwritten — "they said yes" and "they said
 * nothing for a week" are different facts, and only one of them is worth
 * anything if it is ever disputed.
 */
export function hasLapsed(clock: ReviewClock, now: Date): boolean {
  if (!clock.presentedAt || !clock.endsAt) return false;
  if (clock.approvedAt) return false;
  return now >= clock.endsAt;
}

/** Where the approval came from, for anything that has to say so out loud. */
export function approvalSource(clock: ReviewClock): ApprovalSource {
  if (!clock.approvedAt) return 'none';
  return clock.deemed ? 'deemed' : 'client';
}

/**
 * Is the design approved, by either route?
 *
 * This is what the payment gate should key off. The statusStage fallback is
 * kept on purpose: every project that existed before this clock did has no
 * presentedAt, and the old inference — being at Build or beyond — is still
 * the best evidence available for those. New projects get the real answer;
 * old ones degrade to what they had rather than to nothing.
 */
export function designApproved(project: {
  designApprovedAt: Date | null;
  statusStage: number;
}): boolean {
  return Boolean(project.designApprovedAt) || project.statusStage >= 2;
}

/** Days left in the review period, floored at zero. Null when no clock runs. */
export function daysRemaining(clock: ReviewClock, now: Date): number | null {
  if (!clock.endsAt || clock.approvedAt) return null;
  const ms = clock.endsAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/**
 * What the client is told when the clock starts.
 *
 * The deadline is stated up front rather than buried, for the same reason the
 * clause exists: deemed approval is only fair if the client knew the terms
 * before the silence counted against them. A client who is told "we need to
 * hear from you by Friday or we'll take it as a yes" has been treated
 * properly. One who discovers it in an invoice has not.
 */
export function reviewNoticeLine(endsAt: Date): string {
  const date = endsAt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return `Have a look and tell us what you think by ${date}. If we haven't heard from you by then, we'll take that as approval and start building — that's the review period in Section 4 of your agreement, and it's there so the project can't stall on a message nobody got round to sending.`;
}
