import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The order the onboarding form asks its questions in, which was no order.
 *
 * Both routes that list this form sorted by `order`, and nothing ever set
 * it. The builder posts a question, a type and its options; the create route
 * defaulted the column to 0; so every question on every project carried the
 * same value. A sort key with one distinct value does not sort — Postgres
 * returns ties in whatever order it finds them, and that changes as rows are
 * written and updated.
 *
 * What that looks like from the client's side is a form that has lost its
 * place: it can ask for the brand palette before it asks what the company is
 * called, and it can ask in a different order the next time they open the
 * tab. The presets are grouped by subject for exactly the reason that matters
 * — you answer "what do you do" before "how should it look" — and the
 * grouping was being thrown away at the point of writing.
 */

const prisma = {
  onboardingQuestion: { findMany: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
  // The client route checks the project is theirs before it lists anything.
  project: { findUnique: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ type: 'user', userId: 'user_kiana', email: 'k@bothmade.studio', role: 'owner' }),
  requirePrincipal: async () => ({
    session: { type: 'client', clientId: 'client_1' },
    response: null,
  }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
  forbiddenResponse: () => new Response('{}', { status: 403 }),
}));
vi.mock('@/lib/authz', () => ({ ANY_STAFF: ['owner'], requireRole: () => null }));

const { POST, GET } = await import('@/app/api/admin/projects/[projectId]/onboarding/route');
const clientRoute = await import('@/app/api/projects/[projectId]/onboarding/route');
const { ONBOARDING_ORDER } = await import('@/lib/onboarding');

const params = { params: Promise.resolve({ projectId: 'proj_1' }) };

const add = (body: Record<string, unknown>) =>
  POST(
    new Request('https://bothmade.studio/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
    params as never
  );

beforeEach(() => {
  vi.clearAllMocks();
  prisma.onboardingQuestion.findMany.mockResolvedValue([]);
  prisma.onboardingQuestion.create.mockImplementation(async (a: { data: unknown }) => a.data);
  prisma.onboardingQuestion.aggregate.mockResolvedValue({ _max: { order: null } });
  prisma.project.findUnique.mockResolvedValue({ id: 'proj_1', clientId: 'client_1', status: 'build' });
});

const created = () => (prisma.onboardingQuestion.create.mock.calls[0][0] as { data: { order: number } }).data;

describe('adding a question', () => {
  it('puts the first one at the front', async () => {
    await add({ question: 'What is the company called?', type: 'text' });

    expect(created().order).toBe(0);
  });

  it('puts the next one after it, rather than on top of it', async () => {
    // Four questions already written, the last at position 3.
    prisma.onboardingQuestion.aggregate.mockResolvedValue({ _max: { order: 3 } });

    await add({ question: 'What are your brand colours?', type: 'text' });

    /*
     * The bug in one assertion. This used to be 0 — the same value as the
     * four already there — so the form's order became whatever the database
     * felt like that afternoon.
     */
    expect(created().order).toBe(4);
  });

  it('lands after the legacy questions that all share position zero', async () => {
    prisma.onboardingQuestion.aggregate.mockResolvedValue({ _max: { order: 0 } });

    await add({ question: 'Anything else we should know?', type: 'textarea' });

    expect(created().order).toBe(1);
  });

  it('scopes the position to this project', async () => {
    await add({ question: 'Who is your audience?', type: 'textarea' });

    expect(prisma.onboardingQuestion.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'proj_1' } })
    );
  });

  it('honours a position when one is named, so reordering stays possible', async () => {
    prisma.onboardingQuestion.aggregate.mockResolvedValue({ _max: { order: 9 } });

    await add({ question: 'Ask this first', type: 'text', order: 0 });

    expect(created().order).toBe(0);
  });

  it('still refuses a question with no text or an unknown type', async () => {
    const blank = await add({ question: '', type: 'text' });
    const bogus = await add({ question: 'Fine question', type: 'interpretive-dance' });

    expect(blank.status).toBe(400);
    expect(bogus.status).toBe(400);
    expect(prisma.onboardingQuestion.create).not.toHaveBeenCalled();
  });
});

describe('listing the form', () => {
  it('falls through to when a question was written when positions tie', async () => {
    await GET(new Request('https://bothmade.studio/x') as never, params as never);

    const args = prisma.onboardingQuestion.findMany.mock.calls[0][0] as { orderBy: unknown };
    expect(args.orderBy).toEqual([{ order: 'asc' }, { createdAt: 'asc' }]);
  });

  /*
   * Both sides, from one constant. A client answering in one order while the
   * studio reads the answers back in another is its own small confusion, and
   * two hand-maintained orderBy clauses is how that happens.
   */
  it('is the same order the client is asked in', async () => {
    await clientRoute.GET(new Request('https://bothmade.studio/x') as never, {
      params: Promise.resolve({ projectId: 'proj_1' }),
    } as never);

    const calls = prisma.onboardingQuestion.findMany.mock.calls;
    expect(calls.length, 'the client route did not list the questions').toBeGreaterThan(0);
    expect((calls[0][0] as { orderBy: unknown }).orderBy).toEqual(ONBOARDING_ORDER);
  });
});
