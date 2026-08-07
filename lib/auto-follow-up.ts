import { esc } from '@/lib/html';

/**
 * The two emails that follow a call, sent by the machine because nobody sends
 * them by hand.
 *
 * A call that ends "not right now" is not a no. It is the ordinary middle of
 * a sale, and what decides whether it becomes a yes is whether anybody comes
 * back. What used to happen: the rep logs the call, a follow-up date gets
 * booked, the date arrives on a list of forty other dates, and the second
 * touch never happens. Not through laziness — writing a good follow-up takes
 * twenty minutes and there are always forty of them.
 *
 * So they are scheduled at the moment the call is logged, before anybody can
 * forget, and sent whether or not anyone remembers.
 *
 * WHY TWO, AND WHY THESE DAYS. Day three is close enough that "we spoke on
 * the phone" is still true to them and far enough that it doesn't read as
 * pestering somebody you rang this morning. Day seven is the last one worth
 * sending: past a week the sentence stops being true, and a third nudge to
 * somebody who ignored two is how a sender earns a complaint rather than a
 * reply. Two emails is a follow-up. Five is a sequence, and people can feel
 * the difference.
 *
 * WHAT ENDS IT. A reply — they are in a conversation now, and an automated
 * nudge arriving mid-thread is worse than none. A mockup request, because the
 * mockup email IS the follow-up. A flat no. And running out of steps.
 */

/**
 * Days after the call that each email goes out.
 *
 * Counted from the CALL, not from the previous email, so a run that slips a
 * day doesn't push the whole tail back with it.
 */
export const AUTO_FOLLOW_UP_STEPS = [3, 7] as const;

/** How many emails the sequence holds. Two. */
export const AUTO_FOLLOW_UP_TOTAL = AUTO_FOLLOW_UP_STEPS.length;

/** Kept for the first scheduling, which is the only one measured from now. */
export const AUTO_FOLLOW_UP_DAYS = AUTO_FOLLOW_UP_STEPS[0];

/**
 * How many days a due email waits when a person has just emailed them.
 *
 * The one collision worth guarding: the rep sends the hand-written follow-up
 * from the call screen, and the automated one lands the next morning. Two
 * emails in two days from the same company is the exact texture of automation,
 * which is what this whole thing is trying not to be. Deferred rather than
 * skipped — the email is still worth sending, just not tomorrow.
 */
export const AUTO_FOLLOW_UP_QUIET_DAYS = 2;

/**
 * How many go out in one run.
 *
 * A ceiling rather than a target. This should never be near it — the sequence
 * only ever holds leads somebody actually spoke to on the phone — so hitting
 * it means something is wrong, and the run reports the overflow rather than
 * quietly sending three hundred emails from a mailbox that is meant to be
 * warming up.
 */
export const AUTO_FOLLOW_UP_MAX_PER_RUN = 40;

/**
 * The mailbox these go out from.
 *
 * Deliberately its own setting rather than "whoever made the call". These are
 * automated, they go out at a fixed time, and they must not come from a
 * mailbox that is under a restriction or being warmed. Set
 * `AUTO_FOLLOW_UP_FROM` to move them; the default is the address on the
 * secondary sending domain, which is the one with no history to protect.
 */
export function autoFollowUpSender(): string {
  return (process.env.AUTO_FOLLOW_UP_FROM || 'kiana@bothmadestudio.com').trim().toLowerCase();
}

const addDays = (from: Date, days: number): Date => {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
};

/** When the first email goes, measured from the call that was just logged. */
export function autoFollowUpDueDate(from: Date = new Date()): Date {
  return addDays(from, AUTO_FOLLOW_UP_STEPS[0]);
}

/**
 * When the next one goes, or null when the sequence is finished.
 *
 * Derived from the due date of the one just sent rather than from `now`, so
 * the whole schedule stays anchored to the call: an email that goes out a day
 * late because the run was delayed does not drag the next one late with it.
 *
 * `stageJustSent` is 1-based — pass 1 after the first email has gone.
 */
