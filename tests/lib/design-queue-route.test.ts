import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/admin/design-queue` — the data behind the one screen that answers
 * "whose design round is late", and it had no tests.
 *
 * Two things in it are worth holding down. The first is the step each project
 * lands on, which is decided by three nullable dates in a deliberate order and
 * reads like something to simplify: a project that has been presented but has
 * no review deadline left is mid-conversation, not unsent, and collapsing that
 * case is what made an older panel render a blank "nothing sent yet" box at
 * clients who had already replied.
 *
 * The second is the cap. There was a `take: 100` here against an
 * `orderBy: updatedAt desc`, mentioned nowhere else — so past a hundred live
 * projects the rows that fell off were the ones nobody had touched in longest.
 * That is exactly backwards: a project sitting in "they answered, we owe them
 * the next round" has a stale updatedAt *because* it has been ignored, and its
 * review clock and payment gate have both stopped behind it. The most
 * expensive rows on the page were the first to leave it, silently.
 */

const projectFindMany = vi.fn();
const projectCount = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findMany: (...a: unknown[]) => projectFindMany(...a),
      count: (...a: unknown[]) => projectCount(...a),
    },
  },
}));

vi.mock('@/lib/middleware', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/middleware')>()),
  requireStaff: async () => ({ userId: 'u1', email: 'kiana@bothmade.studio', role: 'owner', type: 'user' }),
}));
vi.mock('@/lib/authz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/authz')>()),
  requireRole: () => null,
}));

const { GET, DESIGN_QUEUE_LIMIT } = await import('@/app/api/admin/design-queue/route');

/** A project row shaped the way the select in the route asks for it. */
function project(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'Okafor Plumbing Site',
    status: 'design',
    designUrl: null,
    designRound: 0,
    designPresentedAt: null,
    designReviewEndsAt: null,
    designApprovedAt: null,
    designApprovalDeemed: false,
    designRevisionsUsed: 0,
    client: { company: 'Okafor Plumbing', contactName: 'Dana' },
    designFeedback: [],
    ...over,
  };
}

async function body(rows: unknown[], total = rows.length) {
  projectFindMany.mockResolvedValue(rows);
  projectCount.mockResolvedValue(total);
  const res = await GET();
  return res.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('which step a project is on', () => {
  it('calls a project with nothing sent "to send"', async () => {
    const data = await body([project()]);
    expect(data.projects[0].step).toBe('to-send');
  });

  it('calls a project with a live review clock "waiting"', async () => {
    const data = await body([
      project({ designPresentedAt: new Date('2026-08-01'), designReviewEndsAt: new Date('2026-08-08') }),
    ]);
    expect(data.projects[0].step).toBe('waiting');
  });

  /**
   * Presented, but the deadline is gone: their feedback stopped the clock.
   * This is the expensive state — nothing is chasing us — and reading it as
   * "nothing sent yet" is the specific mistake the old panel made.
   */
  it('calls a presented project with no deadline left "changes-asked"', async () => {
    const data = await body([
      project({ designPresentedAt: new Date('2026-08-01'), designReviewEndsAt: null }),
    ]);
    expect(data.projects[0].step).toBe('changes-asked');
  });

  it('lets approval beat a clock that is still running', async () => {
    const data = await body([
      project({
        designPresentedAt: new Date('2026-08-01'),
        designReviewEndsAt: new Date('2026-08-08'),
        designApprovedAt: new Date('2026-08-03'),
      }),
    ]);
    expect(data.projects[0].step).toBe('approved');
  });

  it('marks unread feedback as unread, and read feedback as not', async () => {
    const fb = (reviewedAt: Date | null) => ({
      id: 'f1',
      round: 1,
      createdAt: new Date('2026-08-02'),
      reviewedAt,
      liked: 'The header',
      note: 'Can the logo be bigger',
    });

    const unread = await body([project({ designPresentedAt: new Date(), designFeedback: [fb(null)] })]);
    expect(unread.projects[0].latestFeedback.unread).toBe(true);

    const read = await body([
      project({ designPresentedAt: new Date(), designFeedback: [fb(new Date('2026-08-03'))] }),
    ]);
    expect(read.projects[0].latestFeedback.unread).toBe(false);
  });
});

describe('the cap on the query', () => {
  it('asks for a bounded page rather than every project ever', async () => {
    await body([project()]);

    expect(projectFindMany.mock.calls[0][0].take).toBe(DESIGN_QUEUE_LIMIT);
  });

  it('says so when it did not return everything', async () => {
    const data = await body([project(), project({ id: 'p2' })], 240);

    // Silence here is a page claiming to be the whole design queue when it is
    // a page of it — and the rows missing are the stalest, which on this
    // screen are the ones most likely to be waiting on us.
    expect(data.truncated).toBe(true);
    expect(data.total).toBe(240);
  });

  it('does not cry truncation when the list is complete', async () => {
    const data = await body([project(), project({ id: 'p2' })]);

    expect(data.truncated).toBe(false);
    expect(data.total).toBe(2);
  });

  it('counts against the same predicate it selects with', async () => {
    await body([project()]);

    // A total counted over a different set is a ratio that means nothing.
    expect(projectCount.mock.calls[0][0].where).toEqual(projectFindMany.mock.calls[0][0].where);
  });

  it('leaves finished projects out of both the rows and the total', async () => {
    await body([project()]);

    expect(projectFindMany.mock.calls[0][0].where).toEqual({ status: { not: 'complete' } });
  });
});
