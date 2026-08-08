import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCsv } from '@/lib/csv';

/**
 * The ledger as a file.
 *
 * There was no way to get any of this out. The screen shows a hundred rows at
 * a time and the answer to "send me the quarter" was reading them off it, or
 * a database console — both of which produce a number nobody can check.
 *
 * What is pinned here is the part that would be silent if it broke: that the
 * file covers every matching row rather than the page, that it answers the
 * same question the screen was asking, and that a client-typed description
 * cannot execute when the accountant opens it.
 */

const prisma = { invoice: { findMany: vi.fn() } };
const requireStaff = vi.fn();
const requireRole = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));
vi.mock('@/lib/authz', () => ({
  ANY_STAFF: ['owner', 'sales'],
  requireRole: (...a: unknown[]) => requireRole(...a),
}));

const { GET } = await import('@/app/api/admin/billing/charges/export/route');

const INVOICE = {
  id: 'inv_1',
  number: 'BM-2026-0031',
  description: 'Second round of homepage design',
  lineItems: [
    { label: 'Design round', priceCents: 90_000 },
    { label: 'Copywriting', priceCents: 30_000 },
  ],
  amountCents: 120_000,
  status: 'open',
  refundedCents: 0,
  refundMethod: null,
  refundReason: null,
  voidReason: null,
  createdAt: new Date('2026-03-16T10:00:00.000Z'),
  paidAt: null,
  paidMethod: null,
  sentToEmail: 'dana@northgate.test',
  sendCount: 3,
  client: { company: 'Northgate Dental', email: 'dana@northgate.test' },
  project: { name: 'Northgate — Website' },
  issuedBy: { name: 'Evan', email: 'evan@bothmade.studio' },
  payments: [],
};

const request = (search = '') =>
  ({ nextUrl: new URL(`https://bothmade.test/api/admin/billing/charges/export${search}`) }) as unknown as Parameters<
    typeof GET
  >[0];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  requireStaff.mockResolvedValue({ userId: 'user_1', type: 'user', role: 'owner' });
  requireRole.mockReturnValue(null);
  prisma.invoice.findMany.mockResolvedValue([INVOICE]);
});

describe('who may download it', () => {
  it('turns away anybody not signed in', async () => {
    requireStaff.mockResolvedValue(null);

    expect((await GET(request())).status).toBe(401);
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it('defers to the role check rather than deciding for itself', async () => {
    requireRole.mockReturnValue(new Response('{}', { status: 403 }));

    expect((await GET(request())).status).toBe(403);
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });
});

describe('what lands in the file', () => {
  it('is a download, not a page', async () => {
    const res = await GET(request());

    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    // Money that moved since the last download must not come from a cache.
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('carries the money twice — readable, and machine-safe', async () => {
    const rows = parseCsv(await (await GET(request())).text());

    const header = rows[0];
    const row = rows[1];
    expect(row[header.indexOf('Amount')]).toBe('1200.00');
    // The cents column survives a spreadsheet deciding "$1,200.00" is text.
    expect(row[header.indexOf('Amount (cents)')]).toBe('120000');
  });

  it('carries what a person needs to reconcile it', async () => {
    const rows = parseCsv(await (await GET(request())).text());
    const header = rows[0];
    const row = rows[1];

    expect(row[header.indexOf('Invoice')]).toBe('BM-2026-0031');
    expect(row[header.indexOf('Raised')]).toBe('2026-03-16');
    expect(row[header.indexOf('Client')]).toBe('Northgate Dental');
    expect(row[header.indexOf('Raised by')]).toBe('Evan');
    expect(row[header.indexOf('Times sent')]).toBe('3');
    expect(row[header.indexOf('Line items')]).toBe('Design round (900.00); Copywriting (300.00)');
  });

  /* Part paid is a state the file has to be able to say, or the reconciled
     total and the invoice total disagree with nothing to explain them. */
  it('says part paid, and how much of it arrived', async () => {
    prisma.invoice.findMany.mockResolvedValue([{ ...INVOICE, payments: [{ amount: 60_000 }] }]);

    const rows = parseCsv(await (await GET(request())).text());
    const header = rows[0];

    expect(rows[1][header.indexOf('State')]).toBe('Part paid');
    expect(rows[1][header.indexOf('Received (cents)')]).toBe('60000');
  });

  it('names the reason an invoice changed', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { ...INVOICE, status: 'void', voidReason: 'Raised against the wrong project' },
    ]);

    const rows = parseCsv(await (await GET(request())).text());

    expect(rows[1][rows[0].indexOf('Reason')]).toBe('Raised against the wrong project');
  });
});

describe('the question it answers', () => {
  /*
   * Every matching row, not the page. A partial export is the worst kind of
   * wrong: it looks complete, and the person checking it against a bank
   * statement is checking the bank statement.
   */
  it('is not capped at the hundred the screen shows', async () => {
    await GET(request());

    expect(prisma.invoice.findMany.mock.calls[0][0].take).toBeGreaterThan(100);
  });

  it('carries the bucket and the search through', async () => {
    await GET(request('?status=open&q=northgate'));

    const where = prisma.invoice.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('open');
    expect(JSON.stringify(where.OR)).toContain('northgate');
  });

  it('exports everything when nothing is selected', async () => {
    await GET(request());

    const where = prisma.invoice.findMany.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
    expect(where.OR).toBeUndefined();
  });

  it('names the file after what is in it', async () => {
    const open = await GET(request('?status=open'));
    expect(open.headers.get('content-disposition')).toContain('invoices-open-');

    const all = await GET(request());
    expect(all.headers.get('content-disposition')).toContain('invoices-all-');
  });
});

/**
 * A spreadsheet treats a leading =, +, - or @ as a formula, and these values
 * are what a client is called and what somebody typed an invoice was for. A
 * description beginning "=HYPERLINK(...)" runs when the accountant opens it.
 */
describe('a description that is trying to be a formula', () => {
  it('does not hand the accountant something that executes', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { ...INVOICE, description: '=HYPERLINK("http://evil.test","Click")' },
    ]);

    const text = await (await GET(request())).text();

    // Still readable — blanking it would change what the invoice says it was
    // for, on the copy that goes to the accountant.
    expect(text).toContain('HYPERLINK');
    // But no cell starts with the character that makes it a formula.
    for (const row of parseCsv(text)) {
      for (const cell of row) expect(cell.startsWith('=')).toBe(false);
    }
  });

  it('keeps a comma or a quote from tearing the row apart', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { ...INVOICE, description: 'Round 2, "final" — with notes' },
    ]);

    const rows = parseCsv(await (await GET(request())).text());

    expect(rows[1]).toHaveLength(rows[0].length);
    expect(rows[1][rows[0].indexOf('For')]).toBe('Round 2, "final" — with notes');
  });
});
