import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * How the day went, per person, and what the calls turned into.
 *
 * The dashboard could say "12 calls logged" and nothing else, which answers
 * the least interesting version of the question. What a two-person sales
 * floor actually asks is "how did that go, and for whom" — so each row
 * carries the three things a call becomes: it happened, they wanted a mockup,
 * or they did not and the follow-up sequence picked them up.
 *
 * All of it read off the activity log, because the activity IS the
 * attribution: a mockup request and a booked email sequence have no author of
 * their own, but the call that caused them does.
 */

/**
 * A stand-in for every model this route touches.
 *
 * The dashboard reads a dozen tables to answer three questions, and only one
 * of them — the activity log — is what this file is about. Naming the other
 * eleven here would make the test break every time the dashboard learns to
 * count something new, which teaches people to stop writing dashboard tests.
 * So everything answers "nothing" until a test says otherwise.
 */
const leadActivityFindMany = vi.fn(async (_a: unknown) => [] as unknown[]);

const empty: Record<string, unknown> = {
  findMany: async () => [],
  findFirst: async () => null,
  findUnique: async () => null,
  count: async () => 0,
  aggregate: async () => ({ _sum: { amount: 0 } }),
};

const prisma = new Proxy(
  {
    leadActivity: { ...empty, findMany: leadActivityFindMany },
  } as Record<string, Record<string, unknown>>,
  {
    get: (target, model: string) => target[model] ?? empty,
  }
);

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ userId: 'user_kiana' }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));
vi.mock('@/lib/stage-gates', () => ({ uninvoicedPayments: () => [] }));
vi.mock('@/lib/mockups', () => ({ MOCKUPS_TO_BUILD_WHERE: {} }));
vi.mock('@/lib/design-stages', () => ({ nextDesignStage: () => null }));

const { GET } = await import('@/app/api/admin/today/route');

const NOW = new Date();
const TODAY = new Date(NOW.getTime() - 3 * 60 * 60 * 1000);

const EVAN = { name: 'Evan Buoncristiano', email: 'evan@bothmade.studio' };
const KIANA = { name: 'Kiana Arabpour', email: 'kiana@bothmadestudio.com' };

/** One logged call, and what became of the lead it was against. */
const call = (
  by: { name: string; email: string },
  byId: string,
  lead: Partial<{
    id: string;
    mockupRequestedAt: Date | null;
    autoFollowUpDueAt: Date | null;
    autoFollowUpStage: number;
  }> = {},
  type: 'call' | 'dial' = 'call'
) => ({
  type,
  createdById: byId,
  createdBy: by,
  lead: {
    id: lead.id ?? `lead_${Math.random()}`,
    mockupRequestedAt: lead.mockupRequestedAt ?? null,
    autoFollowUpDueAt: lead.autoFollowUpDueAt ?? null,
    autoFollowUpStage: lead.autoFollowUpStage ?? 0,
  },
});

/** A number tapped, recorded by the app rather than written up by anyone. */
const dialled = (by: { name: string; email: string }, byId: string) =>
  call(by, byId, {}, 'dial');

const run = async () => {
  const res = await GET(new Request('https://x/api/admin/today') as never);
  return (await res.json()).sell.team as Array<{
    userId: string;
    name: string;
    calls: number;
    dials: number;
    mockupsRequested: number;
    intoFollowUp: number;
  }>;
};

beforeEach(() => {
  vi.clearAllMocks();
  leadActivityFindMany.mockResolvedValue([]);
});

/** The calls the activity log will hand back for this test. */
const logged = (rows: unknown[]) => leadActivityFindMany.mockResolvedValue(rows);

