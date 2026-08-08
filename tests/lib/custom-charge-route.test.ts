import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Raising a custom charge is the one action here that takes money from a real
 * customer, so what's pinned is the set of ways it could go wrong quietly:
 * a charge with no record behind it, a record with no invoice, a client
 * billed twice because a button was clicked twice, and info@ not getting its
 * copy because the client's send failed.
 */

const prisma = {
  project: { findUnique: vi.fn() },
  instalment: { findMany: vi.fn() },
  payment: { aggregate: vi.fn() },
  invoice: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
  user: { findUnique: vi.fn() },
};

const requireStaff = vi.fn();
const put = vi.fn();
const paymentLinksCreate = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));
vi.mock('@vercel/blob', () => ({ put: (...args: unknown[]) => put(...args) }));
vi.mock('stripe', () => ({
  default: class {
    paymentLinks = { create: (...args: unknown[]) => paymentLinksCreate(...args) };
  },
}));
vi.mock('@/lib/invoice-pdf', () => ({
  buildCustomChargeInvoicePdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));
vi.mock('@/lib/email', () => ({
  sendCustomChargeEmail: vi.fn(async () => ({ sent: true })),
  sendInvoiceRecordEmail: vi.fn(async () => true),
}));

const { POST, GET } = await import('@/app/api/admin/billing/charges/route');
const { sendCustomChargeEmail, sendInvoiceRecordEmail } = await import('@/lib/email');
const { buildCustomChargeInvoicePdf } = await import('@/lib/invoice-pdf');

function request(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

/*
 * The year in an invoice number is the year the invoice is raised.
 *
 * These read `BM-2026-0007` as a literal, which is only true while it is
 * 2026: `formatInvoiceNumber` stamps `new Date().getFullYear()`, so this file
 * goes red at midnight on 1 January and stays red. Not flaky — dated. It has
 * a fuse rather than a race, which is worse, because the day it fires is the
 * day nobody has context for it.
 *
 * Derived from the same clock the route reads, so the assertion says what it
 * means: the seventh invoice of whatever year it currently is.
 */
const YEAR = new Date().getFullYear();
const seventh = `BM-${YEAR}-0007`;
const eighth = `BM-${YEAR}-0008`;

const CHARGE = {
  projectId: 'proj_1',
  description: 'Second round of homepage design',
  lineItems: [{ label: 'Design round', priceCents: 120000 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  /*
   * Reset, not just cleared — these two carry queues.
   *
   * The ledger-totals tests below arm `groupBy` with two
   * `mockResolvedValueOnce` values (status buckets, then the refund split) and
   * `create` with one. `vi.clearAllMocks()` empties `mock.calls` and leaves
   * those queues exactly where they were, so any test that returns before
   * consuming them hands the leftovers to whichever test runs next — which
   * under `--sequence.shuffle` is a different one every time.
   *
   * That is what happened: the instalment-flag test read the status buckets
   * where it expected an empty groupBy, and failed in four runs out of five
   * while passing in file order. The same leak class as the copy-button one,
   * two rounds ago, which is why it is written down rather than just fixed.
   */
  prisma.invoice.groupBy.mockReset();
  prisma.invoice.create.mockReset();

  /*
   * Every collaborator the GET handler touches, armed here rather than inside
   * whichever describe happened to need it first.
   *
   * These two were stubbed only in the ledger-totals block, so in file order
   * the instalment tests below inherited them and passed — and under
   * `--sequence.shuffle`, running first, they got `undefined` back from
   * payment.aggregate, threw inside the route, and asserted against a 500.
   * Setup that belongs to the route belongs to every test of it.
   */
  prisma.instalment.findMany.mockResolvedValue([]);
  prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  requireStaff.mockResolvedValue({ userId: 'user_evan', type: 'user', role: 'sales' });
  prisma.project.findUnique.mockResolvedValue({
    id: 'proj_1',
    clientId: 'client_1',
    name: 'Acme — Website',
    client: {
      id: 'client_1',
      company: 'Acme Dental',
      contactName: 'Priya Raman',
      email: 'priya@acme.test',
      archivedAt: null,
    },
  });
  prisma.invoice.findFirst.mockResolvedValue(null);
  prisma.invoice.count.mockResolvedValue(6);
  prisma.invoice.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'inv_1',
    createdAt: new Date('2026-08-04T10:00:00Z'),
    ...data,
  }));
  prisma.invoice.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'inv_1',
    number: seventh,
    amountCents: 120000,
    ...data,
  }));
  prisma.user.findUnique.mockResolvedValue({ name: 'Evan', email: 'evan@bothmade.studio' });
  put.mockResolvedValue({ url: 'https://blob.test/invoices/custom/inv_1-abc.pdf' });
  paymentLinksCreate.mockResolvedValue({ id: 'plink_1', url: 'https://pay.stripe.test/plink_1' });

  /*
   * Re-armed every test, like the two above them.
   *
   * These two are declared in their `vi.mock` factories rather than up here,
   * so they were the only collaborators nothing reset — and three tests below
   * push them into a failure mode permanently (`mockRejectedValue`,
   * `mockResolvedValue({ sent: false })`). `vi.clearAllMocks()` clears call
   * history and leaves implementations alone, so once one of those ran, every
   * later test in the file got a PDF builder that throws and a mailer that
   * reports failure.
   *
   * It passed only because of the order the tests happen to be written in.
   * Running the file with `--sequence.shuffle` failed three of them — and the
   * next person to add a test above the "when half of it fails" block, or to
   * move one, would have got that failure with no idea why.
   */
  vi.mocked(buildCustomChargeInvoicePdf).mockResolvedValue(new Uint8Array([1, 2, 3]));
  vi.mocked(sendCustomChargeEmail).mockResolvedValue({ sent: true });
});

