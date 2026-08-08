import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deleting several projects at once, which exists for one reason: a studio
 * accumulates test projects that sit in the handoff queue looking exactly
 * like work waiting to be picked up, and removing them one at a time is
 * enough friction that they stay.
 *
 * The things worth pinning down are the ones that make it safe to have at
 * all — that it is owner-only, that the phrase cannot be typed ahead of the
 * selection, and that a real project mixed in with the test ones survives
 * without taking the whole batch down with it.
 */

const projectFindMany = vi.fn();
const projectDeleteMany = vi.fn();
const teamMessageCreate = vi.fn();
const userFindUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findMany: (...a: unknown[]) => projectFindMany(...a),
      deleteMany: (...a: unknown[]) => projectDeleteMany(...a),
    },
    teamMessage: { create: (...a: unknown[]) => teamMessageCreate(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));

const getCurrentSession = vi.fn();
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  getCurrentSession: () => getCurrentSession(),
}));

const { POST } = await import('@/app/api/admin/projects/bulk-delete/route');

function request(payload: unknown) {
  return { json: async () => payload } as Parameters<typeof POST>[0];
}

function project(id: string, company: string, counts = { payments: 0, invoices: 0 }) {
  return { id, name: `${company} — Website`, client: { company }, _count: counts };
}

const TEST_ROWS = [project('p_1', 'testing_company'), project('p_2', 'Finale test')];

function signedInAs(role: 'owner' | 'sales') {
  getCurrentSession.mockResolvedValue({ type: 'user', userId: 'u_kiana', role, iat: 2_000_000_000 });
  userFindUnique.mockResolvedValue({ sessionsValidFrom: null, role });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  signedInAs('owner');
  projectFindMany.mockResolvedValue(TEST_ROWS);
  projectDeleteMany.mockResolvedValue({ count: 2 });
  teamMessageCreate.mockResolvedValue({ id: 'm_1' });
});

describe('who may run it', () => {
  it('refuses a caller who is not signed in', async () => {
    getCurrentSession.mockResolvedValue(null);

    const res = await POST(request({ projectIds: ['p_1'], confirm: 'delete 1 project' }));

    expect(res.status).toBe(401);
    expect(projectDeleteMany).not.toHaveBeenCalled();
  });

  it('refuses a sales account, the way bulk lead deletion does', async () => {
    signedInAs('sales');

    const res = await POST(request({ projectIds: ['p_1'], confirm: 'delete 1 project' }));

    expect(res.status).toBe(403);
    expect(projectDeleteMany).not.toHaveBeenCalled();
  });
});

describe('the typed phrase', () => {
  it('refuses when it does not match', async () => {
    const res = await POST(request({ projectIds: ['p_1', 'p_2'], confirm: 'delete' }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('delete 2 projects'),
    });
    expect(projectDeleteMany).not.toHaveBeenCalled();
  });

  /*
   * The point of putting the count in the phrase. Type it for six, tick a
   * seventh row, and the request that arrives is for seven with a phrase for
   * six — which must not go through.
   */
  it('refuses a phrase written for a different number of projects', async () => {
    const res = await POST(request({ projectIds: ['p_1', 'p_2'], confirm: 'delete 1 project' }));

    expect(res.status).toBe(400);
    expect(projectDeleteMany).not.toHaveBeenCalled();
  });

  it('reads it case-insensitively, and forgives extra spacing', async () => {
    const res = await POST(request({ projectIds: ['p_1', 'p_2'], confirm: '  Delete 2   Projects ' }));

    expect(res.status).toBe(200);
    expect(projectDeleteMany).toHaveBeenCalled();
  });

  it('says "project" rather than "projects" when there is one', async () => {
    projectFindMany.mockResolvedValue([TEST_ROWS[0]]);
    projectDeleteMany.mockResolvedValue({ count: 1 });

    const res = await POST(request({ projectIds: ['p_1'], confirm: 'delete 1 project' }));

    expect(res.status).toBe(200);
  });
});

