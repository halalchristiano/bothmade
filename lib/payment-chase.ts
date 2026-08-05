/**
 * Chasing a payment that has been invoiced and not paid.
 *
 * Two things used to go wrong on their own, and nobody noticed either.
 *
 * Nothing chased. An invoice went out and from then on getting paid depended
 * on somebody remembering, so a payment sat unpaid for exactly as long as it
 * took a person to think of it.
 *
 * And the link died. A Stripe Checkout Session expires after 24 hours, so a
 * client returning to last week's email found a button that did nothing —
 * a payment lost to friction rather than to unwillingness. Every chase
 * therefore mints a fresh link and kills the previous one, which the
 * instalment send route already does: two live links for one payment is the
 * double-collection window it exists to close.
 *
 * NOTHING IS SENT BEFORE THE DUE DATE. The contract gives a client fourteen
 * days, and a supplier who starts reminding on day two has not given them
 * fourteen days, whatever the paperwork says. The first email goes on the day
 * it actually falls due.
 *
 * After that the cadence is the one every accounting package converges on —
 * on the day, a few days later, a week later, then weekly — because it is
 * what works. Most late B2B payments are administrative: it reached the wrong
 * person, they need a PO number, the person who signs is away. Emailing daily
 * fixes none of those and costs sender reputation, which quietly stops the
 * later chases arriving at all. A phone call fixes all three in four minutes,
 * so the schedule's real job is getting somebody to the phone at the right
 * moment — see `needsCall`.
 */

/** Where a client stands relative to the terms they agreed to. */
export type ChasePhase = 'within-terms' | 'due' | 'late' | 'seriously-late';

export interface ChaseState {
  phase: ChasePhase;
  /** Whole days since the invoice was issued. */
  daysSinceInvoiced: number;
  /** Negative until the due date passes. */
  daysPastDue: number;
  /** True when a chase should go out today. */
  shouldChase: boolean;
  /** Said to the client. Changes every time — see chaseSubject. */
  subject: string;
  /** The reason, in the client's terms rather than ours. */
  line: string;
  /**
   * A week past due. The point at which another email is worth less than one
   * phone call, and the highest-value signal this module produces.
   */
  needsCall: boolean;
  /**
   * Long enough that the reminders are demonstrably not working. Does not
   * stop them — it says the remedy is now a person, or the contract.
   */
  needsHuman: boolean;
}

/** Section 7: payable within fourteen days of being invoiced. */
export const PAYMENT_TERMS_DAYS = 14;
/** Section 7: "Payments not received within seven (7) days of their due date are late." */
export const GRACE_DAYS = 7;

/**
 * Days after invoicing on which a chase goes out, then weekly.
 *
 * 14 is the due date itself — the first contact. 17 and 21 are the standard
 * short escalation; 21 is also a full week past due, which is where the call
 * flag lifts. Everything after that is weekly, forever, until it is paid.
 */
export const CHASE_DAYS = [14, 17, 21] as const;
export const WEEKLY_AFTER_DAY = 21;
export const NEEDS_HUMAN_AFTER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two instants, floored — a chase at 9am on day 3 is day 3. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Which day the next chase is due on, given how many have gone.
 *
 * Driven by the count rather than by "is today in the list", so a cron that
 * misses a day — a deploy, an outage, a Vercel hiccup — catches up on the
 * next run instead of skipping that chase entirely and silently.
 */
export function nextChaseDay(chaseCount: number): number {
  if (chaseCount < CHASE_DAYS.length) return CHASE_DAYS[chaseCount];
  return WEEKLY_AFTER_DAY + (chaseCount - CHASE_DAYS.length + 1) * 7;
}

export function chaseState(input: {
  invoicedAt: Date;
  dueAt: Date | null;
  lastChasedAt: Date | null;
  chaseCount: number;
  now: Date;
  label: string;
  amountLabel: string;
}): ChaseState {
  const { now, invoicedAt } = input;
  const dueAt = input.dueAt ?? new Date(invoicedAt.getTime() + PAYMENT_TERMS_DAYS * DAY_MS);

  const daysSinceInvoiced = Math.max(0, daysBetween(invoicedAt, now));
  const daysPastDue = daysBetween(dueAt, now);

  const phase: ChasePhase =
    daysPastDue >= GRACE_DAYS
      ? 'seriously-late'
      : daysPastDue > 0
        ? 'late'
        : daysPastDue === 0
          ? 'due'
          : 'within-terms';

  // One chase per calendar day whatever happens: a cron that fires twice, or
  // a manual run on the same day, must not send two emails.
  const notChasedToday = !input.lastChasedAt || daysBetween(input.lastChasedAt, now) >= 1;
  const reached = daysSinceInvoiced >= nextChaseDay(input.chaseCount);

  return {
    phase,
    daysSinceInvoiced,
    daysPastDue,
    shouldChase: reached && notChasedToday,
    subject: chaseSubject(phase, input),
    line: chaseLine(phase, { ...input, daysPastDue }),
    needsCall: daysPastDue >= GRACE_DAYS,
    needsHuman: daysSinceInvoiced >= NEEDS_HUMAN_AFTER_DAYS,
  };
}

/**
 * Subjects change with every send.
 *
 * A subject repeated verbatim threads into one ignored blob in an inbox, and
 * is what a filter learns to score. These vary by phase, and inside the long
 * weekly tail by count, so the sixth does not look like the fifth.
 */
function chaseSubject(
  phase: ChasePhase,
  input: { label: string; amountLabel: string; chaseCount: number }
): string {
  const { label, amountLabel, chaseCount } = input;
  switch (phase) {
    case 'within-terms':
      // Nothing is sent in this phase; kept so the type is total.
      return `${label} — ${amountLabel}`;
    case 'due':
      return `${label} is due today — ${amountLabel}`;
    case 'late':
      return `${label} is overdue — ${amountLabel}`;
    case 'seriously-late':
      return chaseCount % 2 === 0
        ? `${amountLabel} still outstanding — ${label}`
        : `Can we sort out ${label}?`;
  }
}

function chaseLine(
  phase: ChasePhase,
  input: { daysPastDue: number; label: string; amountLabel: string }
): string {
  const overdueBy = Math.abs(input.daysPastDue);
  const dayWord = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

  switch (phase) {
    case 'within-terms':
      return `Here's a fresh payment link for ${input.label}.`;
    case 'due':
      return `This is due today. The link below is live right now — it takes about a minute.`;
    case 'late':
      return `This was due ${dayWord(overdueBy)} ago. If something's holding it up — the wrong contact, a PO number, anyone away — just reply and tell us. We'd much rather sort it than keep emailing.`;
    case 'seriously-late':
      // Section 7's consequences, stated plainly rather than threatened.
      return `This is now ${dayWord(overdueBy)} past its due date. Under the agreement we can pause work until payment is current, and overdue amounts carry statutory interest — we'd rather do neither. Reply, or give us a ring, and we'll get it sorted.`;
  }
}

/**
 * How loudly to tell the STUDIO about money past its gate that nobody has
 * invoiced. A different problem: nobody is late, because nobody has been
 * asked.
 */
export function unbilledUrgency(daysSinceGate: number): 'quiet' | 'nudge' | 'loud' {
  if (daysSinceGate >= 14) return 'loud';
  if (daysSinceGate >= 3) return 'nudge';
  return 'quiet';
}
