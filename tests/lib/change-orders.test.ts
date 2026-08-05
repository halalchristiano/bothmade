import { describe, expect, it } from 'vitest';
import {
  applyScope,
  changeOrderNumber,
  committedRemovals,
  deltaCents,
  readChangeOrderDraft,
  recutSchedule,
  removalCredit,
  type ChangeOrderItem,
  type ScheduleRow,
} from '@/lib/change-orders';

/**
 * These are the contract, expressed as arithmetic. Each one names the clause
 * it comes from, because the answer to "why does it do that" is never in the
 * code — it is in Section 9, and a future reader deserves the pointer.
 */

const add = (label: string, priceCents: number): ChangeOrderItem => ({ label, priceCents, kind: 'add' });
const remove = (label: string, priceCents: number, workStarted = false): ChangeOrderItem => ({
  label,
  priceCents,
  kind: 'remove',
  workStarted,
});

describe('what a change is worth', () => {
  it('adds what is being added', () => {
    expect(deltaCents([add('Booking integration', 300_000)])).toBe(300_000);
  });

  /**
   * §9: "Where the Client asks to remove an add-on or separately priced item
   * before any work on it has begun, the Total Fee reduces by that item's
   * listed price."
   */
  it('takes off an untouched item in full', () => {
    expect(deltaCents([remove('SEO Foundations', 150_000)])).toBe(-150_000);
    expect(removalCredit(remove('SEO Foundations', 150_000))).toBe(150_000);
  });

  /**
   * §9: "Once work on an item has begun, its price is committed: removing it
   * no longer reduces the Fee, though the Agency will deliver whatever of it
   * exists."
   */
  it('takes nothing off an item whose work has started', () => {
    expect(deltaCents([remove('SEO Foundations', 150_000, true)])).toBe(0);
    expect(removalCredit(remove('SEO Foundations', 150_000, true))).toBe(0);
  });

  it('nets adds against removals', () => {
    expect(deltaCents([add('Booking integration', 300_000), remove('SEO', 150_000)])).toBe(150_000);
  });

  it('names the removals that cost nothing, so nobody has to notice', () => {
    const items = [remove('SEO', 150_000, true), remove('Analytics', 50_000)];

    expect(committedRemovals(items).map((i) => i.label)).toEqual(['SEO']);
  });
});

