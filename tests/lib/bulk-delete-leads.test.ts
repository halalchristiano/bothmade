import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deleting up to five hundred leads in one request.
 *
 * The route calls itself "the most destructive thing the CRM can do", and it
 * is right: the delete cascades, so each row takes its entire activity
 * history with it — every logged call, every note, every email. There is no
 * undo and no soft-delete column. It was covered by nothing.
 *
 * What these assert is less "does it delete" than "does it refuse". Every
 * guard on this route is only worth having if it runs BEFORE the deleteMany,
 * so each refusal is checked twice: the status that comes back, and the fact
 * that nothing was deleted on the way to it. A check that answers 403 after
 * wiping the rows is not a check.
 */

const deleteMany = vi.fn();
let staff: unknown = { userId: 'user_1', role: 'owner' };
let owner: unknown = { userId: 'user_1', role: 'owner' };

vi.mock('@/lib/prisma', () => ({ prisma: { lead: { deleteMany: (...a: unknown[]) => deleteMany(...a) } } }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => staff,
  requireOwner: async () => owner,
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  forbiddenResponse: (msg?: string) =>
    new Response(JSON.stringify({ error: msg ?? 'Forbidden' }), { status: 403 }),
}));

const { POST } = await import('@/app/api/admin/leads/bulk-delete/route');

const post = (body: unknown) =>
  POST({ json: async () => body } as Parameters<typeof POST>[0]);

const ids = (n: number) => Array.from({ length: n }, (_, i) => `lead_${i}`);

beforeEach(() => {
  deleteMany.mockReset().mockResolvedValue({ count: 3 });
  staff = { userId: 'user_1', role: 'owner' };
  owner = { userId: 'user_1', role: 'owner' };
});

describe('an owner', () => {
  it('deletes exactly the leads named, and says how many', async () => {
    const res = await post({ leadIds: ['lead_a', 'lead_b', 'lead_c'] });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.count).toBe(3);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['lead_a', 'lead_b', 'lead_c'] } } });
  });

  it('can delete right up to the cap', async () => {
    expect((await post({ leadIds: ids(500) })).status).toBe(200);
  });
});

describe('a rep', () => {
  it('is refused, and told who can do it', async () => {
    owner = null;

    const res = await post({ leadIds: ['lead_a'] });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/owner/i);
  });

  it('deletes nothing on the way to being refused', async () => {
    owner = null;

    await post({ leadIds: ['lead_a', 'lead_b'] });

    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe('nobody at all', () => {
  it('is refused before the owner check even runs', async () => {
    staff = null;
    owner = null;

    const res = await post({ leadIds: ['lead_a'] });

    expect(res.status).toBe(401);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe('the cap and the shape of the request', () => {
  it('refuses more than five hundred without deleting the first five hundred', async () => {
    // The cap exists so one runaway request cannot take the table with it.
    // It is only a cap if it is checked first.
    const res = await post({ leadIds: ids(501) });

    expect(res.status).toBe(400);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('refuses an empty selection rather than treating it as "all"', async () => {
    // `deleteMany({ where: { id: { in: [] } } })` is harmless, but a route
    // that shrugs at an empty list is one edit away from one that does not.
    const res = await post({ leadIds: [] });

    expect(res.status).toBe(400);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('refuses anything that is not a list of ids', async () => {
    for (const bad of [{ leadIds: 'lead_a' }, { leadIds: null }, {}, { leadIds: 42 }]) {
      deleteMany.mockClear();
      const res = await post(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(deleteMany, JSON.stringify(bad)).not.toHaveBeenCalled();
    }
  });

  it('answers 500 rather than pretending, when the delete itself fails', async () => {
    deleteMany.mockRejectedValue(new Error('deadlock'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect((await post({ leadIds: ['lead_a'] })).status).toBe(500);
  });
});
