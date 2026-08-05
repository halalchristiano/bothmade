import { instalmentSchedule } from '@/lib/pricing';

/**
 * Change Orders, as Section 9 of the contract defines them.
 *
 * Until now a project's price was fixed at the moment it was created and
 * there was no way to move it. Work agreed mid-build got billed as a separate
 * one-off charge, which meant the contracted total stayed wrong forever: the
 * instalment schedule described a price nobody was paying, and the client's
 * dashboard showed a job that cost less than they were being charged.
 *
 * The contract is unusually specific about how this works, so this module
 * follows it rather than inventing anything:
 *
 *   §9 "no such work begins until the Client approves the additional scope
 *       and fee in writing" — a change order is signed, not saved.
 *
 *   §9 "Scope can move down as well as up. Where the Client asks to remove an
 *       add-on or separately priced item BEFORE ANY WORK ON IT HAS BEGUN, the
 *       Total Fee reduces by that item's listed price ... Once work on an item
 *       has begun, its price is committed."
 *
 *   §9 "later Instalments recalculate accordingly."
 *
 *   §9 "Change Orders extend the Project timeline by an amount reasonably
 *       determined by the Agency."
 *
 * The word doing the most work is "later". An instalment that has already
 * been paid, or that has been invoiced and is sitting in the client's inbox,
 * is not a later instalment — it is a number the client has already been
 * given. Those freeze. Everything else absorbs the difference.
 */

/** An item being added to, or taken off, the scope. */
export interface ChangeOrderItem {
  label: string;
  /** Always positive. `kind` carries the direction, so a total can't be quietly negated by a typed minus sign. */
  priceCents: number;
  kind: 'add' | 'remove';
  /**
   * Only meaningful for a removal. Section 9: an item whose work has begun
   * keeps its price even when it comes out of scope, so removing it changes
   * what gets delivered and not what gets paid.
   */
  workStarted?: boolean;
  /** What the change actually is, in words the client will read. */
  description?: string;
}

export const MAX_ITEMS = 20;
export const MAX_LABEL_LENGTH = 120;
export const MAX_SUMMARY_LENGTH = 2000;

/**
 * What a removal is worth against the Total Fee.
 *
 * Zero once work has started — see §9. This is deliberately a named function
 * rather than an inline condition, because it is the rule most likely to be
 * argued about and the one a reader needs to find.
 */
export function removalCredit(item: ChangeOrderItem): number {
  return item.workStarted ? 0 : item.priceCents;
}

/** The signed change to the Total Fee. Positive adds, negative reduces. */
export function deltaCents(items: ChangeOrderItem[]): number {
  return items.reduce(
    (sum, item) => sum + (item.kind === 'add' ? item.priceCents : -removalCredit(item)),
    0
  );
}

/**
 * Items that come out of the delivery but stay in the price.
 *
 * Worth surfacing on its own rather than folding silently into the maths:
 * "we're removing this and it still costs what it cost" is the sentence most
 * likely to start an argument, and it is far better had before the client
 * signs than after they see an unchanged invoice.
 */
export function committedRemovals(items: ChangeOrderItem[]): ChangeOrderItem[] {
  return items.filter((item) => item.kind === 'remove' && item.workStarted);
}

export interface ScheduleRow {
  id?: string;
  index: number;
  label: string;
  amountCents: number;
  /** "scheduled" | "due" | "paid" | "void" */
  status: string;
  percent: number;
}

export interface RecutRow extends ScheduleRow {
  /** What this row becomes. Equal to amountCents when the row is frozen. */
  newAmountCents: number;
  /** True when the client has already been given this number and it cannot move. */
  frozen: boolean;
}

export interface Recut {
  rows: RecutRow[];
  /**
   * Sum of every row after the change. Equals the requested new total to the
   * cent — except where `overpaidCents` is non-zero, in which case the frozen
   * rows alone already exceed it and the schedule cannot go lower than the
   * money already collected.
   */
  newTotalCents: number;
  /**
   * True when the frozen rows alone already exceed the new total — a scope
   * reduction so large the client has paid more than the job is now worth.
   * The remaining rows go to zero and the excess is a refund conversation,
   * not something a schedule can express.
   */
  overpaidCents: number;
}

