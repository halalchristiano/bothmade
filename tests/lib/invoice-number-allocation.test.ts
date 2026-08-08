import { describe, expect, it, vi } from 'vitest';
import { createInvoiceRow, describeChargeBlocker } from '@/lib/billing';

/**
 * Allocating the invoice number, which nothing tested.
 *
 * `createInvoiceRow` is called from three places — the charges route, the
 * instalments route, and the Stripe webhook — and it is the only thing in the
 * app that decides what an invoice is CALLED. The schema is blunt about why
 * that matters: the column is unique "because two invoices sharing a number
 * is the one accounting error nobody can untangle afterwards."
 *
 * It allocates by counting this year's invoices and adding one, which is a
 * read-then-write race by construction. Two charges raised in the same instant
 * both count N and both try BM-2026-000(N+1); the loser comes back from
 * Postgres with P2002, the unique-constraint code, and the loop re-counts and
 * takes the next number. Everything about that — the format, the sequence,
 * retrying only on P2002, rethrowing anything else, and giving up after five
 * attempts rather than spinning — was documented and unheld.
 *
 * A mutation sweep found it: inverting `code !== 'P2002'` (so it rethrows the
 * race and swallows real faults) passed the entire suite. So did letting a
 * zero-amount charge line through, further down the same file.
 *
 * Both call sites handle a null return correctly, which is why this is a test
 * gap and not a bug — the behaviour is right, it just had nothing defending it.
 */

const P2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

/** A database that hands out numbers, and fails the first `failures` writes. */
function db(existing: number, failures = 0) {
  let attempts = 0;
  const create = vi.fn(async (args: { data: Record<string, unknown> }) => {
    attempts += 1;
    if (attempts <= failures) throw P2002;
    return {
      id: `inv_${attempts}`,
      number: String(args.data.number),
      createdAt: new Date('2026-08-08T00:00:00Z'),
    };
  });
  // Counting climbs as the losers of a race commit their rows, which is what
  // makes a retry pick the NEXT number rather than the same one again.
  const count = vi.fn(async (_args: unknown) => existing + Math.min(attempts, failures));
  return { invoice: { count, create }, _create: create, _count: count };
}

const INPUT = {
  clientId: 'client_1',
  projectId: 'proj_1',
  description: 'Payment 2 of 3 — Acme Site',
  lineItems: [{ label: 'Payment 2 of 3 (30% of project total)', priceCents: 600_000 }],
  amountCents: 600_000,
};

const NOW = new Date('2026-08-08T09:00:00Z');

describe('the number it hands out', () => {
  it('starts a year at 0001', async () => {
    const d = db(0);

    const row = await createInvoiceRow(d, INPUT, NOW);

    expect(row?.number).toBe('BM-2026-0001');
  });

  it('takes the next one after the invoices already raised this year', async () => {
    const d = db(6);

    const row = await createInvoiceRow(d, INPUT, NOW);

    expect(row?.number).toBe('BM-2026-0007');
  });

  /** The year comes from the clock it is handed, not from today. */
  it('numbers by the year of the invoice, not the year of the process', async () => {
    const d = db(3);

    const row = await createInvoiceRow(d, INPUT, new Date('2027-01-02T00:00:00Z'));

    expect(row?.number).toBe('BM-2027-0004');
    // And only counts that year's invoices when deciding.
    const countArgs = d._count.mock.calls[0]![0] as unknown as {
      where: { number: { startsWith: string } };
    };
    expect(countArgs.where.number.startsWith).toBe('BM-2027-');
  });
});

/**
 * Two charges raised at the same instant.
 *
 * This is not hypothetical here: staff raise charges from the billing page
 * while the webhook raises them for instalments paid at signing, and nothing
 * serialises the two.
 */
