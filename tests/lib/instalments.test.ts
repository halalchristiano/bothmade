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

import { instalmentEmailCopy, instalmentDueDate, nextUnpaid, fullyPaid, seedInstalments } from '@/lib/instalments';

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
