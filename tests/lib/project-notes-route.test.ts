import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * `/api/admin/projects/[projectId]/notes` — the internal notes on a project.
 * No tests, and `if (!content)` was the whole of its validation.
 *
 * These are where "spoke to Dana, she wants the booking form above the fold"
 * lives: written once, from a phone call, and read back by whoever picks the
 * project up next. Not client-facing, which is why nothing here is dramatic —
 * but three things got through that check, and each of them ends as either a
 * row nobody can explain or a 500 that reads as our fault.
 */

const prisma = {
  teamNote: { findMany: vi.fn(), create: vi.fn() },
  project: { findUnique: vi.fn() },
};

const requireStaff = vi.fn();
const requireRole = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));
vi.mock('@/lib/authz', () => ({
  ANY_STAFF: ['owner', 'admin', 'sales'],
  requireRole: (...args: unknown[]) => requireRole(...args),
}));

const { GET, POST } = await import('@/app/api/admin/projects/[projectId]/notes/route');

const params = Promise.resolve({ projectId: 'proj_1' });
const post = (body: unknown) =>
  POST({ json: async () => body } as unknown as NextRequest, { params });
const get = () => GET({} as unknown as NextRequest, { params });

const written = () => prisma.teamNote.create.mock.calls[0]?.[0]?.data ?? {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  requireStaff.mockResolvedValue({ userId: 'u1', email: 'kiana@bothmade.studio', role: 'owner' });
  requireRole.mockReturnValue(null);
  prisma.project.findUnique.mockResolvedValue({ id: 'proj_1' });
  prisma.teamNote.create.mockResolvedValue({ id: 'n1' });
  prisma.teamNote.findMany.mockResolvedValue([]);
});

describe('who may read or write them', () => {
  it('refuses nobody at all, on both', async () => {
    requireStaff.mockResolvedValue(null);

    expect((await get()).status).toBe(401);
    expect((await post({ content: 'x' })).status).toBe(401);
    expect(prisma.teamNote.create).not.toHaveBeenCalled();
  });

  it('refuses a role the guard turns away', async () => {
    requireRole.mockReturnValue(new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }));

    expect((await post({ content: 'x' })).status).toBe(403);
  });
});

describe('writing a note', () => {
  it('records it against the project and the person who wrote it', async () => {
    const res = await post({ content: 'Spoke to Dana — booking form above the fold.' });

    expect(res.status).toBe(201);
    expect(written()).toMatchObject({
      projectId: 'proj_1',
      content: 'Spoke to Dana — booking form above the fold.',
      authorId: 'u1',
    });
  });

  it('newest first when read back', async () => {
    await get();

    expect(prisma.teamNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } })
    );
  });

  /**
   * A string of spaces is only falsy when it is empty, so `if (!content)`
   * let it through — and it became a blank grey box nobody can explain or
   * delete.
   */
  it.each(['   ', '\n\n', '\t'])('refuses a note of nothing but whitespace (%j)', async (content) => {
    const res = await post({ content });

    expect(res.status).toBe(400);
    expect(prisma.teamNote.create).not.toHaveBeenCalled();
  });

  it('trims what it does store', async () => {
    await post({ content: '  Chased the logo files.  ' });

    expect(written().content).toBe('Chased the logo files.');
  });

  /** Anything but a string used to reach the column and fail there, as a 500. */
  it.each([42, null, { text: 'hello' }, ['a']])('refuses %j rather than answering 500', async (content) => {
    const res = await post({ content });

    expect(res.status).toBe(400);
    expect(prisma.teamNote.create).not.toHaveBeenCalled();
  });

  it('answers 400 for a body that is not JSON', async () => {
    const res = await POST(
      { json: async () => { throw new SyntaxError('bad'); } } as unknown as NextRequest,
      { params }
    );

    expect(res.status).toBe(400);
  });

  it('caps something pasted in at length', async () => {
    await post({ content: 'x'.repeat(9000) });

    expect(written().content).toHaveLength(5000);
  });

  /**
   * A stale tab writing to a project somebody else deleted is the ordinary
   * way this happens with several people in the admin at once. It used to
   * fail on the foreign key and answer 500 — "we broke", for a bad request.
   */
  it('answers 404 for a project that is gone', async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    const res = await post({ content: 'Chased the logo files.' });

    expect(res.status).toBe(404);
    expect(prisma.teamNote.create).not.toHaveBeenCalled();
  });
});
