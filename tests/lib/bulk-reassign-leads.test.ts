import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Moving up to five hundred leads from one rep to another.
 *
 * Not destructive the way bulk-delete is, but not cosmetic either:
 * `assignedToId` is what the sales dashboard filters "my leads" on, so a
 * reassignment moves a deal out of one person's pipeline and into another's,
 * along with the commission log that reads off it. Untested until now.
 *
 * The interesting cases are the ones where the assignee is not a person.
 * `null` is a legitimate value — it means unassign, and unassigned leads
 * deliberately show up for everybody so nothing falls through the cracks —
 * while a string that is not a real user id is a foreign key waiting to fail.
 * The two look similar and mean opposite things.
 */

const updateMany = vi.fn();
const userFindUnique = vi.fn();
let staff: unknown = { userId: 'user_1', role: 'owner' };

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead: { updateMany: (...a: unknown[]) => updateMany(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => staff,
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));

const { POST } = await import('@/app/api/admin/leads/bulk-reassign/route');

const post = (body: unknown) => POST({ json: async () => body } as Parameters<typeof POST>[0]);
const ids = (n: number) => Array.from({ length: n }, (_, i) => `lead_${i}`);

beforeEach(() => {
  updateMany.mockReset().mockResolvedValue({ count: 2 });
  userFindUnique.mockReset().mockResolvedValue({ id: 'user_2' });
  staff = { userId: 'user_1', role: 'owner' };
});

describe('handing leads to another rep', () => {
  it('moves exactly the ones named', async () => {
    const res = await post({ leadIds: ['a', 'b'], assignedToId: 'user_2' });

    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] } },
      data: { assignedToId: 'user_2' },
    });
  });

  it('checks the rep exists before moving anything to them', async () => {
    // Otherwise five hundred leads end up pointing at an id nobody holds, and
    // they vanish from every rep's list at once.
    userFindUnique.mockResolvedValue(null);

    const res = await post({ leadIds: ['a'], assignedToId: 'ghost' });

    expect(res.status).toBe(400);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('unassigning', () => {
  it('accepts null, which is a real answer rather than a missing one', async () => {
    // Unassigned leads show up for everybody by design, so nothing falls
    // through the cracks. null must not be mistaken for a bad assignee.
    const res = await post({ leadIds: ['a'], assignedToId: null });

    expect(res.status).toBe(200);
    expect(updateMany.mock.calls[0][0].data).toEqual({ assignedToId: null });
  });

  it('does not go looking for a user called null', async () => {
    await post({ leadIds: ['a'], assignedToId: null });

    expect(userFindUnique).not.toHaveBeenCalled();
  });
});

describe('an assignee that is not a person', () => {
  it('refuses a non-string, non-null assignee', async () => {
    for (const bad of [{ id: 'x' }, 42, ['user_2']]) {
      updateMany.mockClear();
      const res = await post({ leadIds: ['a'], assignedToId: bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(updateMany, JSON.stringify(bad)).not.toHaveBeenCalled();
    }
  });

  it('refuses an empty string rather than writing it as a foreign key', async () => {
    /*
     * The gap this found. '' is a string, so it passed the type check, and it
     * is falsy, so it skipped the "does this user exist" lookup — landing in
     * updateMany as an assignedToId of ''. That is not a user, it is a
     * foreign key violation, and it surfaced as a 500 on a bulk action rather
     * than as "that is not a valid assignee".
     */
    const res = await post({ leadIds: ['a'], assignedToId: '' });

    expect(res.status).toBe(400);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('the cap and the request shape', () => {
  it('refuses more than five hundred without moving the first five hundred', async () => {
    const res = await post({ leadIds: ids(501), assignedToId: 'user_2' });

    expect(res.status).toBe(400);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('allows exactly five hundred', async () => {
    expect((await post({ leadIds: ids(500), assignedToId: 'user_2' })).status).toBe(200);
  });

  it('refuses an empty or malformed selection', async () => {
    for (const bad of [{ leadIds: [] }, { leadIds: 'a' }, {}]) {
      updateMany.mockClear();
      const res = await post({ ...bad, assignedToId: 'user_2' });
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(updateMany).not.toHaveBeenCalled();
    }
  });

  it('refuses anybody not signed in', async () => {
    staff = null;

    expect((await post({ leadIds: ['a'], assignedToId: 'user_2' })).status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
