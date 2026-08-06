import { revisionAllowanceLine } from '@/lib/design-stages';
/**
 * What the client says when the answer is "not yet".
 *
 * Approval had a button. Rejection had nothing — a client who did not like
 * the design either wrote a paragraph in the message box or said it on a
 * call, and in both cases the studio got an undifferentiated pile of
 * opinions with no record of which of them we actually owed them.
 *
 * That matters more than it sounds, because the agreement prices the three
 * kinds of feedback completely differently:
 *
 *   §4 — "Each major Milestone includes up to two (2) rounds of revisions at
 *   no additional charge for changes consistent with the originally agreed
 *   scope; additional or materially different revisions are billable as a
 *   Change Order."
 *
 *   Exhibit C — "A delivered feature genuinely doesn't match the agreed spec:
 *   this is a non-conformance under Section 4, corrected at no charge and
 *   WITHOUT counting against the revision allowance."
 *
 *   §4 — "Subjective preferences not reflected in agreed specifications do
 *   not constitute grounds for rejecting a Deliverable, though the Agency
 *   will accommodate such feedback within the standard revision allowance."
 *
 * So "you agreed to a booking form and there isn't one" is free and costs
 * them nothing from the allowance. "I'd prefer that button in green" is free
 * but burns one of the two. "Actually, show me a completely different
 * direction" is not a revision at all — a second original concept is new
 * work under §9.
 *
 * The form makes the client sort each item into one of those three as they
 * write it. Doing the sorting at the point of writing, in their own words, is
 * the entire value: an argument about which bucket something belongs in is
 * far cheaper before the work than after it.
 */

/** Exhibit A: "an original visual design concept for review; up to two (2) rounds of revisions". */
export const INCLUDED_REVISION_ROUNDS = 2;

export type FeedbackKind = 'not-as-agreed' | 'change' | 'new';

export interface FeedbackKindSpec {
  kind: FeedbackKind;
  /** What the client sees on the radio button. No legalese. */
  label: string;
  /** The one line under it that decides whether they pick this one. */
  help: string;
  /** What the studio sees on the dashboard. */
  adminLabel: string;
  /** Whether choosing this consumes one of the included rounds. */
  countsAgainstAllowance: boolean;
  /** The clause behind it, shown to the studio, never to the client. */
  basis: string;
}

/**
 * The three buckets, in the order a client should consider them.
 *
 * Non-conformance first on purpose. It is the cheapest option for them and
 * the one they are least likely to think of, and a form that leads with "I'd
 * like it changed" quietly pushes free corrections into the paid allowance.
 * We would rather they used the free bucket where it honestly applies.
 *
 * The client-facing copy for `new` deliberately does not say "chargeable".
 * Whether something is absorbed or quoted is a judgement about the
 * relationship, and the software should not make it — or pre-announce it —
 * on the studio's behalf. It says we will come back to them, which is true.
 */
export const FEEDBACK_KINDS: FeedbackKindSpec[] = [
  {
    kind: 'not-as-agreed',
    label: "It doesn't match what we agreed",
    help: 'Something from your requirements sign-off is missing or different. We fix these free, and they never use up one of your revision rounds.',
    adminLabel: 'Not as agreed',
    countsAgainstAllowance: false,
    basis: 'Section 4 non-conformance — corrected at no charge, outside the allowance (Exhibit C)',
  },
  {
    kind: 'change',
    label: "It's as agreed — I'd just like it different",
    help: "Nothing's wrong, you'd simply prefer another look. This is exactly what your included revision rounds are for.",
    adminLabel: 'In-scope change',
    countsAgainstAllowance: true,
    basis: 'Section 4 — within the two included rounds of revisions',
  },
  {
    kind: 'new',
    label: "I'd like something we haven't discussed",
    help: "Something new, or a completely different direction. Tell us anyway — we'll look at it and come back to you on this one.",
    adminLabel: 'New scope',
    countsAgainstAllowance: false,
    basis: 'Section 9 — materially different or new scope, quoted as a Change Order',
  },
];

