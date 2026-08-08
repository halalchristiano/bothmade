import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * `PATCH /api/admin/projects/[projectId]/deployment` — the route that records
 * the two moments the agreement asks us to record, and it had no tests at all.
 *
 * That is the wrong route to leave unpinned. It is not a form: "Ready for
 * Launch" is the written confirmation Section 1 defines the phrase by and what
 * makes Payment 3 due under Section 7, and "handed over" writes a line onto
 * the CLIENT's own timeline saying the accounts, the source and the
 * intellectual property in what we built are theirs in full. Both are
 * sentences a client could later rely on.
 *
 * And Section 7 says the second one cannot happen yet: "no files or source
 * transfer, no credentials hand over, and no intellectual property assigns
 * until it has cleared." The page said so in grey text under the button. The
 * route accepted it regardless — a warning beside a control is not a check
 * inside the thing that acts.
 */

const prisma = {
  project: { findUnique: vi.fn(), update: vi.fn() },
  projectUpdate: { create: vi.fn() },
  user: { findUnique: vi.fn() },
};

const requireStaff = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));
vi.mock('@/lib/authz', () => ({ ANY_STAFF: ['owner', 'admin', 'sales'], requireRole: () => null }));

const { PATCH } = await import('@/app/api/admin/projects/[projectId]/deployment/route');

function request(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}
const params = Promise.resolve({ projectId: 'proj_1' });

const call = (body: unknown) => PATCH(request(body), { params });

/** Payments 1 and 2 settled, the final one still outstanding. */
const SCHEDULE_UNPAID = [
  { index: 1, status: 'paid', label: 'Payment 1 of 3' },
  { index: 2, status: 'paid', label: 'Payment 2 of 3' },
  { index: 3, status: 'due', label: 'Payment 3 of 3' },
];

const SCHEDULE_SETTLED = SCHEDULE_UNPAID.map((i) =>
  i.index === 3 ? { ...i, status: 'paid' } : i
);

function projectWith(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj_1',
    launchChecklist: {},
    readyForLaunchAt: null,
    handoverAt: null,
    instalments: SCHEDULE_UNPAID,
    ...overrides,
  };
}

/** The columns the update was actually asked to write. */
const written = () => prisma.project.update.mock.calls[0]?.[0]?.data ?? {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  requireStaff.mockResolvedValue({ userId: 'u1', email: 'kiana@bothmade.studio', role: 'owner' });
  prisma.project.findUnique.mockResolvedValue(projectWith());
  prisma.project.update.mockResolvedValue({ id: 'proj_1', status: 'launch' });
  prisma.projectUpdate.create.mockResolvedValue({});
  prisma.user.findUnique.mockResolvedValue({ name: 'Kiana' });
});

describe('who may use it', () => {
  it('refuses nobody at all', async () => {
    requireStaff.mockResolvedValue(null);

    const res = await call({ readyForLaunch: true });

    expect(res.status).toBe(401);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('answers 404 for a project that is gone, rather than writing', async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    const res = await call({ readyForLaunch: true });

    expect(res.status).toBe(404);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('refuses a body that asks for nothing', async () => {
    const res = await call({});

    expect(res.status).toBe(400);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });
});

describe('Ready for Launch — Section 1', () => {
  it('stamps a date and tells the client on their own timeline', async () => {
    const res = await call({ readyForLaunch: true });

    expect(res.status).toBe(200);
    expect(written().readyForLaunchAt).toBeInstanceOf(Date);
    expect(prisma.projectUpdate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: 'proj_1', title: 'Ready for launch' }),
      })
    );
  });

  /**
   * Deliberately NOT gated on the payment. This is the act that makes Payment
   * 3 due — requiring the payment first would be a circle.
   */
  it('does not wait for the final payment, because it is what makes it due', async () => {
    const res = await call({ readyForLaunch: true });

    expect(res.status).toBe(200);
  });

  it('can be taken back', async () => {
    prisma.project.findUnique.mockResolvedValue(
      projectWith({ readyForLaunchAt: new Date('2026-08-01') })
    );

    const res = await call({ readyForLaunch: false });

    expect(res.status).toBe(200);
    expect(written().readyForLaunchAt).toBeNull();
  });

  it('does not write a second timeline entry when confirmed twice', async () => {
    prisma.project.findUnique.mockResolvedValue(
      projectWith({ readyForLaunchAt: new Date('2026-08-01') })
    );

    await call({ readyForLaunch: true });

    expect(prisma.projectUpdate.create).not.toHaveBeenCalled();
  });
});

