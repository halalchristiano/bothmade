/**
 * Everything the system will tell you about, without being asked.
 *
 * A lot fires on its own now — payment gates, the Section 4 review clock, the
 * chase schedule, the call flag, three digests — and none of it was written
 * down anywhere. That is a worse problem than it sounds: if you do not know
 * what is being watched, silence is ambiguous. Nothing happened, or nothing
 * is watching? The only way to find out was to read the source, and the
 * answer to "will it tell me if a client goes quiet on a design" should not
 * live in a cron file.
 *
 * So this is the list, kept next to the code it describes. Adding an
 * automatic notification without adding it here is the failure this exists to
 * prevent, which is why it lives in lib and not in a wiki nobody updates.
 *
 * Times are UTC because that is what Vercel Cron schedules in — the same
 * strings that appear in vercel.json, so the two cannot drift.
 */

export type NotifyWhere = 'dashboard' | 'email' | 'bell' | 'screen';

export interface NotificationRule {
  /** What happens in the world. */
  trigger: string;
  /** What you get, and where. */
  tells: string;
  where: NotifyWhere[];
  /** When it runs. "The moment it happens" for anything not on a schedule. */
  timing: string;
  /** Which clause or rule decides it, where one does. */
  basis?: string;
}

export interface NotificationGroup {
  title: string;
  rules: NotificationRule[];
}

