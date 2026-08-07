import { describe, expect, it, vi } from 'vitest';

/**
 * One bad column must not take down a client's whole project page.
 *
 * `Project.deliverables` is a JSON string column, and this route parsed it
 * bare. A malformed value — a truncated write, a hand-edited row, an older
 * format — threw inside the response builder, and the route's catch turned
 * that into a 500. Not "the file list is missing": the messages, the
 * invoices, the payment schedule, the design review, everything this endpoint
 * returns, replaced by an error page on the screen a paying client opens to
 * see how their job is going.
 *
 * The admin route reading the same column has always defended against this.
 * The client-facing one never did, which is exactly the wrong way round.
 */

const project = (deliverables: string | null) => ({
  id: 'proj_1',
  name: 'Site build',
  status: 'in_progress',
  statusStage: 2,
  totalPrice: 500_000,
  addOns: '',
  customItems: null,
  baseService: 'web',
  clientType: 'smb-tier',
  timeline: 'flexible',
  contractUrl: null,
  liveUrl: null,
  designPresentedAt: null,
  designReviewEndsAt: null,
  designApprovedAt: null,
  designRound: 0,
  deliverables,
  clientId: 'client_1',
  client: { id: 'client_1', company: 'Linpotia', email: 'a@b.com' },
  instalments: [],
  designDirection: null,
  messages: [],
  updates: [],
  payments: [],
  invoices: [],
  changeOrders: [],
  onboardingQuestions: [],
  designFeedback: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

const empty: Record<string, unknown> = {
  findMany: async () => [],
  findFirst: async () => null,
  findUnique: async () => null,
  create: async () => ({ id: 'x' }),
  update: async () => ({ id: 'x' }),
  count: async () => 0,
};

let stored: string | null = null;

vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy(
    {
      project: { ...empty, findUnique: async () => project(stored) },
    } as Record<string, Record<string, unknown>>,
    { get: (target, model: string) => target[model] ?? empty }
  ),
}));

vi.mock('@/lib/middleware', () => ({
  requirePrincipal: async () => ({
    session: { type: 'client', clientId: 'client_1', userId: null },
    response: null,
  }),
  forbiddenResponse: () => new Response('{}', { status: 403 }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));
vi.mock('@/lib/auth', () => ({ getCurrentSession: async () => null }));
vi.mock('@/lib/instalments', async () => {
  const actual = await vi.importActual<typeof import('@/lib/instalments')>('@/lib/instalments');
  return { ...actual, ensureInstalments: async () => [] };
});
vi.mock('@/lib/email', () => ({ sendProjectLiveEmail: vi.fn() }));

const { GET } = await import('@/app/api/projects/[projectId]/route');

const load = async (deliverables: string | null) => {
  stored = deliverables;
  const res = await GET(new Request('https://x/api/projects/proj_1') as never, {
    params: Promise.resolve({ projectId: 'proj_1' }),
  } as never);
  return { status: res.status, body: await res.json() };
};

describe('a client opening their project', () => {
  it('reads the deliverables when the column is good', async () => {
    const { status, body } = await load(JSON.stringify([{ name: 'Logo.zip', url: 'https://x/1' }]));

    expect(status).toBe(200);
    expect(body.project.deliverables).toHaveLength(1);
  });

  it('still gets their project when the column is unreadable', async () => {
    const { status, body } = await load('{"name": "Logo.zip"');

    // The page loads, minus a list nobody could have read anyway. Before this
    // the same row produced a 500 and the client saw nothing at all.
    expect(status).toBe(200);
    expect(body.project.deliverables).toEqual([]);
  });

  it('refuses to hand back something that is not a list', async () => {
    // Valid JSON, wrong shape — the client renders this with .map().
    const { status, body } = await load('{"name":"not an array"}');

    expect(status).toBe(200);
    expect(body.project.deliverables).toEqual([]);
  });

  it('treats an empty column as no deliverables', async () => {
    const { status, body } = await load(null);

    expect(status).toBe(200);
    expect(body.project.deliverables).toEqual([]);
  });
});
