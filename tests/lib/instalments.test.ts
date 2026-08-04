import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The instalment engine turns a price into the three labelled payments the
 * contract promised. The failure modes worth pinning are all boundary
 * arithmetic: a schedule that doesn't sum to the price, a pay-in-full that
 * leaves a row unpaid, a partial that marks half an instalment, and email
 * copy that calls the final payment "Payment 2".
 */

const created: any[] = [];
const tx = {
  instalment: {
    create: vi.fn(async ({ data }: any) => {
      created.push(data);
      return data;
    }),
  },
} as any;

import {
  backfillSchedule,
  instalmentEmailCopy,
  instalmentDueDate,
  nextUnpaid,
  fullyPaid,
  seedInstalments,
} from '@/lib/instalments';

beforeEach(() => {
  created.length = 0;
  tx.instalment.create.mockClear();
});

describe('seeding', () => {
  it('a normal signing pays exactly the first instalment', async () => {
    await seedInstalments(tx, { id: 'p1', totalPrice: 2_000_000 }, 800_000, 'cs_1');

    expect(created).toHaveLength(3);
    expect(created[0]).toMatchObject({ index: 1, status: 'paid', stripeSessionId: 'cs_1' });
    expect(created[1]).toMatchObject({ index: 2, status: 'scheduled', paidAt: null });
    expect(created[2]).toMatchObject({ index: 3, status: 'scheduled' });
  });

  it('pay-in-full settles all three rows at once', async () => {
    await seedInstalments(tx, { id: 'p1', totalPrice: 2_000_000 }, 2_000_000, 'cs_1');

    expect(created.map((c) => c.status)).toEqual(['paid', 'paid', 'paid']);
    // The signing session id belongs to Payment 1 only — the column is unique.
    expect(created[0].stripeSessionId).toBe('cs_1');
    expect(created[1].stripeSessionId).toBeNull();
    expect(created[2].stripeSessionId).toBeNull();
  });

  it('a sub-threshold project seeds 50/25/25', async () => {
    await seedInstalments(tx, { id: 'p1', totalPrice: 1_500_000 }, 750_000, 'cs_1');

    expect(created.map((c) => c.percent)).toEqual([50, 25, 25]);
    expect(created.map((c) => c.amountCents)).toEqual([750_000, 375_000, 375_000]);
    expect(created[0].status).toBe('paid');
  });

  it('never marks half an instalment: an odd partial covers whole rows only', async () => {
    // $9,000 against a $20k schedule (8000/6000/6000): covers row 1, not row 2.
    await seedInstalments(tx, { id: 'p1', totalPrice: 2_000_000 }, 900_000, 'cs_1');

    expect(created.map((c) => c.status)).toEqual(['paid', 'scheduled', 'scheduled']);
  });

  it('labels rows exactly as the invoice will read', async () => {
    await seedInstalments(tx, { id: 'p1', totalPrice: 2_000_000 }, 0, null);

    expect(created.map((c) => c.label)).toEqual(['Payment 1 of 3', 'Payment 2 of 3', 'Payment 3 of 3']);
  });
});

describe('status helpers', () => {
  const rows = (statuses: string[]) =>
    statuses.map((status, i) => ({ index: i + 1, status })) as any[];

  it('nextUnpaid returns the lowest-index open row', () => {
    expect(nextUnpaid(rows(['paid', 'due', 'scheduled']))?.index).toBe(2);
    expect(nextUnpaid(rows(['paid', 'paid', 'scheduled']))?.index).toBe(3);
    expect(nextUnpaid(rows(['paid', 'paid', 'paid']))).toBeNull();
  });

  it('fullyPaid is false for an empty schedule — legacy projects are not "paid off"', () => {
    expect(fullyPaid([])).toBe(false);
    expect(fullyPaid(rows(['paid', 'paid', 'paid']) as any)).toBe(true);
    expect(fullyPaid(rows(['paid', 'void', 'void']) as any)).toBe(true);
    expect(fullyPaid(rows(['paid', 'due', 'paid']) as any)).toBe(false);
  });
});