export function autoFollowUpNextDue(stageJustSent: number, dueAtOfSent: Date): Date | null {
  const nextStep = AUTO_FOLLOW_UP_STEPS[stageJustSent];
  if (nextStep === undefined) return null;
  return addDays(dueAtOfSent, nextStep - AUTO_FOLLOW_UP_STEPS[stageJustSent - 1]);
}

/**
 * Whether this call earns an automated follow-up.
 *
 * Only calls where somebody was actually spoken to. A voicemail already has
 * its own hand-written follow-up offered on the call screen, and "we spoke
 * the other day" sent to a person who never picked up the phone is a lie they
 * will notice — which costs more than the email is worth.
 *
 * A dead number and a flat no are excluded for the obvious reason.
 */
export function callEarnsAutoFollowUp(outcome: {
  spokeToThem?: boolean;
  status: string | null;
}): boolean {
  return Boolean(outcome.spokeToThem) && outcome.status !== 'lost';
}

export interface AutoFollowUpContext {
  company: string;
  contactName: string | null;
  /** `/stop/<token>` — the one-click unsubscribe. */
  stopUrl: string;
}

const firstName = (full: string | null): string => full?.trim().split(/\s+/)[0] || 'there';

const STOP_LINE = (stopUrl: string) =>
  `<p style="margin:0; font-size:13px; color:rgba(255,255,255,0.45);">` +
  `Would you rather we stopped entirely? <a href="${stopUrl}" style="color:rgba(255,255,255,0.75);">One click here</a> ` +
  `and you won't hear from us again — no form, no login, nothing to explain.` +
  `</p>`;

/**
 * The emails. One wording each, the same for everybody, on purpose.
 *
 * It was asked for that way and it is also the right call: the personal part
 * of this conversation already happened on the phone, and a second email that
 * pretends to be bespoke while being sent by a cron reads worse than one that
 * is plainly just a nudge.
 *
 * The two do different jobs. The first makes the offer — we'll build it first,
 * free, nothing to sign — because that is the thing most people have never
 * been offered and it is worth saying twice. The second closes the loop and
 * says out loud that it is the last one, which is both true and the single
 * most reliable way to get a reply out of somebody who has been meaning to
 * answer.
 *
 * The unsubscribe is a plain sentence in the body rather than grey type at
 * the bottom: somebody who wants this to stop should not have to hunt, and a
 * spam complaint costs far more than a lost lead.
 *
 * `stage` is 1-based.
 */
export function autoFollowUpEmail(
  ctx: AutoFollowUpContext,
  stage: number = 1
): { subject: string; html: string } {
  const who = esc(firstName(ctx.contactName));
  const company = esc(ctx.company);

  if (stage >= 2) {
    return {
      subject: `Last one from me — ${ctx.company}`,
      html:
        `<p style="margin:0 0 14px;">Hi ${who},</p>` +
        `<p style="margin:0 0 16px;">I wrote last week about rebuilding the ${company} website and haven't heard back, which almost always means the timing is wrong rather than the idea is.</p>` +
        `<p style="margin:0 0 16px;">This is the last one from me, so just so it's on the record: the offer is that we design it first. You see your own site rebuilt, properly, before you commit to anything or pay for anything. If it's not better than what you have, you say so and we've both lost an afternoon.</p>` +
        `<p style="margin:0 0 22px;">If that's worth an afternoon at some point — this year, next year — reply to this and I'll pick it up whenever suits. Otherwise I'll leave you to it.</p>` +
        STOP_LINE(ctx.stopUrl),
    };
  }

  return {
    subject: `Following up — ${ctx.company}`,
    html:
      `<p style="margin:0 0 14px;">Hi ${who},</p>` +
      `<p style="margin:0 0 16px;">We spoke on the phone a few days ago about the ${company} website — you mentioned it wasn't the right moment, which is fair enough.</p>` +
      `<p style="margin:0 0 16px;">One thing worth knowing before you file this away: we'll design the new version first, at no cost and with nothing to sign. You get to look at your own site rebuilt and then decide, rather than deciding first and hoping.</p>` +
      `<p style="margin:0 0 22px;">If that's of any interest, just reply to this email and we'll put one together this week. If it isn't, no hard feelings — I won't chase you.</p>` +
      STOP_LINE(ctx.stopUrl),
  };
}
