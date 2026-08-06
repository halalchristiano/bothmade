import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A second file about businesses we already hold.
 *
 * Every duplicate row used to be dropped, which is right for a re-import of
 * the same list and wrong for the case that kept happening: a later, richer
 * file — phone numbers this time — landing on leads imported without them.
 * The whole file came back as "every row is already in your leads" and the
 * new column went in the bin, which is how a lead the open pixel had flagged
 * as reading the email ended up under "no phone number on file".
 *
 * The rule that makes this safe is the one tested hardest: only blanks are
 * filled. A spreadsheet does not know what happened on the phone last Tuesday
 * and must never overwrite somebody who did.
 */

const prisma = {
  lead: { findMany: vi.fn(), create: vi.fn(), update: vi.fn((args: unknown) => args) },
  salesPlaybookItem: { findMany: vi.fn(async () => []) },
  user: { findMany: vi.fn(async () => []) },
  csvImportLog: { create: vi.fn(async () => ({})) },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
};

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ userId: 'user_1' }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));

const { POST: importLeads } = await import('@/app/api/admin/leads/import/route');

const request = (rows: Array<Record<string, string>>) =>
  ({ json: async () => ({ rows, fileName: 'backfill.csv' }) }) as unknown as Parameters<
    typeof importLeads
  >[0];

/** What the database already holds: imported with an address, no number. */
const HELD = {
  id: 'lead_1',
  company: 'Normandy Remodeling',
  email: 'info@normandyremodeling.com',
  phone: null,
  altPhone: null,
  contactName: null,
  contactRole: null,
  industry: 'Kitchen and bath remodeling',
  address: null,
  city: 'Chicago',
  region: 'IL',
  postalCode: null,
  country: 'USA',
  timezone: null,
  originalWebsite: 'https://normandyremodeling.com',
  currentSiteAssessment: null,
  personalizedObservation: 'something already written',
  coldEmailDraft: 'Subject: a draft that exists\n\nBody.',
  mockupEmailDraft: null,
  salesNote: null,
  notes: null,
  estimatedValue: 850000,
  estimateLowCents: null,
  estimateHighCents: null,
  leadScore: null,
  googleRating: null,
  googleReviewCount: null,
  googleMapsUrl: null,
  instagramUrl: null,
  facebookUrl: null,
  linkedinUrl: null,
  yearFounded: null,
  employeeCount: null,
  locationCount: null,
  annualRevenueCents: null,
};

const updatesFrom = () =>
  prisma.lead.update.mock.calls.map(
    (c) => c[0] as unknown as { where: { id: string }; data: Record<string, unknown> }
  );

beforeEach(() => {
  vi.clearAllMocks();
  prisma.lead.findMany.mockResolvedValue([HELD]);
  prisma.lead.create.mockImplementation((args: unknown) => args);
});

describe('re-importing a business we already hold', () => {
  it('fills in a phone number it was missing', async () => {
    const res = await importLeads(
      request([{ company: 'Normandy Remodeling', email: 'info@normandyremodeling.com', phone: '(630) 455-5600' }])
    );
    const data = await res.json();

    expect(data.enriched).toBe(1);
    const [update] = updatesFrom();
    expect(update.where.id).toBe('lead_1');
    expect(update.data.phone).toBe('(630) 455-5600');
  });

  /** The rule the whole feature rests on. */
  it('never overwrites something already written', async () => {
    await importLeads(
      request([
        {
          company: 'Normandy Remodeling',
          email: 'info@normandyremodeling.com',
          phone: '(630) 455-5600',
          personalizedObservation: 'a worse line from a spreadsheet',
          personalisedColdEmail: 'Subject: a worse draft\n\nBody.',
          estimatedValue: '1',
        },
      ])
    );

    const [update] = updatesFrom();
    expect(update.data).not.toHaveProperty('personalizedObservation');
    expect(update.data).not.toHaveProperty('coldEmailDraft');
    expect(update.data).not.toHaveProperty('estimatedValue');
    expect(update.data.phone).toBe('(630) 455-5600');
  });

  it('leaves the stage alone, whatever the file says', async () => {
    await importLeads(
      request([
        { company: 'Normandy Remodeling', email: 'info@normandyremodeling.com', phone: '555', status: 'new' },
      ])
    );

    expect(updatesFrom()[0].data).not.toHaveProperty('status');
  });

  it('still counts a row that adds nothing as a plain duplicate', async () => {
    const res = await importLeads(
      request([{ company: 'Normandy Remodeling', email: 'info@normandyremodeling.com' }])
    );
    const data = await res.json();

    expect(data.duplicates).toBe(1);
    expect(data.enriched).toBe(0);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('matches on the company name when the file carries no address', async () => {
    const res = await importLeads(request([{ company: 'normandy  remodeling', phone: '(630) 455-5600' }]));
    const data = await res.json();

    expect(data.enriched).toBe(1);
    expect(updatesFrom()[0].where.id).toBe('lead_1');
  });

  /** A file that is nothing but enrichment used to be refused outright. */
  it('reports success when every row was an enrichment', async () => {
    const res = await importLeads(
      request([{ company: 'Normandy Remodeling', email: 'info@normandyremodeling.com', phone: '(630) 455-5600' }])
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(0);
    expect(data.enrichedNames).toContain('Normandy Remodeling');
  });

  it('still creates the businesses in the same file that are genuinely new', async () => {
    const res = await importLeads(
      request([
        { company: 'Normandy Remodeling', email: 'info@normandyremodeling.com', phone: '(630) 455-5600' },
        { company: 'Kohr Construction', email: 'info@kohrconstructionsc.com', phone: '(843) 495-7333' },
      ])
    );
    const data = await res.json();

    expect(data.enriched).toBe(1);
    expect(data.count).toBe(1);
  });
});
