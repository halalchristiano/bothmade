import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { LEAD_CSV_HEADERS, LEAD_EXPORT_SELECT, leadCsv } from '@/lib/lead-export';

/**
 * What the pipeline board is allowed to send to a browser.
 *
 * A Lead carries a hundred and four columns. The board renders about a dozen
 * of them and the list a few more, and this endpoint used to `include` the
 * row whole and spread it into the response — every note, the address block,
 * the whole enrichment side, the saved proposal JSON. Unbounded, and sent
 * again on every board open and every list filter.
 *
 * `shareToken` is the one worth a test rather than a comment. It is the
 * capability secret for the public sign-and-pay page: whoever holds it can
 * open a prospect's proposal AND agree the contract on it. The endpoint is
 * staff-only, so shipping it was never a breach — it was a set of live
 * signing keys for the entire book sitting in a response body, in devtools,
 * and in any HAR file a support conversation asks somebody to attach.
 *
 * Guarded twice, deliberately. The `select` is what keeps the column out of
 * the query, and refuses new ones by default where an `include` would take
 * them silently. The response is then named field by field rather than
 * spread, so selecting one more column to compute something with does not
 * publish it as a side effect.
 */

const prisma = {
  lead: { findMany: vi.fn() },
  project: { findMany: vi.fn() },
};

const requireStaff = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  requireOwner: () => requireStaff(),
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));

const { GET } = await import('@/app/api/admin/leads/route');

// The handler only reads the URL off it; NextRequest's cookie/nextUrl surface
// is never touched, so a plain Request stands in — cast the way the other
// route tests here do.
const request = (qs = '') =>
  new Request(`http://localhost/api/admin/leads${qs}`) as unknown as NextRequest;

/** Everything the two screens read, plus the columns the CSV needs. */
const lead = {
  id: 'lead_1',
  company: 'Brandon Roofing',
  contactName: 'Brandon',
  email: 'b@example.com',
  phone: '+15550001111',
  status: 'qualified',
  estimatedValue: 500_000,
  proposalTotalPrice: null,
  hotLead: true,
  qualifiedAt: null,
  painPoints: '',
  doNotContact: false,
  coldEmailDraft: null,
  coldEmailSentAt: null,
  personalizedObservation: null,
  emailDeliveryFailedAt: null,
  emailDeliveryFailedReason: null,
  updatedAt: new Date('2026-08-01T00:00:00Z'),
  assignedTo: { id: 'user_1', name: 'Evan', email: 'evan@example.com' },
  activities: [],
  // The export's half.
  estimateLowCents: 400_000,
  estimateHighCents: 600_000,
  source: 'referral',
  industry: 'Roofing',
  city: 'Austin',
  region: 'TX',
  companySize: 'small',
  employeeCount: 12,
  tags: 'franchise',
  mockupUrl: 'https://mock.test/1',
  invoicePdfUrl: 'https://inv.test/1.pdf',
  addedAt: new Date('2026-07-02T00:00:00Z'),
  clientTakenOnAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireStaff.mockResolvedValue({ userId: 'user_1', role: 'owner' });
  prisma.lead.findMany.mockResolvedValue([lead]);
  prisma.project.findMany.mockResolvedValue([]);
});

const selectOf = () => prisma.lead.findMany.mock.calls[0][0].select as Record<string, unknown>;

describe('the columns the board asks the database for', () => {
  it('names them, rather than taking the row whole', async () => {
    await GET(request());

    const args = prisma.lead.findMany.mock.calls[0][0];
    expect(args.select).toBeTruthy();
    expect(args.include).toBeUndefined();
  });

  /** The one that matters: a live signing key for every lead in the book. */
  it('never asks for the sign-and-pay capability token', async () => {
    await GET(request());
    expect(selectOf().shareToken).toBeUndefined();
  });

  it('leaves behind the bulk nobody renders', async () => {
    await GET(request());
    const select = selectOf();

    for (const column of [
      'notes',
      'address',
      'googleRating',
      'googleReviewCount',
      'instagramUrl',
      'linkedinUrl',
      'proposalCustomItems',
      'agreementStatement',
      'signedContractUrl',
      'personalisedColdEmail',
    ]) {
      expect(select[column], `${column} should not be selected`).toBeUndefined();
    }
  });

  it('still asks for everything the two screens render', async () => {
    await GET(request());
    const select = selectOf();

    for (const column of [
      'id',
      'company',
      'contactName',
      'email',
      'phone',
      'status',
      'estimatedValue',
      'hotLead',
      'qualifiedAt',
      'painPoints',
      'doNotContact',
      'coldEmailDraft',
      'coldEmailSentAt',
      'personalizedObservation',
      'emailDeliveryFailedAt',
      'emailDeliveryFailedReason',
      'updatedAt',
    ]) {
      expect(select[column], `${column} is rendered and must be selected`).toBe(true);
    }
    expect(select.assignedTo).toBeTruthy();
    expect(select.activities).toBeTruthy();
  });

  /**
   * Not rendered, but dealValue is computed from it — so it has to survive
   * the narrowing that dropped everything else.
   */
  it('keeps the quoted price the deal value is derived from', async () => {
    prisma.lead.findMany.mockResolvedValue([{ ...lead, estimatedValue: 1, proposalTotalPrice: 900_000 }]);

    const body = await (await GET(request())).json();

    expect(selectOf().proposalTotalPrice).toBe(true);
    expect(body.leads[0].dealValue).toBe(900_000);
    expect(body.leads[0].dealValueIsFirm).toBe(true);
  });
});