export function kindSpec(kind: string): FeedbackKindSpec | null {
  return FEEDBACK_KINDS.find((k) => k.kind === kind) ?? null;
}

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return typeof value === 'string' && FEEDBACK_KINDS.some((k) => k.kind === value);
}

export interface FeedbackItem {
  /** Which part of the design — free text, because we cannot know their screens. */
  area: string;
  kind: FeedbackKind;
  detail: string;
}

export interface FeedbackSubmission {
  liked: string | null;
  items: FeedbackItem[];
  note: string | null;
}

/**
 * Does this submission consume one of the two included rounds?
 *
 * Only an in-scope change does. A client whose entire response is "these four
 * things aren't what we signed off" has been given something that does not
 * conform, and Exhibit C says fixing that is free and outside the allowance —
 * charging a round for our own miss would be indefensible.
 *
 * A submission that is only new-scope requests is the same: no revision of
 * the presented design has been asked for, so there is no round to spend.
 * That work gets quoted under §9 instead, which is a separate conversation.
 */
export function consumesRound(items: FeedbackItem[]): boolean {
  return items.some((i) => i.kind === 'change');
}

export interface RevisionState {
  used: number;
  included: number;
  remaining: number;
  /** True when the NEXT in-scope revision request would be billable. */
  nextIsBillable: boolean;
  /** One line, written for the client. */
  clientLine: string;
}

/**
 * Where they stand, said plainly.
 *
 * The count is shown to the client rather than tracked quietly. It makes
 * people gather their thoughts into one considered list instead of firing off
 * three emails, and it means the day a round becomes billable is never a
 * surprise — which is the version of this that damages a relationship.
 */
export function revisionState(used: number, included = INCLUDED_REVISION_ROUNDS): RevisionState {
  const safeUsed = Math.max(0, Math.floor(used));
  const remaining = Math.max(0, included - safeUsed);
  return {
    used: safeUsed,
    included,
    remaining,
    nextIsBillable: remaining === 0,
    /*
     * What they have left, not what they are looking at.
     *
     * This used to read "This is revision 1 of the 2 included" underneath the
     * original concept — which tells a client they have spent half their
     * allowance before saying a word about it. Exhibit A is explicit that the
     * concept is not a revision: "an original visual design concept for
     * review; up to two (2) rounds of revisions". What a round is called now
     * comes from designStage(); this line only reports the allowance.
     */
    clientLine: revisionAllowanceLine(safeUsed),
  };
}

/**
 * Read what the client submitted, refusing anything we cannot act on.
 *
 * Every field is bounded. This form is the one place a client types long-form
 * text that lands on the studio's dashboard, and an unbounded string is how a
 * feedback form becomes a way to make a page unreadable.
 */
export interface FeedbackDraft {
  ok: boolean;
  error?: string;
  submission?: FeedbackSubmission;
}

const MAX_ITEMS = 25;
const MAX_AREA = 120;
const MAX_DETAIL = 2000;
const MAX_NOTE = 4000;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function readFeedbackDraft(input: unknown): FeedbackDraft {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Nothing was submitted.' };
  }
  const body = input as Record<string, unknown>;
  const rawItems = Array.isArray(body.items) ? body.items : [];

  const items: FeedbackItem[] = [];
  for (const raw of rawItems.slice(0, MAX_ITEMS)) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const detail = cleanText(row.detail, MAX_DETAIL);
    // A row with no detail is an empty row somebody added and did not fill
    // in. Dropping it silently is right — refusing the whole submission over
    // a blank row would lose everything else they wrote.
    if (!detail) continue;
    if (!isFeedbackKind(row.kind)) {
      return { ok: false, error: 'Each note needs to say which kind of change it is.' };
    }
    items.push({
      area: cleanText(row.area, MAX_AREA) ?? 'The design overall',
      kind: row.kind,
      detail,
    });
  }

  const liked = cleanText(body.liked, MAX_NOTE);
  const note = cleanText(body.note, MAX_NOTE);

  if (items.length === 0 && !note) {
    return {
      ok: false,
      error: "Tell us at least one thing you'd like changed, or leave a note — otherwise there's nothing for us to act on.",
    };
  }

  return { ok: true, submission: { liked, items, note } };
}

