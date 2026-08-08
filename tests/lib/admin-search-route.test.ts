import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE BUG. Searching a phone number matched leads and not clients.
 *
 * The number search exists for one moment: the phone is ringing and it needs
 * a name before it is answered. So the gap fell in the worst possible place —
 * it found the people who had not bought anything and missed the ones who
 * had. A client with work in progress rang in and search said nothing at all,
 * which reads as "we have never heard of you" rather than "this box does not
 * look there".
 */

const leadFindMany = vi.fn();
const clientFindMany = vi.fn();
const projectFindMany = vi.fn();
const teamNoteFindMany = vi.fn();

const invoiceFindMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead: { findMany: (...a: unknown[]) => leadFindMany(...a) },
    client: { findMany: (...a: unknown[]) => clientFindMany(...a) },
    project: { findMany: (...a: unknown[]) => projectFindMany(...a) },
    teamNote: { findMany: (...a: unknown[]) => teamNoteFindMany(...a) },
    invoice: { findMany: (...a: unknown[]) => invoiceFindMany(...a) },
  },
}));

vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ userId: 'user_1', role: 'owner' }),
  unauthorizedResponse: () => new Response(null, { status: 401 }),
}));

const { GET } = await import('@/app/api/admin/search/route');

const request = (q: string) =>
  ({ nextUrl: new URL(`http://t/api/admin/search?q=${encodeURIComponent(q)}`) }) as Parameters<
    typeof GET
  >[0];