describe('recalculating the schedule', () => {
  // $20,000 at 40/30/30, first payment settled.
  const schedule: ScheduleRow[] = [
    { index: 1, label: 'Payment 1 of 3', amountCents: 800_000, percent: 40, status: 'paid' },
    { index: 2, label: 'Payment 2 of 3', amountCents: 600_000, percent: 30, status: 'scheduled' },
    { index: 3, label: 'Payment 3 of 3', amountCents: 600_000, percent: 30, status: 'scheduled' },
  ];

  /**
   * §9: "later Instalments recalculate accordingly." The paid one is not a
   * later instalment — it is history.
   */
  it('leaves a paid instalment alone and spreads the change over the rest', () => {
    const result = recutSchedule(schedule, 2_300_000);

    expect(result.rows.map((r) => r.newAmountCents)).toEqual([800_000, 750_000, 750_000]);
    expect(result.newTotalCents).toBe(2_300_000);
  });

  /**
   * A "due" row is a number sitting in the client's inbox on a live payment
   * link. Re-pricing it would mean the invoice they are reading and the
   * invoice in our books are different documents.
   */
  it('freezes an instalment that has already been invoiced', () => {
    const invoiced = schedule.map((r) => (r.index === 2 ? { ...r, status: 'due' } : r));

    const result = recutSchedule(invoiced, 2_300_000);

    expect(result.rows.map((r) => r.newAmountCents)).toEqual([800_000, 600_000, 900_000]);
    expect(result.rows.filter((r) => r.frozen).map((r) => r.index)).toEqual([1, 2]);
  });

  it('works downward too', () => {
    const result = recutSchedule(schedule, 1_700_000);

    expect(result.rows.map((r) => r.newAmountCents)).toEqual([800_000, 450_000, 450_000]);
    expect(result.newTotalCents).toBe(1_700_000);
  });

  /**
   * The rounding remainder has to land somewhere, and it lands on the last
   * row — three instalments that don't add up to the total printed above them
   * is the one arithmetic error a client always spots.
   */
  it('always sums to the new total, to the cent', () => {
    // Awkward totals on purpose — anything above the $8,000 already paid,
    // since below that the schedule cannot go lower than the money already
    // collected and reports an overpayment instead (covered separately).
    for (const total of [1_000_001, 2_333_333, 800_001, 1_999_999]) {
      expect(recutSchedule(schedule, total).newTotalCents).toBe(total);
    }
  });

  it('keeps the proportions the rows already had', () => {
    const uneven: ScheduleRow[] = [
      { index: 1, label: 'Payment 1 of 3', amountCents: 500_000, percent: 50, status: 'paid' },
      { index: 2, label: 'Payment 2 of 3', amountCents: 300_000, percent: 30, status: 'scheduled' },
      { index: 3, label: 'Payment 3 of 3', amountCents: 200_000, percent: 20, status: 'scheduled' },
    ];

    // $5,000 paid, $10,000 left to spread in a 3:2 ratio.
    const result = recutSchedule(uneven, 1_500_000);

    expect(result.rows.map((r) => r.newAmountCents)).toEqual([500_000, 600_000, 400_000]);
  });

  /**
   * A reduction big enough that the client has already paid more than the job
   * is now worth. A schedule cannot express a negative instalment, so the
   * remaining rows go to zero and the excess is named for the refund
   * conversation it actually is.
   */
  it('reports an overpayment rather than inventing a negative instalment', () => {
    const result = recutSchedule(schedule, 500_000);

    expect(result.rows.map((r) => r.newAmountCents)).toEqual([800_000, 0, 0]);
    expect(result.overpaidCents).toBe(300_000);
  });

  it('ignores voided rows entirely', () => {
    const withVoid = [...schedule, { index: 4, label: 'Cancelled', amountCents: 999, percent: 0, status: 'void' }];

    const result = recutSchedule(withVoid, 2_000_000);

    expect(result.rows).toHaveLength(3);
    expect(result.newTotalCents).toBe(2_000_000);
  });

  it('splits evenly when there are no proportions to preserve', () => {
    const zeroed: ScheduleRow[] = [
      { index: 1, label: 'Payment 1 of 2', amountCents: 0, percent: 0, status: 'scheduled' },
      { index: 2, label: 'Payment 2 of 2', amountCents: 0, percent: 0, status: 'scheduled' },
    ];

    const result = recutSchedule(zeroed, 1_000_000);

    expect(result.rows.map((r) => r.newAmountCents)).toEqual([500_000, 500_000]);
  });
});

