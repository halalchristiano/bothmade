import { AUTO_FOLLOW_UP_TOTAL } from '@/lib/auto-follow-up';

/**
 * What happens to this lead next, in one sentence.
 *
 * The thing that made the call sheet stressful was never the list. It was not
 * being able to tell, at a glance, whether a lead was handled. Four separate
 * facts decide that — the call band, the follow-up date, the automated email
 * queue and the mockup state — and they lived in four different places, so
 * the honest answer to "is this one taken care of?" was to open the lead and
 * work it out. Which nobody does forty times a morning, so the real answer
 * was a nagging feeling that something was being dropped.
 *
 * This is that answer, computed once on the server so the row, the call
 * screen and the lead page cannot disagree about it.
 *
 * The most important case is the last one. `nothing` is what a lead looks
 * like when it is quietly rotting: no date, no email, nobody coming back to
 * it. Saying so plainly is the entire point — every other state is fine and
 * only needs to be legible.
 */

export type NextTouchKind =
  /** Waiting on work from us. Nothing to do but build it. */
  | 'mockup'
  /** A person is going to ring them, on a date. */
  | 'call'
  /** The machine is going to email them, on a date. */
  | 'email'
  /** Both, and both are worth knowing. */
  | 'call-and-email'
  /** They are on the sheet right now. */
  | 'now'
  /** Nothing at all is going to happen. */
  | 'nothing';

export interface NextTouch {
  kind: NextTouchKind;
  /** One sentence, written to be read at a glance and never truncated. */
  line: string;
  /** true when nothing is scheduled — the only state worth colouring. */
  needsAttention: boolean;
}

export interface NextTouchInput {
  /** Why the lead is on (or off) the call list. See the call-list route. */
  reason: string;
  nextFollowUpAt: Date | string | null;
  autoFollowUpDueAt: Date | string | null;
  autoFollowUpStage: number;
  mockupRequested: boolean;
  mockupSentAt: Date | string | null;
}

const asDate = (v: Date | string | null): Date | null => (v ? new Date(v) : null);

/**
 * "Thu 14 Aug", or "today"/"tomorrow" where those are clearer.
 *
 * A rep reads these while a phone is ringing. "Tomorrow" is instantly
 * understood; "15 Aug" has to be checked against today's date, which is a
 * small tax paid several hundred times a week.
 */
export function touchDay(date: Date, now: Date = new Date()): string {
  const startOf = (d: Date) => {
    const s = new Date(d);
    s.setHours(0, 0, 0, 0);
    return s.getTime();
  };
  const days = Math.round((startOf(date) - startOf(now)) / 86_400_000);

  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days < 0) return `${Math.abs(days)} days ago`;
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function nextTouch(lead: NextTouchInput, now: Date = new Date()): NextTouch {
  const call = asDate(lead.nextFollowUpAt);
  const email = asDate(lead.autoFollowUpDueAt);
  const mockupSent = asDate(lead.mockupSentAt);

  /*
   * A mockup being built outranks everything, because it is the only state
   * where the next move belongs to us rather than to a date. Saying "you're
   * ringing them Thursday" about somebody waiting on a mockup is true and
   * useless: what they are actually waiting for is the work.
   */
  if (lead.mockupRequested && !mockupSent) {
    return {
      kind: 'mockup',
      line: 'Waiting on their mockup — back on your sheet the day it goes out',
      needsAttention: false,
    };
  }

  // On the sheet right now. Nothing scheduled matters while the answer to
  // "what next" is "you, in a minute".
  if (lead.reason !== 'scheduled' && lead.reason !== 'awaiting-mockup') {
    return { kind: 'now', line: 'On your sheet now', needsAttention: false };
  }

  const emailsLeft = Math.max(0, AUTO_FOLLOW_UP_TOTAL - lead.autoFollowUpStage);
  const emailPart =
    email && emailsLeft > 0
      ? `automated email ${touchDay(email, now)}${emailsLeft > 1 ? ` (${emailsLeft} left)` : ' (last one)'}`
      : null;
  const callPart = call ? `you're ringing them ${touchDay(call, now)}` : null;

  if (callPart && emailPart) {
    return {
      kind: 'call-and-email',
      line: `${callPart[0].toUpperCase()}${callPart.slice(1)} · ${emailPart}`,
      needsAttention: false,
    };
  }
  if (callPart) {
    return {
      kind: 'call',
      line: `${callPart[0].toUpperCase()}${callPart.slice(1)}`,
      needsAttention: false,
    };
  }
  if (emailPart) {
    return {
      kind: 'email',
      line: `${emailPart[0].toUpperCase()}${emailPart.slice(1)}`,
      needsAttention: false,
    };
  }

  /*
   * The state this whole function exists to make visible.
   *
   * No date, no email, nobody coming back. It used to be indistinguishable
   * from a lead that was handled, which is how a book of two thousand ends up
   * with a few hundred nobody has thought about since March.
   */
  return {
    kind: 'nothing',
    line: 'Nothing scheduled — nobody is coming back to this one',
    needsAttention: true,
  };
}