describe('authorisation', () => {
  it('refuses anyone who is not staff', async () => {
    requireStaff.mockResolvedValue(null);

    const res = await POST(request(CHARGE));

    expect(res.status).toBe(401);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  /**
   * Sales is deliberately allowed here while it is denied the client and
   * project routes — billing a customer for extra work is Evan's job, and
   * this is the whole reason the feature exists.
   */
  it('lets a sales account raise a charge', async () => {
    const res = await POST(request(CHARGE));
    expect(res.status).toBe(201);
  });
});

describe('raising the charge', () => {
  it('records the invoice, stores the PDF, and creates a payable link', async () => {
    const res = await POST(request(CHARGE));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.warnings).toEqual([]);

    expect(prisma.invoice.create.mock.calls[0][0].data).toMatchObject({
      number: seventh, // six already this year, so this is the seventh
      clientId: 'client_1',
      projectId: 'proj_1',
      amountCents: 120000,
      status: 'open',
      issuedById: 'user_evan',
    });

    expect(buildCustomChargeInvoicePdf).toHaveBeenCalledOnce();
    // A guessable blob path is a directory listing of who was charged what.
    expect(put.mock.calls[0][2]).toMatchObject({ access: 'public', addRandomSuffix: true });

    expect(prisma.invoice.update.mock.calls[0][0].data).toMatchObject({
      pdfUrl: 'https://blob.test/invoices/custom/inv_1-abc.pdf',
      paymentUrl: 'https://pay.stripe.test/plink_1',
      stripePaymentLinkId: 'plink_1',
      sentToEmail: 'priya@acme.test',
    });
  });

  it('carries the invoice on the Stripe metadata so the webhook can settle it', async () => {
    await POST(request(CHARGE));

    expect(paymentLinksCreate.mock.calls[0][0].metadata).toMatchObject({
      existingProjectId: 'proj_1',
      invoiceId: 'inv_1',
      paymentType: 'custom',
    });
  });

  it('emails the client and copies info@, both with the PDF attached', async () => {
    await POST(request(CHARGE));

    const clientCall = vi.mocked(sendCustomChargeEmail).mock.calls[0][0];
    expect(clientCall.toEmail).toBe('priya@acme.test');
    expect(clientCall.invoicePdf).toBeInstanceOf(Buffer);
    expect(clientCall.paymentUrl).toBe('https://pay.stripe.test/plink_1');

    const recordCall = vi.mocked(sendInvoiceRecordEmail).mock.calls[0][0];
    expect(recordCall.invoiceNumber).toBe(seventh);
    expect(recordCall.invoicePdf).toBeInstanceOf(Buffer);
    expect(recordCall.clientDelivered).toBe(true);
  });

  it('still files the studio copy when the client send fails', async () => {
    vi.mocked(sendCustomChargeEmail).mockResolvedValue({ sent: false, reason: 'mailbox full' });

    const body = await (await POST(request(CHARGE))).json();

    expect(sendInvoiceRecordEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendInvoiceRecordEmail).mock.calls[0][0].clientDelivered).toBe(false);
    expect(body.warnings.join(' ')).toMatch(/mailbox full/);
  });

  it('raises it for the record only when the client copy is switched off', async () => {
    await POST(request({ ...CHARGE, sendToClient: false }));

    expect(sendCustomChargeEmail).not.toHaveBeenCalled();
    expect(sendInvoiceRecordEmail).toHaveBeenCalledOnce();
    expect(prisma.invoice.update.mock.calls[0][0].data.sentToEmail).toBeNull();
  });
});

