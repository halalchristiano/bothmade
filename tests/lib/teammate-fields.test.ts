import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIELD_LIMITS } from '@/lib/validation';

/**
 * The three places a staff member's name, title and address get written.
 *
 * Settings, where you edit your own. /admin/team, where an owner adds a
 * teammate. And /admin/team again, where an owner edits one. They write the
 * same two columns, and until now only the first of them had any limits — so
 * the rule depended on which page you happened to be standing on.
 *
 * The address matters more than either. On a public form a bad one costs a
 * reply; here it costs the account. The password is generated, shown once in
 * the create response and stored only as a hash, so an address with a typo in
 * it produces a login nobody can use and nobody can reset — a reset mail goes
 * to a mailbox that does not exist — and the row sits in the team list
 * looking like a colleague.
 */

const create = vi.fn(async (_a: unknown) => ({ id: 'u_new', name: null, email: 'x', role: 'sales', title: null, createdAt: new Date() }));
const update = vi.fn(async (_a: unknown) => ({ id: 'u1', name: null, email: 'x', role: 'sales', title: null, createdAt: new Date() }));
const findUnique = vi.fn(async (_a: unknown) => null as unknown);
const findMany = vi.fn(async (_a: unknown) => [{ id: 'owner_1' }, { id: 'u1' }]);

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      create: (a: unknown) => create(a),
      update: (a: unknown) => update(a),
      findUnique: (a: unknown) => findUnique(a),
      findMany: (a: unknown) => findMany(a),
    },
    lead: { count: async () => 0 },
  },
}));
vi.mock('@/lib/middleware', () => ({
  requireOwner: async () => ({ type: 'user', userId: 'owner_1', email: 'k@bothmade.studio', role: 'owner' }),
  requireStaff: async () => ({ type: 'user', userId: 'owner_1', email: 'k@bothmade.studio', role: 'owner' }),
  forbiddenResponse: (m: string) => new Response(JSON.stringify({ error: m }), { status: 403 }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));
vi.mock('@/lib/auth', () => ({
  hashPassword: async () => 'hashed',
  generateRandomPassword: () => 'generated-one',
}));

const { POST } = await import('@/app/api/admin/users/route');
const { PATCH } = await import('@/app/api/admin/users/[userId]/route');

const body = (payload: unknown, method: string) =>
  new Request('https://bothmade.studio/api/admin/users', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

const add = async (payload: unknown) => {
  const res = await POST(body(payload, 'POST') as never);
  return { status: res.status, body: await res.json() };
};

const edit = async (payload: unknown) => {
  const res = await PATCH(body(payload, 'PATCH') as never, {
    params: Promise.resolve({ userId: 'u1' }),
  } as never);
  return { status: res.status, body: await res.json() };
};

const written = (fn: typeof create) => (fn.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> }).data;

beforeEach(() => {
  create.mockClear();
  update.mockClear();
  findUnique.mockReset();
  // No existing account with this address; the PATCH target exists and is not
  // the last owner.
  findUnique.mockResolvedValue(null);
});

describe('adding a teammate', () => {
  it('refuses an address that is not one', async () => {
    const { status, body } = await add({ email: 'evan at bothmade', role: 'sales' });

    expect(status).toBe(400);
    expect(body.error).toMatch(/email/i);
    // Nothing created — the account would have been unreachable and
    // unrecoverable, and it would have looked fine in the team list.
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an address carrying a second one in a display name', async () => {
    const { status } = await add({ email: 'Evan <evil@elsewhere.test>', role: 'sales' });

    expect(status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('still accepts a real address, lowercased', async () => {
    findUnique.mockResolvedValue(null);
    const { status } = await add({ email: '  Evan@Bothmade.Studio ', role: 'sales' });

    expect(status).toBe(201);
    expect(written(create).email).toBe('evan@bothmade.studio');
  });

  it('caps the name and title it stores', async () => {
    findUnique.mockResolvedValue(null);
    const { status } = await add({
      email: 'new@bothmade.studio',
      role: 'sales',
      name: 'N'.repeat(500),
      title: 'T'.repeat(500),
    });

    expect(status).toBe(201);
    expect(String(written(create).name)).toHaveLength(FIELD_LIMITS.name);
    expect(String(written(create).title)).toHaveLength(FIELD_LIMITS.title);
  });
});

describe('editing a teammate', () => {
  beforeEach(() => {
    findUnique.mockResolvedValue({ id: 'u1', role: 'sales' });
  });

  it('caps the name and title an owner types in', async () => {
    const { status } = await edit({ name: 'N'.repeat(500), title: 'T'.repeat(500) });

    expect(status).toBe(200);
    expect(String(written(update).name)).toHaveLength(FIELD_LIMITS.name);
    expect(String(written(update).title)).toHaveLength(FIELD_LIMITS.title);
  });

  it('still treats a blank name as no name', async () => {
    const { status } = await edit({ name: '   ' });

    expect(status).toBe(200);
    expect(written(update).name).toBeNull();
  });
});