/**
 * Recalculate the instalments a change order is allowed to touch.
 *
 * Frozen: anything paid, anything invoiced (status "due"), anything voided.
 * A paid row is history. A "due" row is a number sitting in the client's
 * inbox attached to a live payment link, and silently re-pricing it would
 * mean the invoice they are looking at and the invoice in our books are
 * different documents.
 *
 * The rest share the remainder in the proportions they already had, with the
 * last row taking the rounding remainder so the schedule sums to the new
 * total exactly. Same technique as the original schedule and the legacy
 * backfill, for the same reason: three rows that don't add up to the price
 * printed above them is the one arithmetic error a client always spots.
 */
export function recutSchedule(rows: ScheduleRow[], newTotalCents: number): Recut {
  const live = rows.filter((row) => row.status !== 'void');
  const frozenRows = live.filter((row) => row.status === 'paid' || row.status === 'due');
  const movableRows = live.filter((row) => row.status !== 'paid' && row.status !== 'due');

  const frozenTotal = frozenRows.reduce((sum, row) => sum + row.amountCents, 0);
  const remaining = newTotalCents - frozenTotal;
  const overpaidCents = remaining < 0 ? -remaining : 0;
  const toDistribute = Math.max(0, remaining);

  const movableTotal = movableRows.reduce((sum, row) => sum + row.amountCents, 0);
  let allocated = 0;

  const recut = new Map<number, number>();
  movableRows.forEach((row, i) => {
    const isLast = i === movableRows.length - 1;
    const amount = isLast
      ? toDistribute - allocated
      : movableTotal > 0
        ? Math.round((toDistribute * row.amountCents) / movableTotal)
        : // A schedule whose movable rows are all zero has no proportions to
          // preserve, so an equal split is the only non-arbitrary answer.
          Math.round(toDistribute / movableRows.length);
    allocated += amount;
    recut.set(row.index, amount);
  });

  const out: RecutRow[] = live.map((row) => {
    const frozen = row.status === 'paid' || row.status === 'due';
    const newAmountCents = frozen ? row.amountCents : (recut.get(row.index) ?? 0);
    return {
      ...row,
      frozen,
      newAmountCents,
      percent: newTotalCents > 0 ? Math.round((newAmountCents / newTotalCents) * 100) : 0,
    };
  });

  return {
    rows: out,
    newTotalCents: out.reduce((sum, row) => sum + row.newAmountCents, 0),
    overpaidCents,
  };
}

export type ChangeOrderDraftResult =
  | { ok: true; draft: { summary: string; items: ChangeOrderItem[]; deltaCents: number; timelineExtensionDays: number } }
  | { ok: false; error: string };

/**
 * Reads a change order off the wire, or says why it isn't one.
 *
 * The total is derived from the items and never accepted from the caller, for
 * the same reason the one-off charge builder works that way: two numbers that
 * can disagree will, and the one that gets billed is never the one printed on
 * the document the client signed.
 */