describe('the selection itself', () => {
  it('refuses an empty selection', async () => {
    const res = await POST(request({ projectIds: [], confirm: 'delete 0 projects' }));

    expect(res.status).toBe(400);
    expect(projectDeleteMany).not.toHaveBeenCalled();
  });

  it('refuses more than fifty at a time', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `p_${i}`);

    const res = await POST(request({ projectIds: ids, confirm: 'delete 51 projects' }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('50') });
    expect(projectDeleteMany).not.toHaveBeenCalled();
  });

  it('counts a duplicated id once, so the phrase matches what is really selected', async () => {
    projectFindMany.mockResolvedValue([TEST_ROWS[0]]);
    projectDeleteMany.mockResolvedValue({ count: 1 });

    const res = await POST(request({ projectIds: ['p_1', 'p_1'], confirm: 'delete 1 project' }));

    expect(res.status).toBe(200);
  });

  it('reports rather than pretends when the rows are already gone', async () => {
    projectFindMany.mockResolvedValue([]);

    const res = await POST(request({ projectIds: ['p_1'], confirm: 'delete 1 project' }));

    expect(res.status).toBe(404);
    expect(projectDeleteMany).not.toHaveBeenCalled();
  });
});

describe('projects that hold accounting records', () => {
  /*
   * The case this is built around: five test projects and one real one
   * selected together. Refusing the batch means working out which, by hand,
   * which is the job the bulk delete was supposed to remove.
   */
  it('deletes the rest and leaves the paid one behind', async () => {
    projectFindMany.mockResolvedValue([
      ...TEST_ROWS,
      project('p_3', 'Northgate Dental', { payments: 2, invoices: 0 }),
    ]);

    const res = await POST(
      request({ projectIds: ['p_1', 'p_2', 'p_3'], confirm: 'delete 3 projects' })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(projectDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ['p_1', 'p_2'] } } });
    expect(body.blocked).toEqual([
      expect.objectContaining({ company: 'Northgate Dental', reason: '2 payments' }),
    ]);
  });

  it('leaves an invoiced project behind too, paid or not', async () => {
    projectFindMany.mockResolvedValue([
      TEST_ROWS[0],
      project('p_3', 'Northgate Dental', { payments: 0, invoices: 1 }),
    ]);

    const res = await POST(request({ projectIds: ['p_1', 'p_3'], confirm: 'delete 2 projects' }));
    const body = await res.json();

    expect(projectDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ['p_1'] } } });
    expect(body.blocked[0].reason).toBe('1 invoice');
  });

  it('deletes nothing, and says so, when every one of them is held', async () => {
    projectFindMany.mockResolvedValue([
      project('p_1', 'Northgate Dental', { payments: 1, invoices: 0 }),
      project('p_2', 'Harbourline Marine', { payments: 0, invoices: 2 }),
    ]);

    const res = await POST(request({ projectIds: ['p_1', 'p_2'], confirm: 'delete 2 projects' }));

    expect(res.status).toBe(409);
    expect(projectDeleteMany).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({
      blocked: [expect.objectContaining({ company: 'Northgate Dental' }), expect.anything()],
    });
  });
});

describe('what the team is told', () => {
  it('writes one message for the batch, before anything goes', async () => {
    await POST(request({ projectIds: ['p_1', 'p_2'], confirm: 'delete 2 projects' }));

    expect(teamMessageCreate).toHaveBeenCalledTimes(1);
    const [{ data }] = teamMessageCreate.mock.calls[0] as [{ data: { content: string } }];
    expect(data.content).toContain('testing_company');
    expect(data.content).toContain('Finale test');

    expect(teamMessageCreate.mock.invocationCallOrder[0]).toBeLessThan(
      projectDeleteMany.mock.invocationCallOrder[0]
    );
  });

  it('names what it left alone, so a skipped project is not silently skipped', async () => {
    projectFindMany.mockResolvedValue([
      TEST_ROWS[0],
      project('p_3', 'Northgate Dental', { payments: 2, invoices: 0 }),
    ]);

    await POST(request({ projectIds: ['p_1', 'p_3'], confirm: 'delete 2 projects' }));

    const [{ data }] = teamMessageCreate.mock.calls[0] as [{ data: { content: string } }];
    expect(data.content).toContain('Left 1 alone');
    expect(data.content).toContain('Northgate Dental');
  });

  it('still deletes when the announcement fails', async () => {
    teamMessageCreate.mockRejectedValue(new Error('team chat is down'));

    const res = await POST(request({ projectIds: ['p_1', 'p_2'], confirm: 'delete 2 projects' }));

    expect(res.status).toBe(200);
    expect(projectDeleteMany).toHaveBeenCalled();
  });
});