describe('what comes back', () => {
  it('carries no token even if the database hands one over', async () => {
    // The select would already have stopped this in production. The point of
    // making the database lie here is that the response is what ships, and it
    // must not simply forward what it was handed.
    prisma.lead.findMany.mockResolvedValue([{ ...lead, shareToken: 'tok_live_should_never_ship' }]);

    const body = await (await GET(request())).text();

    expect(body).not.toContain('tok_live_should_never_ship');
  });

  it('prefers what a project actually sold for over the estimate', async () => {
    prisma.project.findMany.mockResolvedValue([{ convertedFromLeadId: 'lead_1', totalPrice: 1_250_000 }]);

    const body = await (await GET(request())).json();

    expect(body.leads[0].dealValue).toBe(1_250_000);
    expect(body.leads[0].dealValueIsFirm).toBe(true);
  });

  it('falls back to the guess, and says it is one', async () => {
    const body = await (await GET(request())).json();

    expect(body.leads[0].dealValue).toBe(500_000);
    expect(body.leads[0].dealValueIsFirm).toBe(false);
  });
});


/**
 * The regression this file did not catch the first time.
 *
 * Narrowing the query to the fields the board and the table render emptied
 * thirteen of the CSV's twenty-two columns — source, industry, city, state,
 * company size, employees, tags, both estimate bounds, the mockup and invoice
 * links, and the two dates the importer reads back.
 *
 * Nothing failed. The button worked, the file downloaded, every header was
 * present with nothing underneath it. An export that quietly loses columns is
 * worse than one that errors: the file goes on to a spreadsheet, and the gap
 * is found by whoever needed the column, later, somewhere else.
 *
 * So the export owns its column list and the route spreads it, and this holds
 * the two together.
 */
describe('the columns the CSV needs', () => {
  it('are all in the query, because the export supplies the list', async () => {
    await GET(request());
    const select = selectOf();

    for (const column of Object.keys(LEAD_EXPORT_SELECT)) {
      expect(select[column], `${column} is a CSV column and must be selected`).toBe(true);
    }
  });

  it('all survive into the response', async () => {
    const body = await (await GET(request())).json();

    for (const column of Object.keys(LEAD_EXPORT_SELECT)) {
      expect(body.leads[0], `${column} is a CSV column and must be sent`).toHaveProperty(column);
    }
  });

  /**
   * The end-to-end version: build the file from what the endpoint actually
   * returns and check no column came out blank. A header count that matches
   * with empty cells underneath is the exact shape of the bug.
   */
  it('produce a file with something under every header', async () => {
    const body = await (await GET(request())).json();

    const [header, row] = leadCsv(body.leads).split('\n');
    expect(header.split(',').length).toBe(LEAD_CSV_HEADERS.length);

    const cells = row.split(',');
    /*
     * Two cells are legitimately empty for this fixture and neither is a
     * missing column: the lead has not been won, so it has no taken-on date,
     * and `doNotContact` writes 'yes' or nothing at all — an empty cell there
     * is the value rather than a gap. Everything else is populated, so a
     * blank anywhere else means a column stopped arriving.
     */
    const expectedBlank = ['Client taken on', 'Do not contact'];
    const blank = LEAD_CSV_HEADERS.filter((h, i) => !cells[i] && !expectedBlank.includes(h));
    expect(blank).toEqual([]);
  });
});