describe('counting a day', () => {
  it("attributes each call to whoever logged it, not to whoever is looking", async () => {
    logged([
      call(EVAN, 'user_evan'),
      call(EVAN, 'user_evan'),
      call(KIANA, 'user_kiana'),
    ]);

    const team = await run();

    expect(team).toHaveLength(2);
    expect(team[0]).toMatchObject({ name: 'Evan Buoncristiano', calls: 2 });
    expect(team[1]).toMatchObject({ name: 'Kiana Arabpour', calls: 1 });
  });

  /** Busiest first: the question is who got through the most. */
  it('puts the biggest day at the top', async () => {
    logged([
      call(KIANA, 'user_kiana'),
      call(EVAN, 'user_evan'),
      call(EVAN, 'user_evan'),
    ]);

    expect((await run())[0]!.name).toBe('Evan Buoncristiano');
  });

  it('splits the calls that wanted a mockup from the ones that went to email', async () => {
    logged([
      call(EVAN, 'user_evan', { id: 'a', mockupRequestedAt: TODAY }),
      call(EVAN, 'user_evan', { id: 'b', autoFollowUpDueAt: TODAY, autoFollowUpStage: 0 }),
      call(EVAN, 'user_evan', { id: 'c', autoFollowUpDueAt: TODAY, autoFollowUpStage: 0 }),
      // Nobody picked up, so it is neither. Still a call made.
      call(EVAN, 'user_evan', { id: 'd' }),
    ]);

    expect(await run()).toEqual([
      {
        userId: 'user_evan',
        name: 'Evan Buoncristiano',
        calls: 4,
        dials: 0,
        mockupsRequested: 1,
        intoFollowUp: 2,
      },
    ]);
  });

  /**
   * Ringing the same business twice in a morning is one mockup, not two.
   * Counting per activity row rather than per lead would flatter the number
   * exactly when somebody had to chase hardest.
   */
  it('counts a business once however many times it was rung', async () => {
    logged([
      call(EVAN, 'user_evan', { id: 'same', mockupRequestedAt: TODAY }),
      call(EVAN, 'user_evan', { id: 'same', mockupRequestedAt: TODAY }),
    ]);

    const [evan] = await run();

    expect(evan).toMatchObject({ calls: 2, mockupsRequested: 1 });
  });

  /**
   * A mockup asked for last week does not belong to today's call. The
   * timestamp is the only thing that can tell those apart, and without the
   * check every old mockup would be re-credited to whoever happened to ring
   * that business this morning.
   */
  it('does not credit a mockup requested before today', async () => {
    logged([
      call(EVAN, 'user_evan', {
        id: 'old',
        mockupRequestedAt: new Date(NOW.getTime() - 8 * 86_400_000),
        autoFollowUpDueAt: TODAY,
      }),
    ]);

    const [evan] = await run();

    expect(evan!.mockupsRequested).toBe(0);
    expect(evan!.intoFollowUp).toBe(1);
  });

  /** A sequence already part-sent was not started by this morning's call. */
  it('does not count a sequence that was already running', async () => {
    logged([
      call(EVAN, 'user_evan', { id: 'mid', autoFollowUpDueAt: TODAY, autoFollowUpStage: 1 }),
    ]);

    expect((await run())[0]!.intoFollowUp).toBe(0);
  });

  /**
   * A row with a blank name reads as a bug in the dashboard rather than as a
   * deleted account, and someone will go looking for the bug.
   */
  it('never renders a nameless row', async () => {
    logged([
      call({ name: '', email: 'ghost@bothmade.studio' }, 'user_ghost'),
      call({ name: '', email: '' }, 'user_nobody'),
    ]);

    expect((await run()).map((p) => p.name)).toEqual(['ghost@bothmade.studio', 'Someone']);
  });

  /** A row of zeroes at 9am is a scolding, not information. */
  it('is empty before the first call of the day', async () => {
    expect(await run()).toEqual([]);
  });
});

/**
 * The number nobody typed, next to the number somebody did.
 *
 * "How many calls did you make" and "how many did you tell me about" are
 * different questions and only one of them could be answered before. A dial
 * is recorded as the number is tapped, before the phone app takes the screen;
 * an outcome is written up afterwards, if the afternoon allows. Keeping them
 * apart is the entire value — added together they would be a bigger number
 * that means less.
 */
describe('dialled against written up', () => {
  it('counts them separately and never adds them together', async () => {
    logged([
      dialled(EVAN, 'user_evan'),
      dialled(EVAN, 'user_evan'),
      dialled(EVAN, 'user_evan'),
      call(EVAN, 'user_evan'),
    ]);

    const [evan] = await run();

    expect(evan).toMatchObject({ dials: 3, calls: 1 });
  });

  /**
   * A dial says a number was tapped. It says nothing about whether anybody
   * picked up, so it cannot be credited with a mockup or a booked sequence —
   * those follow from a conversation somebody had.
   */
  it('never credits an outcome to a bare dial', async () => {
    logged([
      call(EVAN, 'user_evan', { id: 'a', mockupRequestedAt: TODAY }, 'dial'),
      call(EVAN, 'user_evan', { id: 'b', autoFollowUpDueAt: TODAY, autoFollowUpStage: 0 }, 'dial'),
    ]);

    const [evan] = await run();

    expect(evan).toMatchObject({ dials: 2, calls: 0, mockupsRequested: 0, intoFollowUp: 0 });
  });

  /**
   * Ordered by the measurement, not the self-report. Sorting by written-up
   * outcomes would put whoever keeps the tidiest notes at the top of a board
   * about who did the most work.
   */
  it('ranks by dials rather than by write-ups', async () => {
    logged([
      call(KIANA, 'user_kiana'),
      call(KIANA, 'user_kiana'),
      call(KIANA, 'user_kiana'),
      dialled(EVAN, 'user_evan'),
      dialled(EVAN, 'user_evan'),
      dialled(EVAN, 'user_evan'),
      dialled(EVAN, 'user_evan'),
    ]);

    expect((await run())[0]!.name).toBe('Evan Buoncristiano');
  });

  it('shows somebody who dialled and wrote nothing up at all', async () => {
    logged([dialled(EVAN, 'user_evan'), dialled(EVAN, 'user_evan')]);

    expect(await run()).toEqual([
      {
        userId: 'user_evan',
        name: 'Evan Buoncristiano',
        calls: 0,
        dials: 2,
        mockupsRequested: 0,
        intoFollowUp: 0,
      },
    ]);
  });
});
