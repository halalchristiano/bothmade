import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The picker in front of every one-off charge.
 *
 * It is also the one place in the admin where a sales session may read the
 * client book, so the shape of that exception is worth pinning: a query is
 * always required, the projection is small, and the result set is capped.
 *
 * And the cap is where it went wrong. Clients with no project were filtered
 * out AFTER the ten-row limit had been applied, so a search matching fifteen
 * clients whose first ten alphabetically had no project yet returned nothing
 * — and the screen said "No customer matches that" about a customer who was
 * right there.
 */

const prisma = {
  // Every stub declares the argument it is called with, even where the body
  // ignores it: a vi.fn(async () => x) types its own mock.calls as an empty
  // tuple, so reading calls[0][0] — the point of these assertions — is a type
  // error rather than a test failure. tsconfig includes tests, so that error
  // fails `next build`.
  client: { findMany: vi.fn(async (_a: { where: Record<string, unknown> }) => [] as unknown[]) },
  project: { findUnique: vi.fn(async (_a: unknown) => null as unknown) },
};

const requireStaff = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));

const { GET } = await import('@/app/api/admin/billing/customers/route');

function request(search: string) {
  return {
    nextUrl: new URL(`https://bothmade.test/api/admin/billing/customers${search}`),
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  requireStaff.mockResolvedValue({ userId: 'user_evan', type: 'user', role: 'sales' });
});

describe('searching for somebody to bill', () => {
  /*
   * The bug, stated as the rule that prevents it: billability is part of the
   * query, so the ten rows that come back are ten customers who can actually
   * be billed rather than ten rows of which some may be usable.
   */
  it('asks the database for billable customers rather than filtering the page', async () => {
    await GET(request('?q=acme'));

    const where = prisma.client.findMany.mock.calls[0][0].where;
    expect(where.projects).toEqual({ some: {} });
    expect(where.archivedAt).toBeNull();
  });

  it('matches on company, contact and email', async () => {
    await GET(request('?q=acme'));

    const or = prisma.client.findMany.mock.calls[0][0].where.OR;
    expect(or).toHaveLength(3);
    expect(JSON.stringify(or)).toContain('insensitive');
  });

  it('returns what the query returned, with nothing quietly dropped after', async () => {
    prisma.client.findMany.mockResolvedValue([
      { id: 'c1', company: 'Acme Dental', contactName: null, email: 'a@b.test', projects: [{ id: 'p1' }] },
    ]);

    const body = await (await GET(request('?q=acme'))).json();

    expect(body.customers).toHaveLength(1);
    expect(body.customers[0].company).toBe('Acme Dental');
  });

  /*
   * No "list everything" call to make. A borrowed sales session cannot page
   * through the client book; it has to already know who it is looking for.
   */
  it('refuses to answer a query too short to be a search', async () => {
    const body = await (await GET(request('?q=a'))).json();

    expect(body.customers).toEqual([]);
    expect(body.needsQuery).toBe(true);
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });

  it('turns away anybody not signed in', async () => {
    requireStaff.mockResolvedValue(null);

    const res = await GET(request('?q=acme'));

    expect(res.status).toBe(401);
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });
});

describe('arriving from a project', () => {
  it('resolves the one customer without making anybody search', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'proj_1',
      client: {
        id: 'c1',
        company: 'Acme Dental',
        contactName: 'Dana',
        email: 'a@b.test',
        archivedAt: null,
        projects: [{ id: 'proj_1', name: 'Acme — Website', status: 'build', totalPrice: 500000 }],
      },
    });

    const body = await (await GET(request('?projectId=proj_1'))).json();

    expect(body.customers).toHaveLength(1);
    // The archived flag decides the answer; it is not part of it.
    expect(body.customers[0].archivedAt).toBeUndefined();
  });

  it('offers nothing for a decommissioned client', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'proj_1',
      client: { id: 'c1', company: 'Acme', contactName: null, email: 'a@b.test', archivedAt: new Date(), projects: [] },
    });

    const body = await (await GET(request('?projectId=proj_1'))).json();

    expect(body.customers).toEqual([]);
  });
});