describe('losing the race for a number', () => {
  it('retries on P2002 and takes the next number instead', async () => {
    const d = db(6, 1);

    const row = await createInvoiceRow(d, INPUT, NOW);

    expect(d._create).toHaveBeenCalledTimes(2);
    // First attempt wanted 0007 and lost; the retry re-counts and takes 0008.
    expect(String(d._create.mock.calls[0]![0].data.number)).toBe('BM-2026-0007');
    expect(row?.number).toBe('BM-2026-0008');
  });

  it('keeps trying through several collisions', async () => {
    const d = db(0, 3);

    const row = await createInvoiceRow(d, INPUT, NOW);

    expect(d._create).toHaveBeenCalledTimes(4);
    expect(row?.number).toBe('BM-2026-0004');
  });

  /**
   * The condition that makes the retry a retry rather than a swallow.
   *
   * Inverting it passed the whole suite. A real fault — a bad foreign key, a
   * dead connection — would be retried five times and then reported as "could
   * not allocate a number", which is advice for a thing that will fail
   * identically every time, and the actual error would never reach a log.
   */
  it('rethrows anything that is not a number collision', async () => {
    const boom = Object.assign(new Error('connection terminated'), { code: 'P1017' });
    const create = vi.fn(async () => {
      throw boom;
    });
    const d = { invoice: { count: vi.fn(async (_a: unknown) => 6), create } };

    await expect(createInvoiceRow(d, INPUT, NOW)).rejects.toThrow('connection terminated');
    // Once. Not five times.
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rethrows an error with no code at all', async () => {
    const create = vi.fn(async () => {
      throw new Error('something unlabelled');
    });
    const d = { invoice: { count: vi.fn(async (_a: unknown) => 0), create } };

    await expect(createInvoiceRow(d, INPUT, NOW)).rejects.toThrow('something unlabelled');
  });

  /**
   * Giving up beats spinning. Both callers read the null: the instalments
   * route answers 503 with "try again", and the webhook leaves the instalment
   * without an invoice number rather than dying mid-payment.
   */
  it('gives up after five attempts rather than looping forever', async () => {
    const d = db(0, 99);

    const row = await createInvoiceRow(d, INPUT, NOW);

    expect(row).toBeNull();
    expect(d._create).toHaveBeenCalledTimes(5);
  });
});

describe('what it writes down', () => {
  it('records money already taken as settled rather than owed', async () => {
    const d = db(0);
    const paidAt = new Date('2026-08-08T10:00:00Z');

    await createInvoiceRow(d, { ...INPUT, status: 'paid', paidAt }, NOW);

    expect(d._create.mock.calls[0]![0].data).toMatchObject({
      status: 'paid',
      paidAt,
    });
  });

  it('defaults to open, because an invoice is a request for money', async () => {
    const d = db(0);

    await createInvoiceRow(d, INPUT, NOW);

    expect(d._create.mock.calls[0]![0].data).toMatchObject({
      status: 'open',
      paidAt: null,
    });
  });

  it('carries the line items through, since the PDF is rebuilt from them', async () => {
    const d = db(0);

    await createInvoiceRow(d, INPUT, NOW);

    expect(d._create.mock.calls[0]![0].data.lineItems).toEqual(INPUT.lineItems);
  });
});

/**
 * The other survivor from the same sweep, further down the same file.
 *
 * A zero-amount line passed validation with `cents <= 0` relaxed to `< 0`.
 * The total check does not catch it: one $250 line beside one $0 line totals
 * $250 and clears the minimum, so the $0 line reaches the invoice PDF and
 * Stripe as a line item asking for nothing.
 */
describe('a charge line with no money on it', () => {
  const base = { hasCustomer: true, description: 'Extra landing page' };

  it('is blocked even when the rest of the charge is fine', () => {
    expect(
      describeChargeBlocker({
        ...base,
        lines: [
          { label: 'Landing page', amount: '250' },
          { label: 'Goodwill', amount: '0' },
        ],
      })
    ).toMatch(/amount above zero/i);
  });

  it('lets a charge through when every line has money on it', () => {
    expect(
      describeChargeBlocker({
        ...base,
        lines: [
          { label: 'Landing page', amount: '250' },
          { label: 'Copy pass', amount: '75.50' },
        ],
      })
    ).toBeNull();
  });
});
