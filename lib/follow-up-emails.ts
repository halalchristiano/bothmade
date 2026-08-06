import { formatCents } from '@/lib/pricing';
import type { SalesPoint } from '@/lib/leads';

/**
 * The email that should go out after a call, already written.
 *
 * Logging the call now takes one tap, but the follow-up itself was still a
 * blank page — and writing a decent one is exactly what someone new to sales
 * is least confident doing and most likely to put off. Put off long enough,
 * the call may as well not have happened.
 *
 * There is a correct email after every outcome, including the ones that feel
 * like nothing happened: a voicemail deserves a short note, and a gatekeeper
 * deserves a request for the right person's name. Those are the two nobody
 * thinks to send.
 */
export interface FollowUpDraft {
  subject: string;
  body: string;
  /** Why this email is worth sending — shown above the draft, not sent. */
  why: string;
}

export interface FollowUpContext {
  company: string;
  contactName: string | null;
  essentials: SalesPoint[];
  low: number | null;
  high: number | null;
}

const firstName = (full: string | null): string => full?.trim().split(/\s+/)[0] || 'there';

export function buildFollowUpDraft(outcomeKey: string, ctx: FollowUpContext): FollowUpDraft | null {
  const who = firstName(ctx.contactName);

  /*
   * Signed by the studio, not by a person.
   *
   * This used to sign with the lead's assigned rep, on the reasoning that the
   * owner is the one following up. They are not always: one of us made the
   * call, the other owned the lead, and the email went out in the wrong
   * person's name to somebody who had just been speaking to the first. There
   * is no field here that reliably knows who is sending — so rather than
   * guess at a name and be wrong in front of a customer, it signs with none.
   */
  const sign = `\n\nThanks,\nBothmade`;

  const bullets = ctx.essentials
    .slice(0, 4)
    .map((e) => `• ${e.point}`)
    .join('\n');

  const priceLine =
    ctx.low && ctx.high && ctx.high > ctx.low
      ? `Cost-wise, something like this usually lands between ${formatCents(ctx.low)} and ${formatCents(ctx.high)} depending on how much you take on. The core piece is ${formatCents(ctx.low)}.`
      : ctx.low
        ? `Cost-wise, the core piece comes to ${formatCents(ctx.low)}.`
        : '';

  switch (outcomeKey) {
    case 'no-answer':
    case 'voicemail':
      return {
        why: "A short note after a missed call gets replies surprisingly often, and it means the next time you ring you're not a stranger.",
        subject: `Tried to reach you — ${ctx.company}`,
        body:
          `Hi ${who},\n\n` +
          `I gave you a ring earlier — nothing urgent.\n\n` +
          `I'd had a look at ${ctx.company} beforehand and spotted a couple of things on the website that are likely costing you enquiries. Happy to run through them in two minutes whenever suits.\n\n` +
          `Is there a better time to catch you?` +
          sign,
      };

    case 'gatekeeper':
      return {
        why: "Asking by email for the right person's name works when a phone gatekeeper won't put you through — and it gives you a name to use next time.",
        subject: `Quick question about the ${ctx.company} website`,
        body:
          `Hi,\n\n` +
          `I rang earlier and was hoping you could point me in the right direction.\n\n` +
          `I'd had a look at the ${ctx.company} website and noticed a few things that are probably costing you enquiries. Who's the best person to speak to about the website — and when are they usually around?\n\n` +
          `Happy to email them directly if that's easier.` +
          sign,
      };

    case 'spoke-callback':
      return {
        why: 'Confirming in writing that you will ring back makes it a commitment rather than a brush-off, and gives them your details.',
        subject: `Speaking soon — ${ctx.company}`,
        body:
          `Hi ${who},\n\n` +
          `Thanks for picking up earlier — I know I caught you at a busy moment.\n\n` +
          `I'll give you a ring back as we agreed. In the meantime, my details are below if anything comes up sooner.` +
          sign,
      };

    case 'spoke-interested':
      return {
        why: "Writing down what you discussed while it's fresh means they can forward it internally — most deals are decided in a conversation you're not in.",
        subject: `Following up on our chat — ${ctx.company}`,
        body:
          `Hi ${who},\n\n` +
          // The whole middle of this email, or none of it.
          //
          // It used to promise the main points and then print "• (add the two
          // or three things you discussed)" underneath — an instruction to
          // the sender, sent to the client. Removing just the bracket leaves
          // an email that promises a list and gives none, which is no better,
          // so the opening line goes with it.
          (bullets
            ? `Good speaking with you earlier. Putting the main points in writing so you've got them.\n\n` +
              `From what we talked about, the things that would make the biggest difference are:\n\n${bullets}\n\n`
            : `Good speaking with you earlier — glad we got to talk it through.\n\n`) +
          `${priceLine ? priceLine + '\n\n' : ''}` +
          `Any questions, just reply here or give me a ring.` +
          sign,
      };

    case 'sending-proposal':
      return {
        why: 'Send this the same day. A proposal that arrives while the conversation is still fresh converts far better than one that lands next week.',
        subject: `What we discussed — ${ctx.company}`,
        body:
          `Hi ${who},\n\n` +
          `Thanks for your time earlier. Here's what I'd suggest, based on what you told me.\n\n` +
          // Same placeholder ("• (list the main pieces you agreed on)"), same
          // file, same person hitting it tomorrow. Gone for the same reason.
          // Nothing dangles without it: the price and the terms follow.
          (bullets ? `${bullets}\n\n` : '') +
          `${priceLine ? priceLine + '\n\n' : ''}` +
          `That's half up front and half on delivery. Nothing is locked in until you're happy with the detail.\n\n` +
          `Have a read and tell me what you think — happy to adjust the scope if some of it isn't a priority right now.` +
          sign,
      };

    case 'meeting-booked':
      return {
        why: 'A written confirmation is what stops a booked meeting quietly evaporating.',
        subject: `Confirmed — ${ctx.company}`,
        body:
          `Hi ${who},\n\n` +
          `Great speaking with you — that's confirmed in my diary.\n\n` +
          `I'll come prepared with what I think would make the biggest difference for ${ctx.company}, so we can use the time properly.\n\n` +
          `If anything changes your end, just let me know.` +
          sign,
      };

    // A clear no, or a dead number, deserves no email. Sending one to
    // someone who has just said no is the fastest way to be marked as spam.
    default:
      return null;
  }
}
