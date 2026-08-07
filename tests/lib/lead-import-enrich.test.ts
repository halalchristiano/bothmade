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
  user: {
    findMany: vi.fn(async () => [
      { id: 'user_1', email: 'owner@bothmade.studio', name: 'Kiana' },
      { id: 'user_evan', email: 'evan@bothmade.studio', name: 'Evan' },
      { id: 'user_kiana', email: 'kiana@bothmade.studio', name: 'Kiana' },
    ]),
  },
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
  // Empty, like every lead that has ever been imported — no research CSV has
  // carried these columns, which is why the call brief was blank.
  painPoints: '',
  customPainPoints: null,
  essentialPoints: null,
  upsellPoints: null,
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

  /**
   * The columns the call script is built out of.
   *
   * They were missing from the read that decides what counts as blank, so
   * every one of them failed the `field in current` guard and a backfill of
   * the research that makes a brief worth reading landed nowhere at all — the
   * import reported success and changed nothing.
   */
  it('fills in the pain points a call brief is built from', async () => {
    const res = await importLeads(
      request([
        {
          company: 'Normandy Remodeling',
          email: 'info@normandyremodeling.com',
          painPoints: 'no-booking,not-mobile-friendly',
          painPoint1: 'No pricing anywhere: every enquiry starts with a haggle.',
          essentialPoint1: 'Project galleries: filterable by room.',
          upsellPoint1: 'Booking that works out of hours.',
        },
      ])
    );

    expect((await res.json()).enriched).toBe(1);
    const { data } = updatesFrom()[0];
    expect(data.painPoints).toBe('no-booking,not-mobile-friendly');
    expect(data.customPainPoints).toContain('No pricing anywhere');
    expect(data.essentialPoints).toContain('Project galleries');
    expect(data.upsellPoints).toContain('Booking that works out of hours');
  });

  it('leaves pain points somebody already wrote alone', async () => {
    prisma.lead.findMany.mockResolvedValue([
      { ...HELD, customPainPoints: 'Something a human decided on a call' },
    ]);

    await importLeads(
      request([
        {
          company: 'Normandy Remodeling',
          email: 'info@normandyremodeling.com',
          painPoint1: 'A worse guess from a spreadsheet.',
          phone: '(630) 455-5600',
        },
      ])
    );

    expect(updatesFrom()[0].data).not.toHaveProperty('customPainPoints');
    expect(updatesFrom()[0].data.phone).toBe('(630) 455-5600');
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

/**
 * Who the leads belong to once they are in.
 *
 * The importer assigned every row to whoever ran it, full stop, which is
 * wrong for the case that actually happens: an owner imports a thousand cold
 * leads for the closer to work. Every one landed on the owner, so the rep's
 * call sheet — scoped to their own leads — stayed empty, and every open-pixel
 * alert went to the wrong inbox. Nothing on screen said why.
 */
describe('assigning imported leads', () => {
  const created = () =>
    prisma.lead.create.mock.calls.map((c) => c[0] as unknown as { data: Record<string, unknown> });

  const importWith = (body: Record<string, unknown>) =>
    importLeads({ json: async () => body } as unknown as Parameters<typeof importLeads>[0]);

  beforeEach(() => {
    prisma.lead.findMany.mockResolvedValue([]);
  });

  it('gives them to whoever was chosen at import time', async () => {
    await importWith({
      rows: [{ company: 'Ridgeline Roofing', email: 'a@b.co' }],
      assignedToId: 'user_evan',
    });

    expect(created()[0].data.assignedToId).toBe('user_evan');
  });

  it('falls back to the importer when nobody was chosen', async () => {
    await importWith({ rows: [{ company: 'Ridgeline Roofing', email: 'a@b.co' }] });

    expect(created()[0].data.assignedToId).toBe('user_1');
  });

  /**
   * A thousand leads owned by a user that does not exist are invisible on
   * every call sheet at once, and the import would report success.
   */
  it('refuses an id that matches nobody rather than writing it', async () => {
    await importWith({
      rows: [{ company: 'Ridgeline Roofing', email: 'a@b.co' }],
      assignedToId: 'user_who_left',
    });

    expect(created()[0].data.assignedToId).toBe('user_1');
  });

  it('lets a row that names somebody override the choice', async () => {
    await importWith({
      rows: [{ company: 'Ridgeline Roofing', email: 'a@b.co', assignedTo: 'kiana@bothmade.studio' }],
      assignedToId: 'user_evan',
    });

    expect(created()[0].data.assignedToId).toBe('user_kiana');
  });
});
