import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deleting British leads, and everything that stops it deleting the wrong ones.
 *
 * A deleted lead takes its whole history with it through the cascade and
 * there is no undo, so almost everything here is a refusal.
 */

const prisma = {
  lead: {
    findMany: vi.fn(async (_a: unknown) => [] as unknown[]),
    deleteMany: vi.fn(async (_a: unknown) => ({ count: 0 })),
  },
};

let isOwner = true;

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ userId: 'user_1' }),
  requireOwner: async () => (isOwner ? { userId: 'user_1' } : null),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
  forbiddenResponse: (msg: string) =>
    new Response(JSON.stringify({ error: msg }), { status: 403 }),
}));

const { GET, POST } = await import('@/app/api/admin/leads/uk-sweep/route');

const lead = (over: Record<string, unknown>) => ({
  id: `lead_${Math.random()}`,
  company: 'Business',
  phone: null,
  country: null,
  ...over,
});

const preview = async () => (await GET()).json();
const remove = async (expectedCount: unknown) => {
  const res = await POST(
    new Request('https://x/api', {
      method: 'POST',
      body: JSON.stringify({ expectedCount }),
      headers: { 'Content-Type': 'application/json' },
    }) as never
  );
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  vi.clearAllMocks();
  isOwner = true;
  prisma.lead.findMany.mockResolvedValue([]);
  prisma.lead.deleteMany.mockImplementation(async (args: unknown) => ({
    count: ((args as { where: { id: { in: string[] } } }).where.id.in ?? []).length,
  }));
});

describe('looking before deleting', () => {
  it('counts them and says which signal caught each one', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({ id: 'a', company: 'Manchester Roofing', phone: '0161 496 0000' }),
      lead({ id: 'b', company: 'Leeds Dental', country: 'United Kingdom', phone: '(212) 555-0100' }),
      lead({ id: 'c', company: 'Ridgeline Roofing', phone: '(212) 555-0100' }),
    ]);

    const data = await preview();

    expect(data.count).toBe(2);
    expect(data.byPhone).toBe(1);
    expect(data.byCountry).toBe(1);
    expect(data.leads.map((l: { id: string }) => l.id)).toEqual(['a', 'b']);
  });

  /**
   * A preview that silently shows the first two hundred of four hundred is a
   * preview somebody approves believing they read all of it.
   */
  it('says so when the list is longer than it is showing', async () => {
    prisma.lead.findMany.mockResolvedValue(
      Array.from({ length: 250 }, (_, i) => lead({ id: `l${i}`, phone: '020 7946 0018' }))
    );

    const data = await preview();

    expect(data.count).toBe(250);
    expect(data.leads).toHaveLength(200);
    expect(data.truncated).toBe(true);
  });

  it('is quiet on a clean book', async () => {
    prisma.lead.findMany.mockResolvedValue([lead({ phone: '(212) 555-0100' })]);

    expect((await preview()).count).toBe(0);
  });
});

describe('deleting them', () => {
  it('removes exactly the matches and nothing else', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({ id: 'uk1', phone: '020 7946 0018' }),
      lead({ id: 'us1', phone: '(212) 555-0100' }),
      lead({ id: 'uk2', country: 'Scotland' }),
    ]);

    const { status, body } = await remove(2);

    expect(status).toBe(200);
    expect(body.deleted).toBe(2);
    expect(
      (prisma.lead.deleteMany.mock.calls[0]![0] as { where: { id: { in: string[] } } }).where.id.in
    ).toEqual(['uk1', 'uk2']);
  });
});

describe('what stops it deleting the wrong rows', () => {
  /**
   * Between loading the preview and pressing the button an import can land,
   * or a second person can be doing the same thing. Without this the button
   * means "delete whatever matches now", which is not what anybody thought
   * they were agreeing to.
   */
  it('refuses when the book changed underneath the preview', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({ id: 'uk1', phone: '020 7946 0018' }),
      lead({ id: 'uk2', phone: '0161 496 0000' }),
      lead({ id: 'uk3', country: 'Wales' }),
    ]);

    const { status, body } = await remove(2);

    expect(status).toBe(409);
    expect(body.count).toBe(3);
    expect(prisma.lead.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses a request that never looked at a preview', async () => {
    prisma.lead.findMany.mockResolvedValue([lead({ id: 'uk1', phone: '020 7946 0018' })]);

    const { status } = await remove(undefined);

    expect(status).toBe(400);
    expect(prisma.lead.deleteMany).not.toHaveBeenCalled();
  });

  /** The same bar as the bulk delete this sits beside. */
  it('refuses anybody who is not an owner', async () => {
    isOwner = false;
    prisma.lead.findMany.mockResolvedValue([lead({ id: 'uk1', phone: '020 7946 0018' })]);

    const { status } = await remove(1);

    expect(status).toBe(403);
    expect(prisma.lead.deleteMany).not.toHaveBeenCalled();
  });

  /** Nothing to delete is a success, not an empty destructive query. */
  it('does not issue a delete for an empty match', async () => {
    const { status, body } = await remove(0);

    expect(status).toBe(200);
    expect(body.deleted).toBe(0);
    expect(prisma.lead.deleteMany).not.toHaveBeenCalled();
  });
});