describe('when half of it fails', () => {
  it('still emails a PDF it could not file, and flags the missing link', async () => {
    put.mockRejectedValue(new Error('blob down'));

    const res = await POST(request(CHARGE));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(prisma.invoice.create).toHaveBeenCalledOnce();
    expect(prisma.invoice.update.mock.calls[0][0].data.pdfUrl).toBeNull();
    // It rendered — the client and info@ get it as an attachment. Only the
    // dashboard link is missing, and that is what the warning has to say.
    expect(vi.mocked(sendCustomChargeEmail).mock.calls[0][0].invoicePdf).toBeInstanceOf(Buffer);
    expect(body.warnings.join(' ')).toMatch(/no PDF link/i);
  });

  it('tells the client without claiming an attachment when the PDF cannot be rendered', async () => {
    vi.mocked(buildCustomChargeInvoicePdf).mockRejectedValue(new Error('pdf-lib blew up'));

    const res = await POST(request(CHARGE));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(vi.mocked(sendCustomChargeEmail).mock.calls[0][0].invoicePdf).toBeNull();
    expect(body.warnings.join(' ')).toMatch(/couldn't be generated/i);
  });

  it('keeps the charge when Stripe will not make a link, and says so', async () => {
    paymentLinksCreate.mockRejectedValue(new Error('stripe down'));

    const body = await (await POST(request(CHARGE))).json();

    expect(prisma.invoice.update.mock.calls[0][0].data.paymentUrl).toBeNull();
    expect(body.warnings.join(' ')).toMatch(/pay this online/i);
  });

  it('gives up rather than issuing an unnumbered invoice', async () => {
    prisma.invoice.create.mockRejectedValue(Object.assign(new Error('taken'), { code: 'P2002' }));

    const res = await POST(request(CHARGE));

    expect(res.status).toBe(500);
    expect(paymentLinksCreate).not.toHaveBeenCalled();
    expect(sendCustomChargeEmail).not.toHaveBeenCalled();
  });

  it('retries a taken number instead of failing the charge', async () => {
    prisma.invoice.create
      .mockRejectedValueOnce(Object.assign(new Error('taken'), { code: 'P2002' }))
      .mockResolvedValueOnce({ id: 'inv_1', number: eighth, createdAt: new Date() });

    const res = await POST(request(CHARGE));

    expect(res.status).toBe(201);
    expect(prisma.invoice.create).toHaveBeenCalledTimes(2);
  });
});

describe('guards', () => {
  it('refuses a second identical charge inside the double-click window', async () => {
    prisma.invoice.findFirst.mockResolvedValue({ number: seventh });

    const res = await POST(request(CHARGE));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.needsConfirmation).toBe(true);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('bills twice when that is genuinely what was meant', async () => {
    prisma.invoice.findFirst.mockResolvedValue({ number: seventh });

    const res = await POST(request({ ...CHARGE, confirmDuplicate: true }));

    expect(res.status).toBe(201);
    expect(prisma.invoice.create).toHaveBeenCalledOnce();
  });

  /*
   * The ordinary way a charge gets typed twice inside two minutes is that the
   * first one was wrong: raise it, spot the figure, cancel it, type it again.
   * A cancelled invoice has a dead pay link and a client who has been told to
   * ignore it, so it is not a twin of anything — and warning about it taught
   * whoever was doing the right thing to click through the warning.
   */
  it('does not treat a cancelled invoice as a duplicate', async () => {
    await POST(request(CHARGE));

    const where = prisma.invoice.findFirst.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: 'void' });
  });

  it('refuses to bill a decommissioned client', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'proj_1',
      clientId: 'client_1',
      name: 'Acme — Website',
      client: { id: 'client_1', company: 'Acme Dental', contactName: null, email: 'a@b.test', archivedAt: new Date() },
    });

    const res = await POST(request(CHARGE));

    expect(res.status).toBe(400);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('rejects a charge with no customer, no description, or no lines', async () => {
    expect((await POST(request({ ...CHARGE, projectId: '' }))).status).toBe(400);
    expect((await POST(request({ ...CHARGE, description: '' }))).status).toBe(400);
    expect((await POST(request({ ...CHARGE, lineItems: [] }))).status).toBe(400);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('404s on a project that no longer exists rather than inventing one', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    expect((await POST(request(CHARGE))).status).toBe(404);
  });
});

