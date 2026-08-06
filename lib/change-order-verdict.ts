import { INCLUDED_REVISIONS } from '@/lib/design-stages';

/**
 * Is this change contractually allowed, and at what price?
 *
 * The change order panel would happily raise a fee for something the contract
 * already includes, and would just as happily let a new feature be waved
 * through as "a small tweak" during Build, where it is the most expensive
 * thing anybody can agree to. Both mistakes are made by the same person on
 * the same screen, and the contract answers both — it just answers them in
 * five different sections, none of which anybody reads mid-conversation.
 *
 * So this reads them. Two inputs: how big the change is, and where the
 * project has got to. Out comes the ruling, in the words of the clause it
 * came from.
 *
 * The clauses in play:
 *
 *   §5  Discovery ends at Requirements Sign-off, and that "fixes the scope.
 *       From that point, changes travel through Section 9 as Change Orders
 *       rather than through conversation." Before that gate, nothing is a
 *       change order — the requirements summary has not been agreed yet.
 *
 *   §4  "Each major Milestone includes up to two (2) rounds of revisions at no
 *       additional charge for changes consistent with the originally agreed
 *       scope; additional or materially different revisions are billable as a
 *       Change Order."
 *
 *   Exhibit A  Design is "an original visual design concept for review; up to
 *       two (2) rounds of revisions".
 *
 *   §9  Work not in scope — "new features, pages, integrations, or substantial
 *       revisions to accepted Deliverables" — is a Change Order, and "no such
 *       work begins until the Client approves the additional scope and fee in
 *       writing." Also: "Where a Change Order requires re-architecting
 *       completed work, the quote reflects that rework cost in addition to the
 *       new feature."
 *
 *   §9/§10  A change order extends the timeline, and that extension is not
 *       Agency delay.
 *
 * What this does NOT do is decide whether a given request is minor or major.
 * Nothing in a database can read a sentence in an email and tell you whether
 * "can we move the booking button" is a nudge or a re-architecture. A person
 * says which, on the radio button, and this says what follows from it.
 */

/** How big the change is, in the contract's own terms. */
export type ChangeScale = 'minor' | 'major';

export const CHANGE_SCALES: Array<{
  value: ChangeScale;
  label: string;
  hint: string;
}> = [
  {
    value: 'minor',
    label: 'Minor — a revision',
    hint: 'Consistent with what was already agreed: colours, copy, layout, moving something that already exists.',
  },
  {
    value: 'major',
    label: 'Major — new scope',
    hint: 'A new feature, page, or integration, or something materially different from what was signed off.',
  },
];

export function readChangeScale(value: unknown): ChangeScale {
  return value === 'major' ? 'major' : 'minor';
}

/** Where the project has got to, as far as the contract's gates are concerned. */
export interface ProjectStage {
  /** "discovery" | "design" | "build" | "launch" | "complete" */
  status: string;
  designPresentedAt?: Date | string | null;
  designApprovedAt?: Date | string | null;
  /** In-scope revision rounds already spent under Exhibit A. */
  designRevisionsUsed?: number;
}

export type Ruling =
  /** Already covered. Raising a fee for it would be charging twice. */
  | 'included'
  /** A Change Order under Section 9 — quote it, and the client signs it. */
  | 'change_order'
  /** A Change Order that also has to price undoing finished work. */
  | 'change_order_with_rework';

export interface ChangeOrderVerdict {
  ruling: Ruling;
  /** Where the project is, said out loud: "Design — revision 1 of 2 used". */
  stageLabel: string;
  /** The answer, in one sentence. */
  headline: string;
  /** Why, in the contract's terms. One paragraph per point. */
  detail: string[];
  /** Which sections this came from, for the person who has to defend it. */
  clauses: string[];
  /** Whether anything should be billed at all. */
  chargeable: boolean;
  /** Section 9's rework surcharge applies — completed work has to be undone. */
  reworkLikely: boolean;
  /** What this does to the delivery date, or null where it does nothing. */
  timelineNote: string | null;
}

function has(value: Date | string | null | undefined): boolean {
  return Boolean(value);
}

const TIMELINE_NOTE =
  'Section 9 extends the timeline by a reasonable amount, and Section 10(b) puts that extension outside Agency delay — so set the days here rather than absorbing them quietly.';

/**
 * The ruling, and the reasoning behind it.
 *
 * Ordered by gate rather than by scale, because the gate is what changes the
 * answer most: the same request is free in Discovery, a revision round in
 * Design, and a rework quote in Build.
 */