const CLIENT = {
  id: 'client_1',
  company: 'Linpotia Dental',
  contactName: 'Sam',
  email: 'sam@linpotia.test',
  phone: '(305) 885-5525',
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

beforeEach(() => {
  leadFindMany.mockReset().mockResolvedValue([]);
  clientFindMany.mockReset().mockResolvedValue([]);
  projectFindMany.mockReset().mockResolvedValue([]);
  teamNoteFindMany.mockReset().mockResolvedValue([]);
  invoiceFindMany.mockReset().mockResolvedValue([]);
});

/** The OR arms the route builds for a model, flattened to comparable JSON. */
const whereArms = (mock: ReturnType<typeof vi.fn>) =>
  JSON.stringify(mock.mock.calls[0][0].where.OR);

describe('searching a phone number', () => {
  it('looks for it on clients, not only on leads', async () => {
    await GET(request('3058855525'));

    expect(whereArms(clientFindMany)).toContain('3058855525');
    expect(whereArms(leadFindMany)).toContain('3058855525');
  });

  it('matches a number typed with punctuation against the stored digits', async () => {
    // "(305) 885-5525" and "3058855525" are the same number; stored formats
    // vary, so the digits are what gets matched.
    await GET(request('(305) 885-5525'));

    expect(whereArms(clientFindMany)).toContain('3058855525');
  });

  it('leads a client result with the number, so it is clear why it matched', async () => {
    clientFindMany.mockResolvedValue([CLIENT]);

    const body = await (await GET(request('3058855525'))).json();

    expect(body.results).toHaveLength(1);
    expect(body.results[0].subtitle).toBe('(305) 885-5525 · Sam');
    expect(body.results[0].href).toBe('/admin/clients/client_1');
  });

  it('falls back to the contact when the query was not a number', async () => {
    clientFindMany.mockResolvedValue([CLIENT]);

    const body = await (await GET(request('Linpotia'))).json();

    expect(body.results[0].subtitle).toBe('Sam');
  });
});

describe('the shape of the answer', () => {
  it('orders every type together by what was touched most recently', async () => {
    leadFindMany.mockResolvedValue([
      { id: 'lead_1', company: 'Older Lead', contactName: null, email: null, phone: null, updatedAt: new Date('2026-07-01T00:00:00.000Z') },
    ]);
    clientFindMany.mockResolvedValue([CLIENT]);

    const body = await (await GET(request('lin'))).json();

    expect(body.results.map((r: { title: string }) => r.title)).toEqual([
      'Linpotia Dental',
      'Older Lead',
    ]);
  });

  it('never leaks the sort key it used', async () => {
    clientFindMany.mockResolvedValue([CLIENT]);

    const body = await (await GET(request('lin'))).json();

    expect(body.results[0]).not.toHaveProperty('updatedAt');
  });

  it('asks for nothing at all on a one-character query', async () => {
    const body = await (await GET(request('l'))).json();

    expect(body.results).toEqual([]);
    expect(clientFindMany).not.toHaveBeenCalled();
    expect(leadFindMany).not.toHaveBeenCalled();
  });
});

/**
 * The one identifier a client already has in their hand.
 *
 * Every invoice email is subject-lined "Invoice INV-0042 — …", so that
 * string is what comes back in the reply and what gets read down the phone.
 * Search could find the company, the project and a passing note mentioning
 * them, but not the document being asked about.
 */
const INVOICE = {
  id: 'inv_1',
  number: 'INV-0042',
  description: 'Deposit',
  amountCents: 250000,
  status: 'open',
  createdAt: new Date('2026-08-02T00:00:00.000Z'),
  projectId: 'proj_9',
  client: { company: 'Linpotia Dental' },
};

describe('searching an invoice number', () => {
  it('finds it', async () => {
    invoiceFindMany.mockResolvedValue([INVOICE]);

    const body = await (await GET(request('INV-0042'))).json();

    expect(body.results).toHaveLength(1);
    expect(body.results[0].title).toBe('Invoice INV-0042');
    expect(body.results[0].type).toBe('invoice');
  });

  it('lands on the billing view for that project, where the invoice lives', async () => {
    invoiceFindMany.mockResolvedValue([INVOICE]);

    const body = await (await GET(request('INV-0042'))).json();

    expect(body.results[0].href).toBe('/admin/billing?projectId=proj_9');
  });

  it('says whose it is, what it is for and whether it is paid', async () => {
    // "INV-0042" alone identifies the row and tells you nothing about
    // whether it is the one you want. Status matters most: the usual reason
    // to look an invoice up is to find out if the money arrived.
    invoiceFindMany.mockResolvedValue([INVOICE]);

    const body = await (await GET(request('INV-0042'))).json();

    expect(body.results[0].subtitle).toContain('Linpotia Dental');
    expect(body.results[0].subtitle).toContain('open');
  });

  it('matches the description too, for when nobody quoted a number', async () => {
    await GET(request('deposit'));

    const arms = JSON.stringify(invoiceFindMany.mock.calls[0][0].where.OR);
    expect(arms).toContain('number');
    expect(arms).toContain('description');
  });

  it('sorts in with everything else by recency, not in a section of its own', async () => {
    invoiceFindMany.mockResolvedValue([INVOICE]);
    clientFindMany.mockResolvedValue([CLIENT]); // updated 2026-08-01, older

    const body = await (await GET(request('lin'))).json();

    expect(body.results.map((r: { type: string }) => r.type)).toEqual(['invoice', 'client']);
  });
});

/**
 * Projects, by whose they are.
 *
 * They were matched on the project's own name only. That mostly worked by
 * coincidence — the normal flow names a project "<Company> — <Service>", so
 * the company was sitting inside the name. Rename one to "Patient Portal",
 * which is what people actually call things, and it fell out of search.
 */
describe('finding a project by its client', () => {
  const RENAMED = {
    id: 'proj_9',
    name: 'Patient Portal',
    updatedAt: new Date('2026-08-03T00:00:00.000Z'),
    client: { company: 'Linpotia Dental' },
  };

  it('asks about the client company, not just the project name', async () => {
    await GET(request('Linpotia'));

    const arms = JSON.stringify(projectFindMany.mock.calls[0][0].where.OR);
    expect(arms).toContain('name');
    expect(arms).toContain('company');
  });

  it('returns a project whose name says nothing about the client', async () => {
    projectFindMany.mockResolvedValue([RENAMED]);

    const body = await (await GET(request('Linpotia'))).json();

    expect(body.results).toHaveLength(1);
    expect(body.results[0].title).toBe('Patient Portal');
    // The subtitle is what tells you whose it is, since the title no longer does.
    expect(body.results[0].subtitle).toBe('Linpotia Dental');
  });
});
