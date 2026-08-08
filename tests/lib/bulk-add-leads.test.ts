import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pasting a list of companies, and what happens to the ones that don't fit.
 *
 * One paste may create 200 leads. That is a reasonable bound on a write loop
 * inside a single transaction, and it was applied by a bare `.slice(0, 200)`
 * that told nobody: paste 250 companies and the answer was `{ count: 200 }`,
 * which the modal rendered as "Added 200 companies" before emptying the box.
 * Fifty companies were neither added nor refused nor recoverable — the only
 * copy of that list had just been cleared out of the textarea by the same
 * click that reported success.
 *
 * The cap stays. What it drops is now counted and sent back, because the
 * only useful thing to do with a truncated paste is put the remainder in
 * front of somebody again.
 */

const create = vi.fn((args: unknown) => ({ __create: args }));
const prisma = {
  lead: { create: (args: unknown) => create(args) },
  // The route hands $transaction an array of prepared creates; resolving to
  // the same array keeps `created.length` honest without pretending to be a
  // database.
  $transaction: vi.fn(async (ops: unknown[]) => ops),
};

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ type: 'user', userId: 'user_evan', email: 'e@bothmade.studio', role: 'sales' }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));

const { POST, BULK_ADD_LIMIT } = await import('@/app/api/admin/leads/bulk/route');

const post = async (body: unknown) => {
  const res = await POST(
    new Request('https://bothmade.studio/api/admin/leads/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  );
  return { status: res.status, body: await res.json() };
};

/** `n` distinct company names, so nothing passes by accident of duplication. */
const companies = (n: number) => Array.from({ length: n }, (_, i) => `Company ${i + 1}`);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pasting a list of companies', () => {
  it('creates one lead per line, owned by whoever pasted it', async () => {
    const { status, body } = await post({ lines: ['Acme Roofing', 'Bell Joinery'], status: 'new' });

    expect(status).toBe(201);
    expect(body.count).toBe(2);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0]).toMatchObject({
      data: { company: 'Acme Roofing', status: 'new', assignedToId: 'user_evan' },
    });
  });

  it('reads "Company, email" pairs, and ignores a second field that is not one', async () => {
    await post({ lines: ['Acme Roofing, hi@acme.test', 'Bell Joinery, 0161 496 0000'] });

    const [first, second] = create.mock.calls.map((c) => c[0] as { data: { email: string | null } });
    expect(first.data.email).toBe('hi@acme.test');
    expect(second.data.email).toBeNull();
  });

  it('says nothing was skipped when nothing was', async () => {
    const { body } = await post({ lines: companies(3) });

    expect(body.count).toBe(3);
    expect(body.skipped).toBe(0);
  });
});

describe('a paste bigger than one paste holds', () => {
  it('adds the first 200 and says how many it did not', async () => {
    const { status, body } = await post({ lines: companies(250) });

    expect(status).toBe(201);
    expect(body.count).toBe(BULK_ADD_LIMIT);
    /*
     * The number the modal needs to keep the leftovers in the box. Without
     * it the only signal is a count of 200 against a paste of 250, which
     * requires the reader to have counted their own paste.
     */
    expect(body.skipped, 'the rows past the cap have to be counted out loud').toBe(50);
    expect(body.limit).toBe(BULK_ADD_LIMIT);
  });

  it('drops from the end, so "the remaining lines" means the last ones', async () => {
    await post({ lines: companies(250) });

    const created = create.mock.calls.map((c) => (c[0] as { data: { company: string } }).data.company);
    expect(created).toHaveLength(BULK_ADD_LIMIT);
    expect(created[0]).toBe('Company 1');
    expect(created.at(-1)).toBe(`Company ${BULK_ADD_LIMIT}`);
    // Which is what lets the client put `lines.slice(limit)` back in the box
    // and have it be the right fifty.
    expect(created).not.toContain(`Company ${BULK_ADD_LIMIT + 1}`);
  });

  it('does not spend the budget on blank lines', async () => {
    // A list pasted out of a spreadsheet is half empty rows. Counting them
    // against the cap would drop real companies to make room for nothing.
    const padded = companies(BULK_ADD_LIMIT).flatMap((c) => [c, '', '   ']);

    const { body } = await post({ lines: padded });

    expect(body.count).toBe(BULK_ADD_LIMIT);
    expect(body.skipped).toBe(0);
  });
});

describe('what it refuses', () => {
  it('refuses an empty list', async () => {
    const { status } = await post({ lines: [] });
    expect(status).toBe(400);
  });

  it('refuses a status that is not a lead status', async () => {
    const { status, body } = await post({ lines: ['Acme'], status: 'won-ish' });

    expect(status).toBe(400);
    expect(body.error).toMatch(/status/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a list of nothing but separators', async () => {
    const { status } = await post({ lines: [',', ' , ', ''] });
    expect(status).toBe(400);
  });

  /*
   * `lines` arrives as JSON and is only ever checked for being an array.
   * A number in it reached `.trim()` and took the whole request down as a
   * 500 — an error page for what is a bad row, and one that says nothing
   * about which row.
   */
  it('skips a row that is not a line rather than failing the paste', async () => {
    const { status, body } = await post({ lines: ['Acme Roofing', 42, null, { company: 'x' }] });

    expect(status).toBe(201);
    expect(body.count).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