export function changeOrderVerdict(
  scale: ChangeScale,
  project: ProjectStage
): ChangeOrderVerdict {
  const status = (project.status || '').toLowerCase();
  const revisionsUsed = Math.max(0, project.designRevisionsUsed ?? 0);
  const revisionsLeft = Math.max(0, INCLUDED_REVISIONS - revisionsUsed);
  const designApproved = has(project.designApprovedAt);
  const designPresented = has(project.designPresentedAt);

  // ---- Discovery: the scope is not fixed yet ------------------------------
  if (status === 'discovery') {
    return {
      ruling: 'included',
      stageLabel: 'Discovery — scope not yet fixed',
      headline: 'No change order. The scope has not been signed off yet.',
      detail: [
        'Section 5: Discovery concludes with a written requirements summary presented for Requirements Sign-off, and it is that gate — approval, or five Business Days of silence — that fixes the scope. Until it closes, there is nothing for a change to be a change from.',
        scale === 'major'
          ? 'Because this is new scope, it has to land in the requirements summary before the gate closes. The moment sign-off happens it stops being free and becomes a Change Order under Section 9, so write it in now rather than agreeing it in conversation.'
          : 'Fold it into the requirements summary and price the project once, at the gate.',
      ],
      clauses: ['Section 5', 'Section 9'],
      chargeable: false,
      reworkLikely: false,
      timelineNote: null,
    };
  }

  // ---- Design: the revision allowance is the whole question ---------------
  if (!designApproved && (status === 'design' || designPresented)) {
    const stageLabel =
      revisionsLeft === INCLUDED_REVISIONS
        ? `Design — presented for review, all ${INCLUDED_REVISIONS} revision rounds still available`
        : `Design — ${revisionsUsed} of ${INCLUDED_REVISIONS} revision rounds used, ${revisionsLeft} left`;

    if (scale === 'minor') {
      if (revisionsLeft > 0) {
        return {
          ruling: 'included',
          stageLabel,
          headline: `No change order. This is revision ${revisionsUsed + 1} of the ${INCLUDED_REVISIONS} included.`,
          detail: [
            'Exhibit A gives the Design milestone an original visual design concept plus up to two rounds of revisions, and Section 4 makes those free where the changes are "consistent with the originally agreed scope". This one is.',
            `After this there ${revisionsLeft - 1 === 1 ? 'is 1 round' : `are ${revisionsLeft - 1} rounds`} left. Log it as a revision so the count is right when somebody asks for a fourth version — that record is the only thing that makes the allowance real.`,
            'Section 4 also matters the other way: if this round is a correction to something that does not match what was signed off, it is a non-conformance and does not count against the allowance at all.',
          ],
          clauses: ['Section 4', 'Exhibit A'],
          chargeable: false,
          reworkLikely: false,
          timelineNote: null,
        };
      }
      return {
        ruling: 'change_order',
        stageLabel,
        headline: `Change order. Both included revision rounds are spent.`,
        detail: [
          `Exhibit A includes ${INCLUDED_REVISIONS} rounds of revisions on the Design milestone and ${revisionsUsed} have been used. Section 4: "additional or materially different revisions are billable as a Change Order."`,
          'Nothing here says no. It says quote it — and Section 9 says the work does not begin until the client has approved the scope and the fee in writing.',
          'Worth checking before you quote: a round spent correcting our own miss against the signed-off requirements is a non-conformance and should never have counted. If one of the two was that, put it back rather than billing for it.',
        ],
        clauses: ['Section 4', 'Section 9', 'Exhibit A'],
        chargeable: true,
        reworkLikely: false,
        timelineNote: TIMELINE_NOTE,
      };
    }

    return {
      ruling: 'change_order',
      stageLabel,
      headline: 'Change order. New scope is not a revision, whatever round we are on.',
      detail: [
        'Section 9: a new feature, page, or integration is scoped and quoted separately, and no work on it starts until the client approves the additional scope and fee in writing. The revision allowance in Exhibit A covers revisions to the presented design, not additions to it.',
        'This is the cheapest moment for it, though — nothing has been built against the design yet, so the quote is the new work and no more. Say that when you send it.',
      ],
      clauses: ['Section 5', 'Section 9'],
      chargeable: true,
      reworkLikely: false,
      timelineNote: TIMELINE_NOTE,
    };
  }

  // ---- After Design Approval: the design is an accepted Deliverable -------
  if (status === 'build' || status === 'launch' || designApproved) {
    const approvedNote =
      'The design has been approved — by the client or by the five-day Review Period lapsing under Section 4 — so it is an accepted Deliverable. That is the fact that changes the answer here.';

    /*
     * What the label says has to be true of this project, not of the branch.
     *
     * Approval is read from the stamp rather than the status column, which is
     * right — a review period that lapsed approves the design whether or not
     * anybody moved the dropdown. But it means this branch is reached by
     * projects that have not started Build, and telling somebody
     * "implementation under way" about a project where it is not is exactly
     * the sort of confident wrong sentence that stops a panel being trusted.
     */
    const stageLabel =
      status === 'launch'
        ? 'Launch — approved design, built and being readied to ship'
        : status === 'build'
          ? 'Build — approved design, implementation under way'
          : 'Design approved — the design is now an accepted Deliverable';

    if (scale === 'minor') {
      return {
        ruling: 'change_order',
        stageLabel,
        headline: 'Change order, unless it is genuinely trivial and in scope.',
        detail: [
          approvedNote,
          'Section 9 makes "substantial revisions to accepted Deliverables" a Change Order. Section 4 still allows Build its own two rounds of revisions for changes consistent with the agreed scope — so a small correction inside what was signed off is free, and anything beyond that is not.',
          'The line is whether the change is consistent with the signed-off requirements. If it is, take it as a revision of the current milestone and record it. If explaining it needs the words "while you are in there", it is scope, and it belongs on a change order.',
          status === 'launch'
            ? 'At Launch there is one more cost: the work has been QA-ed and is being readied to ship, so even a small change means re-testing. Price that, and say what it does to the date.'
            : status === 'build'
              ? 'Nothing here is unreasonable to say yes to. It is a question of whether it is billed, not whether it is allowed.'
              : 'Build has not started, so this is the cheapest it will ever be to change. If it is going to be asked for, it is worth asking now.',
        ],
        clauses: ['Section 4', 'Section 9'],
        chargeable: true,
        reworkLikely: false,
        timelineNote: TIMELINE_NOTE,
      };
    }

    return {
      ruling: 'change_order_with_rework',
      stageLabel,
      headline: 'Change order, and quote the rework as well as the new work.',
      detail: [
        approvedNote,
        'Section 9: new scope after sign-off is quoted separately and does not start until the client approves it in writing. And explicitly — "Where a Change Order requires re-architecting completed work, the quote reflects that rework cost in addition to the new feature."',
        'So this is two numbers, not one: what the new thing costs, and what it costs to undo and redo what is already built around the old decision. Quoting only the first is how a change order loses money on the work it authorises.',
        'Payment 2 has already fallen due on Design Approval under Section 7, so the schedule recut here only touches instalments the client has not been invoiced for.',
      ],
      clauses: ['Section 4', 'Section 7', 'Section 9'],
      chargeable: true,
      reworkLikely: true,
      timelineNote: TIMELINE_NOTE,
    };
  }

  // ---- Complete: the engagement is finished ------------------------------
  if (status === 'complete') {
    return {
      ruling: scale === 'major' ? 'change_order_with_rework' : 'change_order',
      stageLabel: 'Complete — launched and accepted',
      headline:
        scale === 'major'
          ? 'New work on a finished project. Quote it as its own engagement or a change order — not as support.'
          : 'Change order, unless it is a defect covered by the warranty.',
      detail: [
        'Final acceptance has happened, either by written acknowledgment of Launch or by the project going live (Section 4).',
        scale === 'major'
          ? 'Section 9 governs it if it stays on this agreement, and the quote covers the rework of shipped code as well as the new feature. If it is substantial enough to be its own project, price it as one.'
          : 'The line here is the warranty in Section 16: something not working as specified is a defect and is fixed at no charge. Something working exactly as specified that the client now wants different is new work, and Section 9 applies.',
      ],
      clauses: ['Section 4', 'Section 9', 'Section 16'],
      chargeable: true,
      reworkLikely: scale === 'major',
      timelineNote: null,
    };
  }

  // ---- Anything unrecognised -------------------------------------------
  // Deliberately the cautious answer rather than a guess. An unknown stage
  // means the verdict cannot be grounded in a gate, and "raise one" is the
  // outcome that keeps the fee and the scope on the same signed page.
  return {
    ruling: 'change_order',
    stageLabel: 'Stage unclear',
    headline: 'Raise a change order — the stage could not be read from the project.',
    detail: [
      'Nothing on this project says which gate it has passed, so the allowance in Section 4 and the sign-off in Section 5 cannot be applied to it here.',
      'Set the project status first, and this will answer properly. Until then Section 9 is the safe route: the client agrees the scope and the fee in writing before the work starts.',
    ],
    clauses: ['Section 9'],
    chargeable: true,
    reworkLikely: false,
    timelineNote: TIMELINE_NOTE,
  };
}
