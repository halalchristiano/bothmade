/**
 * One deal, start to finish, as a single row of steps.
 *
 * The information was always there — it was just spread across four screens
 * and two record types. Whether a business had been called lived in the
 * activity list; whether they'd seen a mockup lived on the lead; whether
 * they'd signed lived in a timestamp nobody surfaced; and whether they had
 * actually *paid* lived on a Project the rep who sold it never sees, because
 * a lead that converts disappears out of Sales and into Delivery.
 *
 * So the one question a salesperson asks about a deal a hundred times a day —
 * "where is this?" — could only be answered by assembling it in your head
 * from four places. This assembles it in one, from data the page already
 * loads, and it is deliberately a pure function: no prisma, no fetch, so the
 * stage rules can be tested as rules rather than as a rendered page.
 */

export type StepState = 'done' | 'current' | 'todo' | 'blocked';

export interface DealStep {
  key: string;
  label: string;
  state: StepState;
  /** When it happened, ISO, or null if it hasn't. */
  at: string | null;
  /** One line of context under the label. Never empty. */
  detail: string;
}

export interface DealTimelineInput {
  status: string;
  contractStatus: string;
  coldEmailSentAt: string | Date | null;
  agreementSignedAt: string | Date | null;
  proposalTotalPrice: number | null;
  latestMockupAt: string | Date | null;
  /** Newest first or oldest first — this reads types and dates, not order. */
  activities: Array<{ type: string; createdAt: string | Date }>;
  /** The project this lead became, if it ever did. */
  project: {
    instalments: Array<{
      index: number;
      label: string;
      amountCents: number;
      status: string;
      paidAt: string | Date | null;
      dueAt: string | Date | null;
    }>;
  } | null;
}

const iso = (value: string | Date | null | undefined): string | null =>
  value ? new Date(value).toISOString() : null;

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });

/** Oldest matching activity — "when did this first happen", not the latest repeat. */
function firstActivityAt(
  activities: DealTimelineInput['activities'],
  types: string[]
): string | null {
  const matching = activities
    .filter((a) => types.includes(a.type))
    .map((a) => new Date(a.createdAt).getTime())
    .filter((t) => !Number.isNaN(t));
  return matching.length > 0 ? new Date(Math.min(...matching)).toISOString() : null;
}

/**
 * The steps, in order, with exactly one marked `current` — the first thing
 * that hasn't happened yet. A deal that is finished has no current step,
 * which is how the strip renders "nothing to do here" without a label saying
 * so.
 *
 * `blocked` is not the same as `todo`: an instalment that cannot be invoiced
 * until the client approves their design is not work anyone is failing to
 * do, and colouring it like an overdue task would put a red mark on a
 * healthy deal.
 */
