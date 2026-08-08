import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * `PUT /api/projects/[projectId]` — the route that decides what a staff
 * account may change on a project by writing straight to the columns, and it
 * had no tests at all.
 *
 * That matters because the interesting thing about it is what it *refuses*,
 * and a refusal nothing pins is a refusal somebody re-adds while tidying. The
 * price fields were taken out of it once already: they moved a contracted
 * total with no record written, no client told, and no instalment schedule
 * following — and Section 9 says scope and fee move by written amendment.
 *
 * `status` and `statusStage` were the same shape and were still here. Moving
 * a stage is an event, not a column: /api/admin/projects/[id]/status writes a
 * ProjectUpdate the client reads, emails them, and works out whether the move
 * opened a payment gate. Writing the column directly did the one part that
 * changes money — gateReached() reads statusStage to decide what is owed —
 * and none of the parts that tell anybody.
 */

const prisma = {
  project: { findUnique: vi.fn(), update: vi.fn() },
  client: { findUnique: vi.fn() },
  instalment: { count: vi.fn(), findMany: vi.fn() },
  projectUpdate: { create: vi.fn() },
  lead: { findUnique: vi.fn() },
};

const getCurrentSession = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/auth', () => ({ getCurrentSession: () => getCurrentSession() }));
vi.mock('@/lib/email', () => ({ sendProjectLiveEmail: vi.fn(async () => ({ sent: true })) }));

const { PUT } = await import('@/app/api/projects/[projectId]/route');

function request(body: unknown): NextRequest {
  return { json: async () => body, headers: { get: () => null } } as unknown as NextRequest;
}
const params = Promise.resolve({ projectId: 'p1' });

const STAFF = { type: 'user', userId: 'u1', email: 'kiana@bothmade.studio', role: 'owner' };

/** The columns the update was actually asked to write. */
function written() {
  return prisma.project.update.mock.calls[0]?.[0]?.data ?? {};
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getCurrentSession.mockResolvedValue(STAFF);
  prisma.project.findUnique.mockResolvedValue({
    id: 'p1',
    clientId: 'c1',
    name: 'Okafor Plumbing Site',
    status: 'design',
    statusStage: 1,
    liveUrl: null,
    handoffAcknowledgedAt: null,
    totalPrice: 500000,
  });
  prisma.project.update.mockResolvedValue({ id: 'p1', name: 'Okafor Plumbing Site', liveUrl: null });
  prisma.client.findUnique.mockResolvedValue(null);
  prisma.instalment.count.mockResolvedValue(0);
  prisma.instalment.findMany.mockResolvedValue([]);
  prisma.projectUpdate.create.mockResolvedValue({});
  prisma.lead.findUnique.mockResolvedValue(null);
});

describe('who may use it at all', () => {
  it('refuses a client, even on their own project', async () => {
    getCurrentSession.mockResolvedValue({ type: 'client', clientId: 'c1' });

    const res = await PUT(request({ name: 'Renamed by the client' }), { params });

    expect(res.status).toBe(401);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('refuses nobody at all', async () => {
    getCurrentSession.mockResolvedValue(null);

    const res = await PUT(request({ name: 'x' }), { params });

    expect(res.status).toBe(401);
  });
});

describe('what it will not write, whatever the body says', () => {
  /**
   * The stage is what gateReached() reads to decide which instalments are
   * owed. A raw write moves the money gates and tells nobody.
   */
  it.each(['status', 'statusStage', 'baseService', 'addOns', 'basePrice', 'totalPrice'])(
    'ignores %s',
    async (field) => {
      await PUT(
        request({
          status: 'launch',
          statusStage: 3,
          baseService: 'multi',
          addOns: 'seo,hosting',
          basePrice: 1,
          totalPrice: 1,
        }),
        { params }
      );

      expect(written()).not.toHaveProperty(field);
    }
  );

  it('still writes the fields the app actually sends', async () => {
    await PUT(
      request({ liveUrl: 'https://okaforplumbing.co.uk', estimatedCompletionDate: null }),
      { params }
    );

    const data = written();
    expect(data.liveUrl).toBe('https://okaforplumbing.co.uk');
    expect(data.estimatedCompletionDate).toBeNull();
  });

  /**
   * A stage change has to go through the route that records it. If this ever
   * starts writing the column again, the two paths disagree about what a
   * project's stage means and only one of them tells the client.
   */
  it('leaves the stage exactly where it found it', async () => {
    await PUT(request({ status: 'complete', statusStage: 4 }), { params });

    const data = written();
    expect(data.status).toBeUndefined();
    expect(data.statusStage).toBeUndefined();
  });
});

describe('the handoff acknowledgement, which is what the UI does send', () => {
  it('stamps a time the first time it is acknowledged', async () => {
    await PUT(request({ acknowledgeHandoff: true }), { params });

    expect(written().handoffAcknowledgedAt).toBeInstanceOf(Date);
  });

  it('does not re-stamp one already acknowledged', async () => {
    const first = new Date('2026-08-01T10:00:00.000Z');
    prisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      clientId: 'c1',
      name: 'Okafor Plumbing Site',
      status: 'design',
      statusStage: 1,
      liveUrl: null,
      handoffAcknowledgedAt: first,
      totalPrice: 500000,
    });

    await PUT(request({ acknowledgeHandoff: true }), { params });

    // Re-stamping would move the date somebody may be counting days from.
    expect(written().handoffAcknowledgedAt).toBeUndefined();
  });

  it('can be taken back', async () => {
    await PUT(request({ acknowledgeHandoff: false }), { params });

    expect(written().handoffAcknowledgedAt).toBeNull();
  });

  it('leaves it alone when the body says nothing about it', async () => {
    await PUT(request({ liveUrl: 'https://x.co.uk' }), { params });

    expect(written().handoffAcknowledgedAt).toBeUndefined();
  });
});

describe('a project that is not there', () => {
  it('answers 404 rather than writing', async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    const res = await PUT(request({ name: 'x' }), { params });

    expect(res.status).toBe(404);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });
});
