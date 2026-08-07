import { describe, expect, it, vi } from 'vitest';

/**
 * Two ways the dashboard used to disagree with itself, and one thing it
 * computed and threw away.
 *
 * The Today panel counts the whole studio — it says so, out loud, in its own
 * comments. The breakdown underneath it answered for "my" leads: assigned to
 * me plus anything unassigned. Same page, same question, two answers, and the
 * mismatch was invisible unless two people compared screens.
 *
 * The balances list is the other half of it. It was computed on every load,
 * unfiltered, and rendered nowhere — while /admin/priorities read the same
 * field straight into rows, so a paid-up project produced "$0.00 invoiced and
 * still unpaid".
 */

const empty: Record<string, unknown> = {
  findMany: async () => [],
  findFirst: async () => null,
  findUnique: async () => null,
  count: async () => 0,
  aggregate: async () => ({ _sum: { amount: 0 } }),
  groupBy: async () => [],
};

/** Whoever is signed in. The point of these tests is that it stops mattering. */
const ME = 'user_kiana';
const THEM = 'user_evan';

vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ userId: ME, role: 'owner' }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));
vi.mock('@/lib/authz', () => ({ ANY_STAFF: [], requireRole: () => null }));
vi.mock('@/lib/mockups', () => ({ MOCKUPS_TO_BUILD_WHERE: {} }));

const lead = (over: Partial<Record<string, unknown>> = {}) => ({
  id: `lead_${Math.random()}`,
  company: 'A Company',
  status: 'qualified',
  estimatedValue: 500_000,
  assignedToId: THEM,
  hotLead: false,
  nextFollowUpAt: null,
  lostReason: null,
  source: 'referral',
  contractStatus: null,
  phone: null,
  email: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('the sales half of the dashboard', () => {
  it('counts the whole book, not just the leads assigned to whoever is looking', async () => {
    vi.resetModules();
    const findMany = vi.fn(async (args?: { where?: { status?: string } }) => {
      // Every lead here belongs to the OTHER person. Under the old scoping
      // this endpoint returned an empty pipeline to anyone else — a rep and an
      // owner side by side, one of them looking at a dashboard reporting zero.
      const all = [
        lead({ status: 'qualified', estimatedValue: 500_000 }),
        lead({ status: 'won', estimatedValue: 900_000 }),
      ];
      const status = args?.where?.status;
      return status ? all.filter((l) => l.status === status) : all;
    });

    vi.doMock('@/lib/prisma', () => ({
      prisma: new Proxy({ lead: { ...empty, findMany } } as Record<string, Record<string, unknown>>, {
        get: (target, model: string) => target[model] ?? empty,
      }),
    }));

    const { GET } = await import('@/app/api/admin/sales-stats/route');
    const body = await (await GET(new Request('https://x/api/admin/sales-stats') as never)).json();

    expect(body.stats.totalPipelineValue).toBe(500_000);
    expect(body.stats.pipeline.find((p: { status: string }) => p.status === 'qualified').count).toBe(1);

    // And no query went out carrying an assignee filter at all.
    for (const [args] of findMany.mock.calls) {
      expect(JSON.stringify(args ?? {})).not.toContain('assignedToId');
    }
  });

  it('counts activity logged by everyone, since the panel above it does', async () => {
    vi.resetModules();
    const activityCount = vi.fn(async (_args?: unknown) => 12);

    vi.doMock('@/lib/prisma', () => ({
      prisma: new Proxy(
        { leadActivity: { ...empty, count: activityCount } } as Record<string, Record<string, unknown>>,
        { get: (target, model: string) => target[model] ?? empty }
      ),
    }));

    const { GET } = await import('@/app/api/admin/sales-stats/route');
    const body = await (await GET(new Request('https://x/api/admin/sales-stats') as never)).json();

    expect(body.stats.thisWeek.activityLogged).toBe(12);
    const [args] = activityCount.mock.calls[0] as [{ where?: Record<string, unknown> }];
    expect(args.where).not.toHaveProperty('createdById');
  });
});

describe('the balances the ops half reports', () => {
  const project = (id: string, over: Partial<Record<string, unknown>> = {}) => ({
    id,
    name: `${id} site`,
    status: 'in_progress',
    statusStage: 2,
    totalPrice: 1_000_000,
    updatedAt: new Date(),
    createdAt: new Date(),
    prioritySnoozedUntil: null,
    lastPaymentReminderSentAt: null,
    liveUrl: 'https://example.com',
    client: { company: `${id} Ltd`, contactName: 'A Person' },
    messages: [],
    onboardingQuestions: [],
    ...over,
  });

  const load = async (opts: {
    projects: ReturnType<typeof project>[];
    payments: Array<{ projectId: string; amount: number; type: string }>;
    instalments: Array<{ projectId: string; status: string; amountCents: number; trigger: string }>;
  }) => {
    vi.resetModules();
    // The activity feed reads the same payment rows with the project joined
    // on, so they need to survive that pass as well as the balance maths.
    const payments = opts.payments.map((p) => ({
      ...p,
      id: `pay_${p.projectId}`,
      createdAt: new Date(),
      project: { id: p.projectId, name: p.projectId, client: { company: `${p.projectId} Ltd` } },
    }));
    vi.doMock('@/lib/prisma', () => ({
      prisma: new Proxy(
        {
          project: { ...empty, findMany: async () => opts.projects },
          payment: { ...empty, findMany: async () => payments },
          instalment: { ...empty, findMany: async () => opts.instalments },
        } as Record<string, Record<string, unknown>>,
        { get: (target, model: string) => target[model] ?? empty }
      ),
    }));
    const { GET } = await import('@/app/api/admin/ops-stats/route');
    const body = await (await GET(new Request('https://x/api/admin/ops-stats') as never)).json();
    return body.stats.overdueBalances as Array<{ id: string; balanceDue: number }>;
  };

  it('leaves out the projects that owe nothing', async () => {
    const balances = await load({
      projects: [project('paid'), project('owing')],
      payments: [{ projectId: 'paid', amount: 1_000_000, type: 'full' }],
      instalments: [
        { projectId: 'paid', status: 'paid', amountCents: 1_000_000, trigger: 'signature' },
        { projectId: 'owing', status: 'due', amountCents: 250_000, trigger: 'signature' },
      ],
    });

    expect(balances.map((b) => b.id)).toEqual(['owing']);
  });

  it('leaves out money that is merely gated or unbilled — this is the chase list', async () => {
    const balances = await load({
      projects: [project('gated'), project('unbilled')],
      payments: [],
      instalments: [
        // Deliberately held back by the schedule: not late, nobody's fault.
        { projectId: 'gated', status: 'scheduled', amountCents: 400_000, trigger: 'launch' },
        // Past its gate and never invoiced: ours to fix, and Today says so.
        { projectId: 'unbilled', status: 'scheduled', amountCents: 400_000, trigger: 'signature' },
      ],
    });

    expect(balances).toEqual([]);
  });

  it('puts the biggest debt first', async () => {
    const balances = await load({
      projects: [project('small'), project('big')],
      payments: [],
      instalments: [
        { projectId: 'small', status: 'due', amountCents: 100_000, trigger: 'signature' },
        { projectId: 'big', status: 'due', amountCents: 800_000, trigger: 'signature' },
      ],
    });

    expect(balances.map((b) => b.id)).toEqual(['big', 'small']);
  });
});