describe('reading a change order', () => {
  const items = [{ label: 'Booking integration', priceCents: 300_000, kind: 'add' }];

  it('derives the delta from the lines rather than trusting a total', () => {
    const result = readChangeOrderDraft({ summary: 'Adding online booking', items });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.deltaCents).toBe(300_000);
  });

  it('demands a summary — it is what the client signs', () => {
    expect(readChangeOrderDraft({ summary: '  ', items }).ok).toBe(false);
  });

  it('demands at least one line', () => {
    expect(readChangeOrderDraft({ summary: 'x', items: [] }).ok).toBe(false);
  });

  it('demands each line say whether it is going in or out', () => {
    const result = readChangeOrderDraft({
      summary: 'x',
      items: [{ label: 'Something', priceCents: 1000 }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/added or removed/i);
  });

  it('refuses a line with no amount, naming which line', () => {
    const result = readChangeOrderDraft({
      summary: 'x',
      items: [{ label: 'Booking integration', priceCents: 0, kind: 'add' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Booking integration/);
  });

  /**
   * A change order that moves no money is not a change order — it is a scope
   * note. Saying so is more useful than letting someone sign a document whose
   * effect is nil, and the commonest cause is worth spelling out.
   */
  it('refuses one that changes nothing, and explains the usual cause', () => {
    const result = readChangeOrderDraft({
      summary: 'Dropping SEO',
      items: [{ label: 'SEO', priceCents: 150_000, kind: 'remove', workStarted: true }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already been started/i);
  });

  it('takes a timeline extension, and refuses a silly one', () => {
    // §9: "Change Orders extend the Project timeline by an amount reasonably
    // determined by the Agency."
    const ok = readChangeOrderDraft({ summary: 'x', items, timelineExtensionDays: 14 });
    expect(ok.ok && ok.draft.timelineExtensionDays).toBe(14);

    const negative = readChangeOrderDraft({ summary: 'x', items, timelineExtensionDays: -5 });
    expect(negative.ok && negative.draft.timelineExtensionDays).toBe(0);

    const huge = readChangeOrderDraft({ summary: 'x', items, timelineExtensionDays: 10_000 });
    expect(huge.ok && huge.draft.timelineExtensionDays).toBe(365);
  });

  it('caps how many lines one order can carry', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ label: `Line ${i}`, priceCents: 1000, kind: 'add' }));

    expect(readChangeOrderDraft({ summary: 'x', items: many }).ok).toBe(false);
  });
});

describe('numbering', () => {
  it('counts up within a project', () => {
    expect(changeOrderNumber(1)).toBe('CO-1');
    expect(changeOrderNumber(12)).toBe('CO-12');
  });
});

describe('what the project scope becomes', () => {
  const label = (key: string) => ({ seo: 'SEO Foundations', hosting: 'Managed Hosting' })[key] ?? key;
  const scope = { addOns: 'seo,hosting', customItems: [{ label: 'Bespoke calculator', priceCents: 200_000 }] };

  it('files added work as a custom item', () => {
    const result = applyScope(scope, [add('Booking integration', 300_000)], label);

    expect(result.customItems.map((c) => c.label)).toEqual(['Bespoke calculator', 'Booking integration']);
    expect(result.addOns).toBe('seo,hosting');
  });

  it('removes a catalogue add-on by the name a person would type', () => {
    // Nobody writing a change order types `seo`.
    const result = applyScope(scope, [remove('SEO Foundations', 150_000)], label);

    expect(result.addOns).toBe('hosting');
  });

  it('removes a custom item by its label', () => {
    const result = applyScope(scope, [remove('Bespoke calculator', 200_000)], label);

    expect(result.customItems).toEqual([]);
    expect(result.addOns).toBe('seo,hosting');
  });

  /**
   * §9: "removing it no longer reduces the Fee, though the Agency will
   * deliver whatever of it exists." It is still being delivered, so taking it
   * out of the scope list would misdescribe what the client gets.
   */
  it('leaves a started item in the scope, since it is still delivered', () => {
    const result = applyScope(scope, [remove('SEO Foundations', 150_000, true)], label);

    expect(result.addOns).toBe('seo,hosting');
  });

  it('leaves the scope alone when a label matches nothing', () => {
    // The fee still moves — it comes from the signed document. The scope
    // fields are a convenience view, and a typo must not block a reprice.
    const result = applyScope(scope, [remove('Somthing mistyped', 50_000)], label);

    expect(result.addOns).toBe('seo,hosting');
    expect(result.customItems).toHaveLength(1);
  });

  it('handles a project with no add-ons at all', () => {
    const result = applyScope({ addOns: '', customItems: [] }, [add('Extra page', 50_000)], label);

    expect(result.addOns).toBe('');
    expect(result.customItems).toHaveLength(1);
  });
});
