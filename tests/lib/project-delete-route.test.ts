import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deleting a project, and the two things that are supposed to stop it.
 *
 * The route had no tests at all, which is how the hole below survived: it
 * counted invoices alongside payments and then never read the number, so the
 * guard whose own comment says "money makes it permanent" let through the
 * single most common state a real engagement is in — invoiced, not yet paid.
 */

const projectFindUnique = vi.fn();
const projectDelete = vi.fn();
const teamMessageCreate = vi.fn();
const userFindUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: (...a: unknown[]) => projectFindUnique(...a),
      delete: (...a: unknown[]) => projectDelete(...a),
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

const { POST } = await import('@/app/api/admin/projects/[projectId]/delete/route');

function request(payload: unknown) {
  return { json: async () => payload } as Parameters<typeof POST>[0];
}
const ctx = { params: Promise.resolve({ projectId: 'p_1' }) };

/** A project as the route selects it — counts included, nothing owed. */
function project(counts: Partial<{ payments: number; invoices: number; changeOrders: number }> = {}) {
  return {
    id: 'p_1',
    name: 'Northgate — Website',
    totalPrice: 1_450_000,
    client: { company: 'Northgate Dental' },
    _count: { payments: 0, invoices: 0, changeOrders: 0, ...counts },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getCurrentSession.mockResolvedValue({ type: 'user', userId: 'u_kiana', role: 'owner', iat: 2_000_000_000 });
  userFindUnique.mockResolvedValue({ sessionsValidFrom: null, role: 'owner' });
  projectFindUnique.mockResolvedValue(project());
  projectDelete.mockResolvedValue({ id: 'p_1' });
  teamMessageCreate.mockResolvedValue({ id: 'm_1' });
});

describe('the typed confirmation', () => {
  it('refuses a request that did not type the company name', async () => {
    const res = await POST(request({ confirm: 'yes' }), ctx);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('Northgate Dental'),
    });
    expect(projectDelete).not.toHaveBeenCalled();
  });

  it('accepts the name in any capitalisation, since the point is knowing which project', async () => {
    const res = await POST(request({ confirm: '  northgate DENTAL  ' }), ctx);

    expect(res.status).toBe(200);
    expect(projectDelete).toHaveBeenCalledWith({ where: { id: 'p_1' } });
  });
});

describe('records that make a deletion permanent', () => {
  it('refuses a project with a payment against it', async () => {
    projectFindUnique.mockResolvedValue(project({ payments: 2 }));

    const res = await POST(request({ confirm: 'Northgate Dental' }), ctx);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('2 payments'),
    });
    expect(projectDelete).not.toHaveBeenCalled();
  });

  /*
   * The one the route already had the number for and threw away.
   *
   * An invoice is a numbered document that went to a client. Charge raised,
   * client has not paid yet, someone tidies the project list — and BM-2026-
   * 0031 is gone out of the middle of a sequence that is supposed to be
   * unbroken.
   */
  it('refuses a project that has been invoiced but not yet paid', async () => {
    projectFindUnique.mockResolvedValue(project({ invoices: 1 }));

    const res = await POST(request({ confirm: 'Northgate Dental' }), ctx);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('1 invoice'),
    });
    expect(projectDelete).not.toHaveBeenCalled();
  });

  it('names both when both are in the way', async () => {
    projectFindUnique.mockResolvedValue(project({ payments: 1, invoices: 3 }));

    const res = await POST(request({ confirm: 'Northgate Dental' }), ctx);
    const body = await res.json();

    expect(body.error).toContain('1 payment');
    expect(body.error).toContain('3 invoices');
  });

  /*
   * Change orders cascade too, and are deliberately not a hold: an unbilled
   * scope change is a plan, not a record of money. Once one is invoiced or
   * paid the invoice count catches it.
   */
  it('deletes a project whose only history is change orders', async () => {
    projectFindUnique.mockResolvedValue(project({ changeOrders: 4 }));

    const res = await POST(request({ confirm: 'Northgate Dental' }), ctx);

    expect(res.status).toBe(200);
    expect(projectDelete).toHaveBeenCalled();
  });
});

describe('what is left behind', () => {
  it('writes to team chat before the row goes, since everywhere else is inside it', async () => {
    await POST(request({ confirm: 'Northgate Dental' }), ctx);

    expect(teamMessageCreate).toHaveBeenCalled();
    const [{ data }] = teamMessageCreate.mock.calls[0] as [{ data: { content: string } }];
    expect(data.content).toContain('Northgate — Website');
    expect(data.content).toContain('Northgate Dental');

    const announcedAt = teamMessageCreate.mock.invocationCallOrder[0];
    const deletedAt = projectDelete.mock.invocationCallOrder[0];
    expect(announcedAt).toBeLessThan(deletedAt);
  });

  it('still deletes when the announcement fails, rather than losing the delete to it', async () => {
    teamMessageCreate.mockRejectedValue(new Error('team chat is down'));

    const res = await POST(request({ confirm: 'Northgate Dental' }), ctx);

    expect(res.status).toBe(200);
    expect(projectDelete).toHaveBeenCalled();
  });
});

describe('who may ask', () => {
  it('refuses a caller who is not signed in as staff', async () => {
    getCurrentSession.mockResolvedValue(null);

    const res = await POST(request({ confirm: 'Northgate Dental' }), ctx);

    expect(res.status).toBe(401);
    expect(projectDelete).not.toHaveBeenCalled();
  });
});