describe('the handover, and Section 7', () => {
  /**
   * The bug. The client is told the intellectual property has transferred to
   * them in full — on a project whose final invoice is still open.
   */
  it('refuses while the final instalment has not cleared', async () => {
    const res = await call({ handedOver: true });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.finalInstalmentUnpaid).toBe(true);
    expect(data.error).toMatch(/Payment 3 of 3/);
    expect(data.error).toMatch(/Section 7/);
    expect(prisma.project.update).not.toHaveBeenCalled();
    expect(prisma.projectUpdate.create).not.toHaveBeenCalled();
  });

  it('goes through once that payment is settled', async () => {
    prisma.project.findUnique.mockResolvedValue(projectWith({ instalments: SCHEDULE_SETTLED }));

    const res = await call({ handedOver: true });

    expect(res.status).toBe(200);
    expect(written().handoverAt).toBeInstanceOf(Date);
    expect(prisma.projectUpdate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Everything handed over' }),
      })
    );
  });

  /** Named, not forbidden — the rule this codebase already follows. */
  it('goes through unpaid on a second, explicit press', async () => {
    const res = await call({ handedOver: true, acknowledgeUnpaid: true });

    expect(res.status).toBe(200);
    expect(written().handoverAt).toBeInstanceOf(Date);
  });

  /** Reads the schedule by index, not by array position. */
  it('finds the final payment however the rows arrive', async () => {
    prisma.project.findUnique.mockResolvedValue(
      projectWith({ instalments: [...SCHEDULE_UNPAID].reverse() })
    );

    const res = await call({ handedOver: true });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toMatch(/Payment 3 of 3/);
  });

  it('ignores a void row when deciding which payment is last', async () => {
    prisma.project.findUnique.mockResolvedValue(
      projectWith({
        instalments: [
          { index: 1, status: 'paid', label: 'Payment 1 of 2' },
          { index: 2, status: 'paid', label: 'Payment 2 of 2' },
          { index: 3, status: 'void', label: 'Payment 3 of 3' },
        ],
      })
    );

    const res = await call({ handedOver: true });

    // The live schedule is fully paid; the cancelled row is not a debt.
    expect(res.status).toBe(200);
  });

  it('lets a project with no schedule at all hand over', async () => {
    prisma.project.findUnique.mockResolvedValue(projectWith({ instalments: [] }));

    const res = await call({ handedOver: true });

    expect(res.status).toBe(200);
  });

  /** Undoing a mistaken handover must never be blocked by the money. */
  it('never stands in the way of taking a handover back', async () => {
    prisma.project.findUnique.mockResolvedValue(
      projectWith({ handoverAt: new Date('2026-08-01') })
    );

    const res = await call({ handedOver: false });

    expect(res.status).toBe(200);
    expect(written().handoverAt).toBeNull();
  });

  /** Already recorded: re-asserting it must not re-run the gate. */
  it('does not refuse a handover that is already on the record', async () => {
    prisma.project.findUnique.mockResolvedValue(
      projectWith({ handoverAt: new Date('2026-08-01') })
    );

    const res = await call({ handedOver: true });

    expect(res.status).toBe(200);
  });
});

describe('the launch checklist', () => {
  it('merges one tick into what is already stored', async () => {
    prisma.project.findUnique.mockResolvedValue(
      projectWith({ launchChecklist: { ssl: { done: true, by: 'Kiana' } } })
    );

    await call({ check: 'forms', done: true });

    const list = written().launchChecklist as Record<string, { done: boolean }>;
    // Both, or two people ticking two boxes untick each other.
    expect(list.ssl.done).toBe(true);
    expect(list.forms.done).toBe(true);
  });

  it('records who ticked it, by name rather than by login', async () => {
    await call({ check: 'forms', done: true });

    const list = written().launchChecklist as Record<string, { by: string }>;
    expect(list.forms.by).toBe('Kiana');
  });

  it('keeps an unticked box rather than deleting it', async () => {
    prisma.project.findUnique.mockResolvedValue(
      projectWith({ launchChecklist: { forms: { done: true, by: 'Kiana' } } })
    );

    await call({ check: 'forms', done: false });

    const list = written().launchChecklist as Record<string, { done: boolean }>;
    // Somebody looked and decided it was not done — that is a fact worth keeping.
    expect(list.forms).toBeDefined();
    expect(list.forms.done).toBe(false);
  });

  it('refuses a key that is not one of the launch checks', async () => {
    const res = await call({ check: 'not-a-real-check', done: true });

    expect(res.status).toBe(400);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });
});

describe('the domain, which is where launches actually fail', () => {
  it('stores a pasted URL as a hostname', async () => {
    await call({ domainName: 'https://Havisham.co.uk/contact' });

    expect(written().domainName).toBe('havisham.co.uk');
  });

  it('refuses a domain access value it does not recognise', async () => {
    await call({ domainAccess: 'probably-fine' });

    expect(written().domainAccess).toBeNull();
  });

  it('keeps a recognised one', async () => {
    await call({ domainAccess: 'we-control' });

    expect(written().domainAccess).toBe('we-control');
  });
});