/**
 * The studio's read of a submission: what is owed free, what spends a round,
 * and what needs quoting.
 */
export interface FeedbackTriage {
  notAsAgreed: FeedbackItem[];
  changes: FeedbackItem[];
  newScope: FeedbackItem[];
  consumedRound: boolean;
  /** Worth a decision from a person before any work starts. */
  needsQuote: boolean;
}

export function triage(items: FeedbackItem[]): FeedbackTriage {
  const notAsAgreed = items.filter((i) => i.kind === 'not-as-agreed');
  const changes = items.filter((i) => i.kind === 'change');
  const newScope = items.filter((i) => i.kind === 'new');
  return {
    notAsAgreed,
    changes,
    newScope,
    consumedRound: changes.length > 0,
    needsQuote: newScope.length > 0,
  };
}

/**
 * The subject line and opening for the acknowledgement the client gets.
 *
 * They should hear back the moment they submit, and it should tell them what
 * happens next rather than merely confirming receipt. A form that swallows a
 * carefully written list in silence teaches people to phone instead.
 */
export function acknowledgement(
  t: FeedbackTriage,
  state: RevisionState,
  /**
   * What they will be sent next — "Revision 1", "Revision 2".
   *
   * Naming it is the difference between "we'll be in touch" and a client who
   * knows exactly where they are in a sequence they agreed to. Optional so
   * older callers keep the generic sentence rather than breaking.
   */
  nextStageLabel?: string
): string {
  const parts: string[] = [];
  const total = t.notAsAgreed.length + t.changes.length + t.newScope.length;
  parts.push(
    total === 1
      ? "Thanks — we've got your note and we're on it."
      : total === 2
      ? "Thanks — we've got both of your notes and we're on it."
      : `Thanks — we've got all ${total} of your notes and we're on it.`
  );
  if (t.notAsAgreed.length > 0) {
    // "2 of them say" is fine at three or more; at exactly two, with two
    // notes in total, it reads like a machine counting rather than a person
    // replying.
    const all = t.notAsAgreed.length === total;
    const howMany =
      t.notAsAgreed.length === 1
        ? 'One of them says something'
        : all && total === 2
        ? 'Both say something'
        : all
        ? 'They all say something'
        : `${t.notAsAgreed.length} of them say something`;
    parts.push(
      `${howMany} isn't what we agreed. We'll correct that at no charge, and it doesn't use up a revision round.`
    );
  }
  if (t.newScope.length > 0) {
    parts.push(
      `You've also asked for ${t.newScope.length === 1 ? 'something' : 'a few things'} we haven't discussed before — we'll look at ${t.newScope.length === 1 ? 'it' : 'those'} and come back to you separately.`
    );
  }
  /**
   * Past the allowance reads differently from having just reached it.
   *
   * "That's both of your rounds used" is the right sentence the moment the
   * second one goes; said again on the fourth request it sounds like the
   * software has lost count, which is worse than saying nothing.
   */
  const overLimit = state.used > state.included;
  if (t.consumedRound) {
    parts.push(
      overLimit
        ? `That's past the ${state.included} revision rounds included in your project, so we'll come back to you on this one before we start.`
        : state.remaining === 0
        ? "That's both of your included revision rounds used. We'll be in touch before we start on anything further."
        : `That's revision ${state.used} of ${state.included} used — you have ${state.remaining} left.`
    );
  }
  // Only promise the next version when it is actually the next thing to
  // happen. Having just said we'll check in first, following it with "we'll
  // be back with the next version shortly" contradicts itself in the same
  // breath — and it is the sentence they'll hold us to.
  const comingBackFirst = t.consumedRound && state.remaining === 0;
  parts.push(
    comingBackFirst
      ? "Nothing here is lost — we've got all of it written down."
      : nextStageLabel
      ? `We're working on ${nextStageLabel.toLowerCase()} now and we'll send it over as soon as it's ready.`
      : "We'll be back with the next version shortly."
  );
  return parts.join(' ');
}
