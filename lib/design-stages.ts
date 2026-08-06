/**
 * What round this is, in the words the contract uses.
 *
 * Exhibit A gives the Design milestone "an original visual design concept for
 * review; up to two (2) rounds of revisions". Three things, and the first one
 * is not a revision — but the dashboard called the opening concept "revision
 * 1 of the 2 included", which reads to a client as though they had already
 * spent half their allowance before saying a word about it.
 *
 * So the sequence is named here, once, and everything that says it out loud —
 * the email, the client's dashboard, the studio's Design page — says it the
 * same way:
 *
 *   round 1  Initial design      the concept. Costs nothing from the allowance.
 *   round 2  Revision 1          the first of the two included rounds.
 *   round 3  Revision 2          the last included round.
 *   round 4+ Further revision    beyond the allowance — a Change Order (§9).
 *
 * The round number is already stored and already advances on presentation.
 * What was missing was a shared answer to "what do we call it", and the two
 * places that answered it independently disagreed.
 */

/** How many rounds of revisions the contract includes after the concept. */
export const INCLUDED_REVISIONS = 2;

export interface DesignStage {
  /** 1-based, matching Project.designRound. */
  round: number;
  /** "Initial design", "Revision 1"… */
  label: string;
  /** One line saying what this round is, for a client who has not read §4. */
  meaning: string;
  /** True once we are past the two included rounds. */
  billable: boolean;
}

export function designStage(round: number): DesignStage {
  const safe = Math.max(1, Math.floor(round) || 1);

  if (safe === 1) {
    return {
      round: 1,
      label: 'Initial design',
      meaning:
        'This is the original design concept — the first look at the direction, not a revision. Your project includes two rounds of changes after this one, and neither of them has been used yet.',
      billable: false,
    };
  }

  const revisionNumber = safe - 1;
  if (revisionNumber <= INCLUDED_REVISIONS) {
    const last = revisionNumber === INCLUDED_REVISIONS;
    return {
      round: safe,
      label: `Revision ${revisionNumber}`,
      meaning: last
        ? `This is revision ${revisionNumber} — the second and last of the two rounds of changes included in your project. Anything after this is quoted separately before we start, so there are no surprises.`
        : `This is revision ${revisionNumber} of the two rounds of changes included in your project. One more is included after this.`,
      billable: false,
    };
  }

  return {
    round: safe,
    label: `Further revision ${revisionNumber - INCLUDED_REVISIONS}`,
    meaning:
      'Both of the included rounds of changes have been used. This one is beyond the allowance in your agreement, so it is quoted as a change order and nothing starts until you have agreed the scope and cost in writing.',
    billable: true,
  };
}

/**
 * What the next presentation will be called.
 *
 * Used when a client has just asked for changes and is being told what
 * happens now: naming the thing they are about to receive is the difference
 * between "we'll be in touch" and a client who knows where they are.
 */
export function nextDesignStage(currentRound: number): DesignStage {
  return designStage(Math.max(1, Math.floor(currentRound) || 1) + 1);
}

/**
 * Where a project stands on its allowance, for a client.
 *
 * Counted from rounds actually consumed rather than from the round number:
 * a client whose entire response was "this isn't what we agreed" has been
 * given a non-conformance, which Exhibit C fixes free and outside the
 * allowance, so their next version is still revision 1.
 */
export function revisionAllowanceLine(used: number): string {
  const spent = Math.max(0, Math.floor(used));
  const left = Math.max(0, INCLUDED_REVISIONS - spent);

  if (left === INCLUDED_REVISIONS) {
    return `Both rounds of changes included in your project are still available.`;
  }
  if (left === 1) {
    return `One of your two included rounds of changes has been used. One is left.`;
  }
  return `Both of the rounds of changes included in your project have been used. We'll still read anything you send — we'll just come back to you with a quote before starting, so nothing is a surprise.`;
}