/**
 * The ledger's numbers.
 *
 * The list is capped at a hundred rows. Adding the money up on screen would
 * silently start under-reporting the day the hundred-and-first invoice is
 * raised — with no visible change, because a wrong total looks exactly like a
 * right one, and "how much is outstanding" is the only question anybody opens
 * this page to answer.
 */
describe('the ledger totals', () => {
  function listRequest(url = 'https://bothmade.test/api/admin/billing/charges') {
    return { nextUrl: new URL(url) } as unknown as Parameters<typeof GET>[0];
  }

  beforeEach(() => {
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.invoice.groupBy
      .mockResolvedValueOnce([
        { status: 'open', _sum: { amountCents: 340000 }, _count: { _all: 3 } },
        { status: 'paid', _sum: { amountCents: 900000 }, _count: { _all: 8 } },
        { status: 'void', _sum: { amountCents: 50000 }, _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { refundMethod: 'stripe', _sum: { refundedCents: 15000 } },
        { refundMethod: 'manual', _sum: { refundedCents: 4000 } },
        { refundMethod: 'credit', _sum: { refundedCents: 60000 } },
        { refundMethod: null, _sum: { refundedCents: 0 } },
      ]);
    prisma.invoice.count.mockResolvedValue(12);
  });

  it('counts the whole book, not the page', async () => {
    const body = await (await GET(listRequest())).json();

    expect(body.totals).toMatchObject({
      outstandingCents: 340000,
      outstandingCount: 3,
      paidCents: 900000,
      paidCount: 8,
      /*
       * Reported apart from paid rather than netted off it — "paid" and "paid
       * then given back" are different sentences. And a credit is not a
       * refund: a refund is cash that left the account, a credit is value the
       * client is owed with the money still here. $15,000 + $4,000 went out;
       * the $60,000 credit did not.
       */
      refundedCents: 19000,
      creditedCents: 60000,
      count: 12,
    });
  });

  /*
   * A row carrying refunded cents with no method predates the column. Guessing
   * "cash left" is the safer way to be wrong about a figure somebody
   * reconciles against a bank statement.
   */
  it('counts a refund of unrecorded method as money that went out', async () => {
    prisma.invoice.groupBy
      .mockReset()
      .mockResolvedValueOnce([{ status: 'open', _sum: { amountCents: 0 }, _count: { _all: 0 } }])
      .mockResolvedValueOnce([{ refundMethod: null, _sum: { refundedCents: 7500 } }]);

    const body = await (await GET(listRequest())).json();

    expect(body.totals.refundedCents).toBe(7500);
    expect(body.totals.creditedCents).toBe(0);
  });

  it('says when the list stops short rather than letting it read as all of them', async () => {
    const body = await (await GET(listRequest())).json();

    expect(body.truncated).toBe(true);
    expect(body.matching).toBe(12);
  });

  /*
   * Filtering the hundred newest rows in the browser answers "which of the
   * recent ones are unpaid". The question is "which are unpaid" — and the one
   * sitting there since March is exactly what a shared recency cap drops.
   */
  it('filters by status in the query, not on the rows that come back', async () => {
    await GET(listRequest('https://bothmade.test/api/admin/billing/charges?status=open'));

    expect(prisma.invoice.findMany.mock.calls[0][0].where).toMatchObject({ status: 'open' });
    // The money summary still covers everything — it does not follow the filter.
    expect(prisma.invoice.groupBy.mock.calls[0][0].where).toBeUndefined();
  });

  it('ignores a status nobody uses rather than returning an empty ledger', async () => {
    await GET(listRequest('https://bothmade.test/api/admin/billing/charges?status=nonsense'));

    expect(prisma.invoice.findMany.mock.calls[0][0].where.status).toBeUndefined();
  });

  /*
   * Typing in the box used to filter the rows already on screen — the hundred
   * most recent in whichever bucket was open. So searching past a hundred
   * invoices answered about the recent ones and said "nothing matches" about
   * the one from March, which is exactly what somebody hunts for when a
   * client rings about an old unpaid bill. A search that quietly means
   * "search the visible page" is worse than none, because it answers
   * confidently.
   */
  it('searches the books rather than the page', async () => {
    await GET(listRequest('https://bothmade.test/api/admin/billing/charges?q=northgate'));

    const or = prisma.invoice.findMany.mock.calls[0][0].where.OR;
    expect(or).toHaveLength(4);
    // The four things printed on the row, so all three ways somebody arrives
    // — a number off a bank statement, a company name off a phone call, a
    // half-remembered description — find it.
    expect(JSON.stringify(or)).toContain('northgate');
    expect(JSON.stringify(or)).toContain('insensitive');

    // The money summary is deliberately not narrowed by the search: it
    // answers "how much is outstanding", not "how much of what I typed".
    expect(prisma.invoice.groupBy.mock.calls[0][0].where).toBeUndefined();
  });

  it('combines the bucket and the search rather than letting one win', async () => {
    await GET(listRequest('https://bothmade.test/api/admin/billing/charges?status=open&q=acme'));

    const where = prisma.invoice.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('open');
    expect(where.OR).toHaveLength(4);
  });

  it('does not search on an empty box', async () => {
    await GET(listRequest('https://bothmade.test/api/admin/billing/charges?q=%20%20'));

    expect(prisma.invoice.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });
});

/**
 * The ledger lists every invoice raised — one-off charges and the three
 * scheduled payments on every project alike. They are settled completely
 * differently, and the row was offering an action that always refused: press
 * Send on an instalment, read a confirmation, press Send again, and get back
 * "send it from the project's payment schedule". Correct, and said far too
 * late.
 */
describe('telling the two kinds of invoice apart', () => {
  function listRequest() {
    return {
      nextUrl: new URL('https://bothmade.test/api/admin/billing/charges'),
    } as unknown as Parameters<typeof GET>[0];
  }

  beforeEach(() => {
    // groupBy answers twice here — once for the status buckets, once for the
    // refund split — so both are queued rather than sharing one value.
    prisma.invoice.groupBy.mockResolvedValue([]);
    prisma.invoice.count.mockResolvedValue(2);
    prisma.invoice.findMany.mockResolvedValue([
      { id: 'inv_1', number: 'BM-2026-0031', status: 'open', payments: [] },
      { id: 'inv_2', number: 'BM-2026-0030', status: 'open', payments: [{ amount: 60000 }] },
    ]);
    prisma.instalment.findMany.mockResolvedValue([
      { invoiceNumber: 'BM-2026-0030', projectId: 'proj_1' },
    ]);
  });

  it('flags the scheduled ones on the row', async () => {
    const body = await (await GET(listRequest())).json();

    expect(body.invoices[0]).toMatchObject({
      number: 'BM-2026-0031',
      isInstalment: false,
      receivedCents: 0,
    });
    expect(body.invoices[1]).toMatchObject({
      number: 'BM-2026-0030',
      isInstalment: true,
      // Part paid. The rows carry a summed figure rather than the payment
      // list, so nothing downstream forms a second opinion about the total.
      receivedCents: 60000,
    });
    // And the raw rows do not travel with it.
    expect(body.invoices[1].payments).toBeUndefined();
  });

  it('asks only about the rows on screen', async () => {
    await GET(listRequest());

    expect(prisma.instalment.findMany.mock.calls[0][0].where).toEqual({
      invoiceNumber: { in: ['BM-2026-0031', 'BM-2026-0030'] },
    });
  });

  /* An empty page is not a reason to ask the database about nothing. */
  it('does not run the join on an empty page', async () => {
    prisma.invoice.findMany.mockResolvedValue([]);

    await GET(listRequest());

    expect(prisma.instalment.findMany).not.toHaveBeenCalled();
  });
});


/**
 * Reaching past the hundredth invoice.
 *
 * The ledger showed the hundred most recent and said so, which was honest and
 * still left invoice 101 unreachable from this screen — findable only by
 * remembering something to search for, which is exactly what somebody hunting
 * an old unpaid invoice does not have.
 *
 * A cursor rather than an offset, because this is the screen invoices are
 * RAISED on: one charge raised between two presses shifts every row down by
 * one, so an offset re-shows the last row of the previous page and skips a
 * real invoice with nothing on screen to say it did.
 */
describe('paging past the first hundred', () => {
  const listRequest = (url: string) => ({ nextUrl: new URL(url) }) as unknown as Parameters<typeof GET>[0];
  const BASE = 'https://bothmade.test/api/admin/billing/charges';

  const row = (n: number) => ({
    id: `inv_${n}`,
    number: `BM-2026-${String(n).padStart(4, '0')}`,
    description: 'Extra work',
    amountCents: 100000,
    status: 'open',
    refundedCents: 0,
    createdAt: new Date(`2026-03-${String((n % 28) + 1).padStart(2, '0')}T10:00:00.000Z`),
    client: { id: 'c1', company: 'Acme', email: 'a@acme.test' },
    project: { id: 'p1', name: 'Acme site' },
    issuedBy: null,
    payments: [],
  });

  beforeEach(() => {
    prisma.invoice.groupBy.mockReset().mockResolvedValue([]);
    prisma.invoice.count.mockResolvedValue(340);
  });

  it('hands back where to resume when the page is full', async () => {
    prisma.invoice.findMany.mockResolvedValue(Array.from({ length: 100 }, (_, i) => row(i)));

    const body = await (await GET(listRequest(BASE))).json();

    expect(body.truncated).toBe(true);
    expect(body.nextCursor).toBe('2026-03-16T10:00:00.000Z_inv_99');
  });

  it('hands back nothing to resume from on the last page', async () => {
    prisma.invoice.findMany.mockResolvedValue([row(1), row(2)]);

    const body = await (await GET(listRequest(BASE))).json();

    expect(body.nextCursor).toBeNull();
  });

  /*
   * Both halves of the cursor. createdAt alone is not unique — three charges
   * raised in a row share a millisecond often enough — and a cursor on a
   * non-unique key either repeats the ties or drops them.
   */
  it('asks for rows strictly after the row it was given', async () => {
    prisma.invoice.findMany.mockResolvedValue([]);

    await GET(listRequest(`${BASE}?before=2026-03-08T10:00:00.000Z_inv_99`));

    const where = prisma.invoice.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { createdAt: { lt: new Date('2026-03-08T10:00:00.000Z') } },
      { createdAt: new Date('2026-03-08T10:00:00.000Z'), id: { lt: 'inv_99' } },
    ]);
  });

  /*
   * The search also builds an OR. Two OR keys in one object is the second one
   * winning silently, which would page through every invoice in the book
   * while the box still said "Northgate".
   */
  it('keeps the search applied while paging', async () => {
    prisma.invoice.findMany.mockResolvedValue([]);

    await GET(listRequest(`${BASE}?q=northgate&before=2026-03-08T10:00:00.000Z_inv_99`));

    const where = prisma.invoice.findMany.mock.calls[0][0].where;
    expect(where.OR[0]).toEqual({ createdAt: { lt: new Date('2026-03-08T10:00:00.000Z') } });
    expect(JSON.stringify(where.AND)).toContain('northgate');
  });

  it('keeps the status filter applied while paging', async () => {
    prisma.invoice.findMany.mockResolvedValue([]);

    await GET(listRequest(`${BASE}?status=open&before=2026-03-08T10:00:00.000Z_inv_99`));

    expect(prisma.invoice.findMany.mock.calls[0][0].where.status).toBe('open');
  });

  /* A stale or mangled cursor shows the first page. A 400 on a screen about
     money reads as something being broken with the money. */
  it('ignores a cursor it cannot read rather than failing the page', async () => {
    prisma.invoice.findMany.mockResolvedValue([]);

    const res = await GET(listRequest(`${BASE}?before=nonsense`));

    expect(res.status).toBe(200);
    expect(prisma.invoice.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });

  /* Ties have to break the same way in both queries or the boundary row is
     lost between pages. */
  it('orders by the same two fields the cursor is built from', async () => {
    prisma.invoice.findMany.mockResolvedValue([]);

    await GET(listRequest(BASE));

    expect(prisma.invoice.findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});