export function buildDealTimeline(lead: DealTimelineInput): DealStep[] {
  const steps: DealStep[] = [];
  const lost = lead.status === 'lost';

  // 1 — reached out at all.
  const contactedAt =
    firstActivityAt(lead.activities, ['call', 'email', 'loom']) ?? iso(lead.coldEmailSentAt);
  steps.push({
    key: 'contacted',
    label: 'Contacted',
    state: contactedAt ? 'done' : 'todo',
    at: contactedAt,
    detail: contactedAt ? 'First touch logged' : 'Nobody has spoken to them yet',
  });

  // 2 — showed them something. Optional in the sense that a deal can close
  // without one, but it is the single strongest predictor of one that does,
  // so it earns a step rather than hiding inside the activity list.
  const mockupAt = iso(lead.latestMockupAt);
  steps.push({
    key: 'mockup',
    label: 'Mockup shown',
    state: mockupAt ? 'done' : 'todo',
    at: mockupAt,
    detail: mockupAt ? 'They have seen a build' : 'No mockup attached',
  });

  // 3 — the sign-and-pay link went out.
  const proposalAt =
    firstActivityAt(lead.activities, ['proposal']) ??
    (lead.contractStatus !== 'not_sent' ? iso(lead.coldEmailSentAt) : null);
  const proposalSent = Boolean(proposalAt) || lead.contractStatus === 'sent' || lead.contractStatus === 'signed';
  steps.push({
    key: 'proposal',
    label: 'Proposal sent',
    state: proposalSent ? 'done' : 'todo',
    at: proposalAt,
    detail: proposalSent
      ? lead.proposalTotalPrice
        ? `${money(lead.proposalTotalPrice)} quoted`
        : 'Sign-and-pay link sent'
      : lead.proposalTotalPrice
        ? `${money(lead.proposalTotalPrice)} built, not sent`
        : 'Nothing quoted yet',
  });

  // 4 — they agreed.
  const signedAt = iso(lead.agreementSignedAt);
  steps.push({
    key: 'signed',
    label: 'Signed',
    state: signedAt ? 'done' : 'todo',
    at: signedAt,
    detail: signedAt ? 'Agreement accepted' : 'Not signed yet',
  });

  // 5+ — the money, which is the half of the deal Sales could never see.
  const instalments = lead.project?.instalments ?? [];
  if (instalments.length === 0) {
    steps.push({
      key: 'payment-1',
      label: 'Payment 1 of 3',
      state: 'todo',
      at: null,
      detail: signedAt ? 'Signed, not yet paid' : 'Nothing paid',
    });
  } else {
    for (const inst of [...instalments].sort((a, b) => a.index - b.index)) {
      const paid = inst.status === 'paid';
      const invoiced = inst.status === 'due';
      steps.push({
        key: `payment-${inst.index}`,
        label: inst.label,
        state: paid ? 'done' : invoiced ? 'todo' : 'blocked',
        at: iso(inst.paidAt),
        detail: paid
          ? `${money(inst.amountCents)} received`
          : invoiced
            ? `${money(inst.amountCents)} invoiced${inst.dueAt ? `, due ${new Date(inst.dueAt).toLocaleDateString()}` : ''}`
            : `${money(inst.amountCents)} at its gate`,
      });
    }
  }

  /**
   * Exactly one current step: the first thing not yet done that is still
   * worth doing. A blocked step can't be current — you cannot act on it — so
   * the pointer passes over it.
   *
   * And it never points backwards past work the deal has already overtaken.
   * A signed, part-paid deal that never had a mockup attached was being told
   * "Next: show them a mockup", which is advice from three stages ago about
   * a gap that can no longer be filled — the client has already bought.
   * Once a deal is signed, the pre-sale steps are history, not a to-do list.
   */
  if (!lost) {
    const settled = steps.findLastIndex((s) => s.state === 'done');
    const candidates = steps.filter((s, i) => s.state === 'todo' && i > settled);
    const next = candidates[0] ?? null;
    if (next) next.state = 'current';
  }

  return steps;
}

/** How far along, 0–1, for the bar under the strip. */
export function dealProgress(steps: DealStep[]): number {
  if (steps.length === 0) return 0;
  return steps.filter((s) => s.state === 'done').length / steps.length;
}

/**
 * The one sentence worth putting at the top of the page. Deliberately names
 * the *next action*, not the current state: "Signed" tells a rep nothing they
 * can do, and "Send Payment 1 of 3" tells them everything.
 */
export function nextAction(steps: DealStep[]): string {
  const current = steps.find((s) => s.state === 'current');
  if (!current) {
    return steps.every((s) => s.state === 'done')
      ? 'Nothing outstanding — this one is done.'
      : 'Waiting on a milestone. Nothing to send yet.';
  }
  switch (current.key) {
    case 'contacted':
      return 'Next: get them on the phone.';
    case 'mockup':
      return 'Next: show them a mockup.';
    case 'proposal':
      return 'Next: send the sign-and-pay link.';
    case 'signed':
      return 'Next: chase the signature.';
    default:
      return `Next: collect ${current.label}.`;
  }
}