describe('the per-payment email copy', () => {
  const ctx = { company: 'Northgate', contactName: 'Priya', projectName: 'Northgate — Custom Website' };

  it('payment 2 leads with the design approval, not the invoice', () => {
    const copy = instalmentEmailCopy({ index: 2, count: 3, label: 'Payment 2 of 3', amountCents: 600_000 }, ctx);

    expect(copy.subject).toContain('Design approved');
    expect(copy.subject).toContain('Payment 2 of 3');
    expect(copy.bodyHtml).toContain('$6,000');
    expect(copy.ctaLabel).toContain('$6,000');
  });

  it('payment 3 leads with launch and says it is the last one', () => {
    const copy = instalmentEmailCopy({ index: 3, count: 3, label: 'Payment 3 of 3', amountCents: 600_000 }, ctx);

    expect(copy.subject).toContain('Ready to launch');
    expect(copy.bodyHtml).toContain('the last payment');
  });

  it('escapes client-controlled strings — a company name is not markup', () => {
    const copy = instalmentEmailCopy(
      { index: 2, count: 3, label: 'Payment 2 of 3', amountCents: 100 },
      { ...ctx, projectName: '<script>alert(1)</script>' }
    );

    expect(copy.bodyHtml).not.toContain('<script>');
    expect(copy.bodyHtml).toContain('&lt;script&gt;');
  });

  it('addresses a contactless client as "there" rather than null', () => {
    const copy = instalmentEmailCopy(
      { index: 2, count: 3, label: 'Payment 2 of 3', amountCents: 100 },
      { ...ctx, contactName: null }
    );

    expect(copy.bodyHtml).toContain('Hi there');
    expect(copy.bodyHtml).not.toContain('null');
  });
});

describe('due dates', () => {
  it('lands fourteen days out, matching the contract terms', () => {
    const from = new Date('2026-08-04T12:00:00Z');
    expect(instalmentDueDate(from).toISOString().slice(0, 10)).toBe('2026-08-18');
  });
});

/**
 * The backfill is the riskiest arithmetic in the file, because it runs
 * against projects that have already taken real money. The failure that
 * matters is not a rounding cent — it is billing a client for a dollar they
 * have already paid, which is what marking only whole rows paid would do to
 * every legacy 50/50 project above the threshold.
 */
describe('backfilling a project that predates the schedule', () => {
  it('gives an untouched project the plain schedule', () => {
    const rows = backfillSchedule(2_000_000, 0);

    expect(rows.map((r) => r.percent)).toEqual([40, 30, 30]);
    expect(rows.map((r) => r.amountCents)).toEqual([800_000, 600_000, 600_000]);
    expect(rows.every((r) => !r.paid)).toBe(true);
  });

  it('marks a fully paid project settled across every row', () => {
    const rows = backfillSchedule(1_000_000, 1_000_000);

    expect(rows.every((r) => r.paid)).toBe(true);
    expect(rows.reduce((s, r) => s + r.amountCents, 0)).toBe(1_000_000);
  });

  it('never re-bills money a legacy 50/50 project already took', () => {
    // $30,000 job, half paid under the old two-payment split. The standard
    // first row is $12,000 — so a whole-rows-only backfill would leave
    // $3,000 of paid money sitting inside Payment 2 of 3.
    const rows = backfillSchedule(3_000_000, 1_500_000);

    expect(rows[0]).toMatchObject({ amountCents: 1_500_000, paid: true, percent: 50 });
    expect(rows.slice(1).every((r) => !r.paid)).toBe(true);
    // What is still owed is exactly what is still owed.
    const outstanding = rows.filter((r) => !r.paid).reduce((s, r) => s + r.amountCents, 0);
    expect(outstanding).toBe(1_500_000);
  });

  it('keeps the rows summing to the contracted price on an awkward split', () => {
    for (const [total, paid] of [
      [1_999_999, 333_333],
      [3_000_001, 1_000_000],
      [777_777, 1],
      [2_000_000, 1_999_999],
    ]) {
      const rows = backfillSchedule(total, paid);
      expect(rows.reduce((s, r) => s + r.amountCents, 0)).toBe(total);
      expect(rows.every((r) => r.amountCents >= 0)).toBe(true);
    }
  });

  it('still labels the rows as positions in one schedule', () => {
    const rows = backfillSchedule(3_000_000, 1_500_000);

    expect(rows.map((r) => r.label)).toEqual(['Payment 1 of 3', 'Payment 2 of 3', 'Payment 3 of 3']);
    expect(rows.map((r) => r.trigger)).toEqual(['signing', 'design-approval', 'ready-for-launch']);
  });

  it('treats an overpaid project as settled rather than producing a negative row', () => {
    const rows = backfillSchedule(1_000_000, 1_200_000);

    expect(rows.every((r) => r.paid)).toBe(true);
    expect(rows.every((r) => r.amountCents > 0)).toBe(true);
  });
});
