import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Team management is gated on `requireOwner` — per lib/middleware.ts, staff
 * share the whole admin surface and the role only decides the few actions
 * where `sales` is deliberately constrained. Deciding who else gets an
 * account is one of them.
 *
 * These tests are about who is refused, and about the two ways a team page
 * can destroy its own means of recovery: locking out every owner, or letting
 * someone demote themselves out of the page they are standing on.
 */

const userFindUnique = vi.fn();
const userFindMany = vi.fn();
const userCreate = vi.fn();
const userUpdate = vi.fn();
const userDelete = vi.fn();
const leadCount = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      findMany: (...a: unknown[]) => userFindMany(...a),
      create: (...a: unknown[]) => userCreate(...a),
      update: (...a: unknown[]) => userUpdate(...a),
      delete: (...a: unknown[]) => userDelete(...a),
    },
    lead: { count: (...a: unknown[]) => leadCount(...a) },
  },
}));

const getCurrentSession = vi.fn();
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  getCurrentSession: () => getCurrentSession(),
  hashPassword: async (p: string) => `hashed:${p}`,
  generateRandomPassword: () => 'generated-password-123',
}));

const { POST } = await import('@/app/api/admin/users/route');
const { PATCH, DELETE } = await import('@/app/api/admin/users/[userId]/route');

function body(payload: unknown) {
  return { json: async () => payload } as Parameters<typeof POST>[0];
}
function ctx(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

const OWNER = { id: 'u_kiana', role: 'owner' };
const REP = { id: 'u_evan', role: 'sales' };

function signedInAs(user: { id: string; role: string }) {
  getCurrentSession.mockResolvedValue({ type: 'user', userId: user.id, role: user.role });
  userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === user.id ? user : { id: where.id, role: 'sales' }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  signedInAs(OWNER);
  // Two owners by default, so nothing trips the lockout guard.
  userFindMany.mockResolvedValue([{ id: 'u_kiana' }, { id: 'u_other' }]);
  userCreate.mockResolvedValue({ id: 'u_new', email: 'new@bothmade.studio', role: 'sales' });
  userUpdate.mockResolvedValue({ id: 'u_evan', role: 'sales' });
  userDelete.mockResolvedValue({ id: 'u_evan' });
  leadCount.mockResolvedValue(0);
});

describe('team management — who is allowed', () => {
  it('refuses a sales account, which is assigned the inbound it could grant itself', async () => {
    signedInAs(REP);

    expect((await POST(body({ email: 'x@y.com', role: 'admin' }))).status).toBe(403);
    expect((await PATCH(body({ role: 'owner' }), ctx('u_kiana'))).status).toBe(403);
    expect((await DELETE(body({}), ctx('u_kiana'))).status).toBe(403);
    expect(userCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(userDelete).not.toHaveBeenCalled();
  });

  it('refuses a plain admin account — staff, but not owner', async () => {
    signedInAs({ id: 'u_admin', role: 'admin' });

    expect((await POST(body({ email: 'x@y.com', role: 'sales' }))).status).toBe(403);
    expect((await PATCH(body({ role: 'owner' }), ctx('u_other'))).status).toBe(403);
    expect(userCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('refuses a signed-out caller', async () => {
    getCurrentSession.mockResolvedValue(null);
    expect((await POST(body({ email: 'x@y.com', role: 'admin' }))).status).toBe(403);
  });

  it('refuses a client session', async () => {
    getCurrentSession.mockResolvedValue({ type: 'client', clientId: 'c_1' });
    expect((await POST(body({ email: 'x@y.com', role: 'admin' }))).status).toBe(403);
  });

});

describe('team management — not locking yourself out', () => {
  it('refuses to demote the last owner', async () => {
    userFindMany.mockResolvedValue([{ id: 'u_other' }]);
    signedInAs(OWNER);
    userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'u_kiana' ? OWNER : { id: 'u_other', role: 'owner' }
    );

    const res = await PATCH(body({ role: 'sales' }), ctx('u_other'));

    expect(res.status).toBe(409);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('refuses to delete the last owner', async () => {
    userFindMany.mockResolvedValue([{ id: 'u_other' }]);
    signedInAs(OWNER);

    const res = await DELETE(body({}), ctx('u_other'));

    expect(res.status).toBe(409);
    expect(userDelete).not.toHaveBeenCalled();
  });

  it('allows a demotion while another owner remains', async () => {
    const res = await PATCH(body({ role: 'sales' }), ctx('u_other'));

    expect(res.status).toBe(200);
    expect(userUpdate.mock.calls[0][0].data.role).toBe('sales');
  });

  it('refuses to let you change your own role', async () => {
    const res = await PATCH(body({ role: 'sales' }), ctx('u_kiana'));

    expect(res.status).toBe(409);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('still lets you rename yourself', async () => {
    const res = await PATCH(body({ name: 'Kiana A.' }), ctx('u_kiana'));

    expect(res.status).toBe(200);
    expect(userUpdate.mock.calls[0][0].data).toEqual({ name: 'Kiana A.' });
  });

  it('refuses to let you delete your own account', async () => {
    const res = await DELETE(body({}), ctx('u_kiana'));

    expect(res.status).toBe(409);
    expect(userDelete).not.toHaveBeenCalled();
  });
});

describe('team management — adding and removing', () => {
  it('stores only a hash, and returns the password once', async () => {
    userFindUnique.mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) =>
      where.email ? null : OWNER
    );

    const res = await POST(body({ name: 'New Person', email: 'New@Bothmade.Studio ', role: 'sales' }));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.initialPassword).toBe('generated-password-123');

    const created = userCreate.mock.calls[0][0].data;
    expect(created.email).toBe('new@bothmade.studio'); // trimmed and lowercased
    expect(created.password).toBe('hashed:generated-password-123');
    expect(created.password).not.toContain('generated-password-123'.slice(0, 4) + '"');
  });

  it('rejects a role that is not one of ours', async () => {
    userFindUnique.mockImplementation(async ({ where }: { where: { email?: string } }) =>
      where.email ? null : OWNER
    );

    expect((await POST(body({ email: 'x@y.com', role: 'superuser' }))).status).toBe(400);
    // 'constructor' is a property of every object; membership must be by value.
    expect((await POST(body({ email: 'x@y.com', role: 'constructor' }))).status).toBe(400);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('refuses a duplicate email rather than colliding on the unique index', async () => {
    userFindUnique.mockImplementation(async ({ where }: { where: { email?: string } }) =>
      where.email ? { id: 'u_existing' } : OWNER
    );

    const res = await POST(body({ email: 'evan@bothmade.studio', role: 'sales' }));

    expect(res.status).toBe(409);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('reports how many leads went unassigned on delete', async () => {
    // Lead.assignedToId is onDelete: SetNull — the pipeline survives, but
    // silently, so the count is what tells anyone to go reassign them.
    leadCount.mockResolvedValue(7);

    const res = await DELETE(body({}), ctx('u_other'));

    expect(res.status).toBe(200);
    expect((await res.json()).orphanedLeads).toBe(7);
  });
});