export function readChangeOrderDraft(input: {
  summary?: unknown;
  items?: unknown;
  timelineExtensionDays?: unknown;
}): ChangeOrderDraftResult {
  const summary =
    typeof input.summary === 'string' ? input.summary.trim().slice(0, MAX_SUMMARY_LENGTH) : '';
  if (!summary) {
    return { ok: false, error: 'Describe the change — it is what the client is agreeing to.' };
  }

  const raw = Array.isArray(input.items) ? input.items : [];
  if (raw.length === 0) {
    return { ok: false, error: 'Add at least one thing being added or removed.' };
  }
  if (raw.length > MAX_ITEMS) {
    return { ok: false, error: `A change order can carry at most ${MAX_ITEMS} lines — combine a few.` };
  }

  const items: ChangeOrderItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      return { ok: false, error: 'Every line needs a description and an amount.' };
    }
    const { label, priceCents, kind, workStarted, description } = entry as Record<string, unknown>;
    if (typeof label !== 'string' || !label.trim()) {
      return { ok: false, error: 'Every line needs a description.' };
    }
    if (kind !== 'add' && kind !== 'remove') {
      return { ok: false, error: 'Every line has to say whether it is being added or removed.' };
    }
    if (typeof priceCents !== 'number' || !Number.isFinite(priceCents) || priceCents <= 0) {
      return { ok: false, error: `"${label.trim()}" needs an amount above zero.` };
    }
    items.push({
      label: label.trim().slice(0, MAX_LABEL_LENGTH),
      priceCents: Math.round(priceCents),
      kind,
      workStarted: kind === 'remove' ? workStarted === true : undefined,
      description:
        typeof description === 'string' && description.trim()
          ? description.trim().slice(0, MAX_SUMMARY_LENGTH)
          : undefined,
    });
  }

  const delta = deltaCents(items);
  if (delta === 0) {
    return {
      ok: false,
      error:
        committedRemovals(items).length > 0
          ? "That changes the scope but not the fee — everything being removed has already been started, so its price is committed. Say so in the summary and record it as a scope note instead."
          : 'That adds up to no change in the fee. Check the amounts.',
    };
  }

  const days = input.timelineExtensionDays;
  const timelineExtensionDays =
    typeof days === 'number' && Number.isFinite(days) && days >= 0 ? Math.round(Math.min(days, 365)) : 0;

  return { ok: true, draft: { summary, items, deltaCents: delta, timelineExtensionDays } };
}

export interface ProjectScope {
  /** Comma-separated catalogue add-on keys, as stored on Project.addOns. */
  addOns: string;
  /** [{ label, priceCents }], as stored on Project.customItems. */
  customItems: Array<{ label: string; priceCents: number }>;
}

/**
 * The project's scope after a change order is applied.
 *
 * Added lines land in `customItems`, which is exactly what that field is for
 * — ad-hoc work priced outside the catalogue. Removals try the catalogue
 * add-ons first and then the custom items, matched case-insensitively on the
 * label, because the person writing a change order types "SEO Foundations"
 * rather than the key `seo`.
 *
 * A removal that matches nothing still changes the fee. That is not a bug to
 * paper over: the fee comes from the signed document, and the scope fields are
 * a convenience view of it. Silently refusing to reprice because a label was
 * typed differently would be far worse than a scope list that needs a human
 * to tidy it.
 *
 * An item whose work has begun is left in the scope entirely — Section 9 says
 * it is still delivered ("the Agency will deliver whatever of it exists"), so
 * removing it from the list would misdescribe what the client gets.
 */
export function applyScope(
  scope: ProjectScope,
  items: ChangeOrderItem[],
  addOnLabel: (key: string) => string
): ProjectScope {
  const keys = scope.addOns.split(',').map((k) => k.trim()).filter(Boolean);
  let customItems = [...scope.customItems];
  let addOnKeys = [...keys];

  for (const item of items) {
    const wanted = item.label.trim().toLowerCase();

    if (item.kind === 'add') {
      customItems.push({ label: item.label, priceCents: item.priceCents });
      continue;
    }

    // Started work is still delivered, so it stays described in the scope.
    if (item.workStarted) continue;

    const keyIndex = addOnKeys.findIndex(
      (key) => key.toLowerCase() === wanted || addOnLabel(key).trim().toLowerCase() === wanted
    );
    if (keyIndex >= 0) {
      addOnKeys = addOnKeys.filter((_, i) => i !== keyIndex);
      continue;
    }

    const customIndex = customItems.findIndex((c) => c.label.trim().toLowerCase() === wanted);
    if (customIndex >= 0) {
      customItems = customItems.filter((_, i) => i !== customIndex);
    }
  }

  return { addOns: addOnKeys.join(','), customItems };
}

/** "CO-2" — sequential within a project, which is how anyone refers to them out loud. */
export function changeOrderNumber(sequence: number): string {
  return `CO-${sequence}`;
}

/**
 * A project that has no schedule yet still needs one after a change order,
 * or the new total has nowhere to be collected from.
 */
export function scheduleForTotal(totalCents: number): ScheduleRow[] {
  return instalmentSchedule(totalCents).map((row) => ({
    index: row.index,
    label: row.label,
    amountCents: row.amountCents,
    percent: row.percent,
    status: 'scheduled',
  }));
}