export const NOTIFICATION_GUIDE: NotificationGroup[] = [
  {
    title: 'Getting paid',
    rules: [
      {
        trigger: 'You move a project into a stage that opens a payment gate',
        tells: 'A prompt on that project, naming the payment and the clause, with a button to invoice it',
        where: ['screen'],
        timing: 'The moment you change the stage',
        basis: 'Section 7 — invoiced on the day of approval',
      },
      {
        trigger: 'A payment is past its gate and nobody has invoiced it',
        tells: 'The dashboard headline, and a named row under "Earned — nobody has invoiced it"',
        where: ['dashboard'],
        timing: 'Every time you open the dashboard, until it is sent',
      },
      {
        trigger: 'An invoiced payment reaches its due date',
        tells: 'The client is emailed a fresh payment link — the old one stops working',
        where: ['email'],
        timing: 'On the due date, then day 17, day 21, then weekly until it is paid',
        basis: 'Section 7 — payable within fourteen days',
      },
      {
        trigger: 'An invoice email never registers an open or a click',
        tells: 'The row turns amber and says it may not have reached them — check the address before chasing again',
        where: ['dashboard', 'screen'],
        timing: 'From a day after it was sent, on the dashboard and on the project',
      },
      {
        trigger: 'A payment goes a week past due',
        tells: 'We email you their phone number and tell you to ring them',
        where: ['email'],
        timing: 'Once, when it crosses a week overdue',
      },
      {
        trigger: 'A payment clears',
        tells: 'The chase stops on its own, and the schedule updates everywhere',
        where: ['dashboard'],
        timing: 'The moment Stripe confirms it',
      },
    ],
  },
  {
    title: 'The design review clock',
    rules: [
      {
        trigger: 'The client signs their design direction',
        tells: 'We email you the brief — their references, their reasons, their three words — and it sits on the project beside anything they say later',
        where: ['email', 'dashboard'],
        timing: 'The moment they sign it',
        basis: 'Section 4 — a departure from a signed brief is a non-conformance, not a preference',
      },
      {
        trigger: 'You go to present a design with no signed direction',
        tells: 'The project says so before you send, and says what it costs you if they argue',
        where: ['screen'],
        timing: "Whenever you open a project that hasn't got one",
      },
      {
        trigger: 'You send a design for review',
        tells: 'The client is emailed the deadline; the countdown appears on the project',
        where: ['email', 'screen'],
        timing: 'Immediately — five working days from that moment',
        basis: 'Section 4 — the Review Period',
      },
      {
        trigger: 'The client never replies',
        tells: 'The design is approved automatically, we email you, and Payment 2 becomes due',
        where: ['email', 'dashboard'],
        timing: 'Overnight, 9am UTC, the day the period runs out',
        basis: 'Section 4 — deemed approval',
      },
      {
        trigger: 'The client approves it themselves',
        tells: 'Recorded as their approval rather than deemed, and the gate opens the same way',
        where: ['dashboard'],
        timing: 'The moment they press it',
      },
      {
        trigger: 'The client sends design feedback instead of approving',
        tells: 'We email you their notes, split into what we got wrong, what they simply want different, and what is new scope — and it takes over the dashboard headline until somebody reads it',
        where: ['email', 'dashboard'],
        timing: 'The moment they submit it',
        basis: 'Section 4 — two included rounds; Exhibit C — non-conformance is free and outside them',
      },
      {
        trigger: 'They use up both included revision rounds',
        tells: 'The project says so, and the client is told plainly on their own form before they write anything',
        where: ['screen'],
        timing: 'As soon as the second round is spent',
        basis: 'Section 9 — beyond the allowance is a Change Order',
      },
    ],
  },
  {
    title: 'Contracts and scope',
    rules: [
      {
        trigger: 'A client signs a change order',
        tells: 'We email you; the price, the scope and the remaining payments all move together',
        where: ['email'],
        timing: 'The moment they sign',
        basis: 'Section 9 — approved in writing before work begins',
      },
      {
        trigger: 'A client declines a change order',
        tells: 'Their reason appears on the project. Nothing about the project changes',
        where: ['dashboard'],
        timing: 'The moment they decline',
      },
    ],
  },
  {
    title: 'Sales',
    rules: [
      {
        trigger: 'A lead replies to a cold email',
        tells: 'They jump to the top of the call queue, and the bell',
        where: ['dashboard', 'bell'],
        timing: 'Next inbox scan',
      },
      {
        trigger: 'A prospect opens or approves a mockup',
        tells: 'The dashboard headline says to ring them while it is fresh',
        where: ['dashboard'],
        timing: 'The moment they open it',
      },
      {
        trigger: 'Leads have gone quiet',
        tells: 'A digest of what is going cold, and any email that bounced',
        where: ['email'],
        timing: 'Daily, 2pm UTC',
      },
      {
        trigger: 'Follow-ups are due',
        tells: 'A list of who to call today',
        where: ['email'],
        timing: 'Weekdays, 1pm UTC',
      },
      /*
       * The two that send mail *for* you, and were missing from this list
       * entirely — which is the failure the file header says it exists to
       * prevent. Both are in vercel.json and have been running.
       *
       * auto-follow-up is the one worth reading twice. It sends through
       * sendAsUser, so the mail leaves from the rep's own Gmail and lands in
       * their Sent folder. A rep who does not know it runs can message a lead
       * the same morning it did, or get a reply to something they never wrote.
       */
      {
        trigger: 'A cold lead has gone quiet for a couple of days',
        tells:
          'The next of three follow-ups is sent from your own Gmail, and the lead moves to Contacted. ' +
          'After the third, the sequence ends and the lead is left for you',
        where: ['email'],
        timing: 'Weekdays, 4pm UTC',
        basis: 'Up to 40 leads a run, and never inside 2 days of the last one',
      },
      {
        trigger: 'Somebody filled in the contact form and then went quiet',
        tells:
          'They are nudged once a day, with copy that changes as the days pass, and an unsubscribe ' +
          'link in every one. After 14 we stop and leave them for a human',
        where: ['email'],
        timing: 'Daily, 3pm UTC',
        basis: 'MAX_NUDGES = 14 — this is not cold mail, it is a conversation they started',
      },
    ],
  },
  {
    title: 'Delivery',
    rules: [
      {
        trigger: 'A client sends a message',
        tells: 'The bell, and the project moves up your priorities',
        where: ['bell', 'dashboard'],
        timing: 'Immediately',
      },
      {
        trigger: 'A project goes a week without anyone touching it',
        tells: 'It appears under "Gone quiet" on Priorities',
        where: ['dashboard'],
        timing: 'Every time you open Priorities',
      },
      {
        trigger: 'A project is finished but has no live URL',
        tells: 'Priorities says to set it, so their delivery moment can fire',
        where: ['dashboard'],
        timing: 'Every time you open Priorities',
      },
      {
        trigger: 'A care plan starts, or a monthly charge fails',
        tells: 'We email you either way',
        where: ['email'],
        timing: 'The moment Stripe tells us',
      },
    ],
  },
  {
    title: 'The weekly picture',
    rules: [
      {
        trigger: 'End of the week',
        tells: 'New leads, what was won, revenue this month, overdue balances and anything at risk',
        where: ['email'],
        timing: 'Fridays, 2pm UTC',
      },
    ],
  },
];

/**
 * The one thing this list cannot tell you: what it does NOT watch.
 *
 * Worth saying out loud on the page, because an absence is invisible and a
 * reader who has just seen twenty rows of coverage will reasonably assume
 * everything is covered.
 */
export const NOT_WATCHED: string[] = [
  'Whether a person actually read an invoice email. We can see it reached a live mailbox — Apple and Gmail load the images themselves, so an open is proof of delivery, not of reading.',
  'Any email other than the invoices. Nothing else carries a pixel.',
  'Public holidays. The five-day review period counts weekends out and bank holidays in.',
  'Anything happening in your inbox that the system never sent.',
];
