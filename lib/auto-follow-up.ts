import { esc } from '@/lib/html';

/**
 * The second email, sent by the machine because nobody sends it by hand.
 *
 * A call that ends "not right now" is not a no. It is the ordinary middle of
 * a sale, and the thing that decides whether it becomes a yes is whether
 * anybody comes back. What used to happen: the rep logs the call, a follow-up
 * date gets booked, the date arrives on a list of forty other dates, and the
 * second touch never happens. Not through laziness — writing a good follow-up
 * takes twenty minutes and there are always forty of them.
 *
 * So it is scheduled at the moment the call is logged, before anybody can
 * forget, and sent whether or not anyone remembers. One email, the same for
 * everybody, three days later.
 *
 * WHY THREE DAYS. Long enough that it doesn't read as pestering somebody you
 * spoke to this morning, short enough that they still remember the call. The
 * whole value of this email is the sentence "we spoke on Tuesday" — past a
 * week that sentence is a lie people can feel.
 *
 * WHAT CANCELS IT. Requesting a mockup. The mockup email is the follow-up,
 * and a lead who receives both in the same week learns that our emails are
 * automatic — which is the one thing this is trying not to be. A reply
 * cancels it too: they are in a conversation now, and an automated nudge
 * arriving mid-thread is worse than none.
 */

/** Days between the call and the automated follow-up. */
export const AUTO_FOLLOW_UP_DAYS = 3;

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

export function autoFollowUpDueDate(from: Date = new Date()): Date {
  const due = new Date(from);
  due.setDate(due.getDate() + AUTO_FOLLOW_UP_DAYS);
  return due;
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

/**
 * The email. One wording for everybody, on purpose.
 *
 * It was asked for that way and it is also the right call: the personal part
 * of this conversation already happened on the phone, and a second email that
 * pretends to be bespoke while being sent by a cron reads worse than one that
 * is plainly just a nudge. So it is short, it says the one useful thing — we
 * will build you the thing for free, before you decide anything — and it is
 * easy to stop.
 *
 * The unsubscribe is a plain sentence in the body rather than grey type at
 * the bottom, same as the enquiry nudge, for the same reason: somebody who
 * wants this to stop should not have to hunt, and a spam complaint costs far
 * more than a lost lead.
 */
export function autoFollowUpEmail(ctx: AutoFollowUpContext): { subject: string; html: string } {
  const who = firstName(ctx.contactName);

  return {
    subject: `Following up — ${ctx.company}`,
    html:
      `<p style="margin:0 0 14px;">Hi ${esc(who)},</p>` +
      `<p style="margin:0 0 16px;">We spoke on the phone a few days ago about the ${esc(
        ctx.company
      )} website — you mentioned it wasn't the right moment, which is fair enough.</p>` +
      `<p style="margin:0 0 16px;">One thing worth knowing before you file this away: we'll design the new version first, at no cost and with nothing to sign. You get to look at your own site rebuilt and then decide, rather than deciding first and hoping.</p>` +
      `<p style="margin:0 0 22px;">If that's of any interest, just reply to this email and we'll put one together this week. If it isn't, no hard feelings — I won't chase you.</p>` +
      `<p style="margin:0; font-size:13px; color:rgba(255,255,255,0.45);">` +
      `Would you rather we stopped entirely? <a href="${ctx.stopUrl}" style="color:rgba(255,255,255,0.75);">One click here</a> ` +
      `and you won't hear from us again — no form, no login, nothing to explain.` +
      `</p>`,
  };
}
