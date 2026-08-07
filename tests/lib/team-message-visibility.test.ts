import { beforeEach, describe, expect, it, vi } from 'vitest';
import { visibleToWhere } from '@/lib/team-chat';

/**
 * A DM between two other people is not yours to touch, either.
 *
 * The listing route has always been careful about this, and says why: the
 * chat's "Only the two of you see this" is a promise the API has to keep,
 * not a filter the browser applies. Resolving a flag did not keep it. It
 * looked a message up by id alone, so any staff account could clear or
 * re-raise the urgent flag on a conversation it was not allowed to open —
 * the flag disappears from the other pair's bell, or comes back, and neither
 * of them did it.
 *
 * The id is a cuid and the listing route will not hand one over, which is
 * why this stayed quiet. It is still a write on somebody else's thread, and
 * the fix is the clause the listing route already had.
 */

const updateMany = vi.fn(async (_a: unknown) => ({ count: 1 }));

vi.mock('@/lib/prisma', () => ({ prisma: { teamMessage: { updateMany: (a: unknown) => updateMany(a) } } }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ type: 'user', userId: 'user_kiana', email: 'k@bothmade.studio', role: 'owner' }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));

const { PATCH } = await import('@/app/api/admin/team-messages/[messageId]/route');

const resolve = async (messageId: string) => {
  const res = await PATCH(
    new Request('https://bothmade.studio/x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolved: true }),
    }) as never,
    { params: Promise.resolve({ messageId }) } as never
  );
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  updateMany.mockReset();
  updateMany.mockResolvedValue({ count: 1 });
});

describe('resolving a flag', () => {
  it('only ever updates a message the caller can see', async () => {
    await resolve('msg_1');

    const where = (updateMany.mock.calls[0][0] as { where: { AND: unknown[] } }).where;
    // Not `{ id }` on its own — the visibility clause rides along with it.
    expect(where.AND).toEqual([{ id: 'msg_1' }, visibleToWhere('user_kiana')]);
  });

  it('answers 404 for a message it may not touch, saying nothing about why', async () => {
    // Nothing matched: either no such message, or one in somebody else's DM.
    // The caller is told the same thing either way — confirming which would
    // leak that a private thread exists.
    updateMany.mockResolvedValue({ count: 0 });

    const { status, body } = await resolve('msg_someone_elses');

    expect(status).toBe(404);
    expect(JSON.stringify(body)).not.toMatch(/permission|allowed|private/i);
  });

  it('still resolves a message the caller can see', async () => {
    const { status } = await resolve('msg_1');
    expect(status).toBe(200);
  });
});

describe('the visibility clause itself', () => {
  it('covers broadcasts and both sides of my own DMs, and nothing else', () => {
    expect(visibleToWhere('me')).toEqual({
      OR: [{ toUserId: null }, { toUserId: 'me' }, { fromUserId: 'me' }],
    });
  });
});
