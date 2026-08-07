import { esc } from '@/lib/html';

/**
 * The three emails that follow a call, sent by the machine because nobody
 * sends them by hand.
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
 * WHY THESE DAYS. Day three is close enough that "we spoke on the phone" is
 * still true to them and far enough that it doesn't read as pestering
 * somebody you rang this morning. Day five is the one that has to earn its
 * place, so it is the only one that says something about their business
 * specifically. Day seven is the last: past a week the sentence stops being
 * true, and a fourth nudge to somebody who ignored three is how a sender
 * earns a complaint rather than a reply.
 *
 * WHY THEY ARE DIFFERENT EMAILS. Three sends of the same nudge is the texture
 * of a mail merge, and the second one teaches the reader to stop opening
 * them. Each of these does a different job: make the offer, show that
 * somebody actually looked, and close the loop.
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
export const AUTO_FOLLOW_UP_STEPS = [3, 5, 7] as const;

/** How many emails the sequence holds. Three. */
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
  /**
   * The one line research wrote about this specific business, if there is one.
   *
   * Deliberately `personalizedObservation` and NOT `currentSiteAssessment`.
   * The observation is written to be said to the customer; the assessment is
   * an internal verdict ("Underperforming local-service website, still shows
   * template remnants") and sending one to the business it is about would be
   * the most expensive sentence in the whole system.
   */
  observation?: string | null;
}

const firstName = (full: string | null): string => full?.trim().split(/\s+/)[0] || 'there';

const STOP_LINE = (stopUrl: string) =>
  `<p style="margin:0; font-size:13px; color:rgba(255,255,255,0.45);">` +
  `Would you rather we stopped entirely? <a href="${stopUrl}" style="color:rgba(255,255,255,0.75);">One click here</a> ` +
  `and you won't hear from us again — no form, no login, nothing to explain.` +
  `</p>`;

/**
 * The three emails.
 *
 * Each does a different job, because three sends of the same nudge is the
 * texture of a mail merge and the second one teaches the reader to stop
 * opening them.
 *
 *  1. DAY THREE — the offer. We design it first, free, nothing to sign. Most
 *     people have never been offered that, and it is the only sentence in the
 *     whole sequence that can change somebody's mind on its own.
 *  2. DAY FIVE — the one that proves a person looked. It leads with what
 *     research actually wrote about this business, so it cannot be mistaken
 *     for a template. When there is no observation on file it falls back to a
 *     shorter note rather than printing an empty gap, because the fallback
 *     has to be a real email and not a broken one.
 *  3. DAY SEVEN — the close. It says out loud that it is the last, which is
 *     true and is the single most reliable way to get a reply out of somebody
 *     who has been meaning to answer.
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
  const observation = ctx.observation?.trim();

  if (stage >= 3) {
    return {
      subject: `Last one from me — ${ctx.company}`,
      html:
        `<p style="margin:0 0 14px;">Hi ${who},</p>` +
        `<p style="margin:0 0 16px;">I've written twice about rebuilding the ${company} website and haven't heard back, which almost always means the timing is wrong rather than the idea is.</p>` +
        `<p style="margin:0 0 16px;">This is the last one from me, so just so it's on the record: the offer is that we design it first. You see your own site rebuilt, properly, before you commit to anything or pay for anything. If it's not better than what you have, you say so and we've both lost an afternoon.</p>` +
        `<p style="margin:0 0 22px;">If that's worth an afternoon at some point — this year, next year — reply to this and I'll pick it up whenever suits. Otherwise I'll leave you to it.</p>` +
        STOP_LINE(ctx.stopUrl),
    };
  }

  if (stage === 2) {
    return {
      subject: observation ? `One thing about the ${ctx.company} site` : `Still happy to build it — ${ctx.company}`,
      html:
        `<p style="margin:0 0 14px;">Hi ${who},</p>` +
        (observation
          ? // Their own site, in the words somebody wrote after looking at
            // it. This is the whole reason this email exists: it is the one
            // that cannot be mistaken for a template.
            `<p style="margin:0 0 16px;">Before I rang you I'd had a proper look at the ${company} site. The thing that stood out: ${esc(
              observation
            )}</p>` +
            `<p style="margin:0 0 16px;">That's the part we'd fix first — and you'd see it fixed before deciding anything, because we build the new version up front at no cost.</p>`
          : `<p style="margin:0 0 16px;">Just following on from my last note about the ${company} website. The offer stands: we build the new version first, you look at it, and only then do you decide whether it's worth doing.</p>` +
            `<p style="margin:0 0 16px;">No cost for that part and nothing to sign — the only thing it costs you is the time to look.</p>`) +
        `<p style="margin:0 0 22px;">Worth a look? One line back and I'll get it started.</p>` +
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
