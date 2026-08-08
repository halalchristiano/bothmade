import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * `/api/admin/projects/[projectId]/deliverables` — the handover pack. Exhibit
 * A puts credentials, source and documentation in the Launch phase, and this
 * is the list the client downloads them from. It had no tests.
 *
 * The list is one JSON string in one column, and both handlers read the whole
 * blob, changed it in memory and wrote it back. Two requests overlapping —
 * which is exactly what handover looks like, two people adding files from the
 * same pack — both read the same list, and whichever wrote second silently
 * erased the other's file. No error anywhere. The file is simply not there.
 *
 * These pin the lock that fixes it, and the two smaller lies beside it: a
 * delete of a file that is not there answering "success", and an update
 * against a project that no longer exists answering 500.
 */

const tx = {
  $queryRaw: vi.fn(),
  project: { update: vi.fn() },
};

const prisma = {
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  project: { findUnique: vi.fn(), update: vi.fn() },
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

const { POST, DELETE } = await import('@/app/api/admin/projects/[projectId]/deliverables/route');

const params = Promise.resolve({ projectId: 'proj_1' });
const post = (body: unknown) =>
  POST({ json: async () => body } as unknown as NextRequest, { params });
const del = (id?: string) =>
  DELETE(
    {
      url: `https://bothmade.studio/api/admin/projects/proj_1/deliverables${id ? `?id=${id}` : ''}`,
    } as unknown as NextRequest,
    { params }
  );

const EXISTING = [
  { id: 'd1', name: 'Brand guidelines.pdf', url: 'https://files.test/brand.pdf', addedAt: '2026-08-01T09:00:00.000Z' },
];

/** What the locking read hands back. */
function rowHolds(list: unknown[] | null) {
  tx.$queryRaw.mockResolvedValue(list === null ? [] : [{ deliverables: JSON.stringify(list) }]);
}

/** The list the transaction actually wrote. */
function written() {
  const raw = tx.project.update.mock.calls[0]?.[0]?.data?.deliverables;
  return raw ? JSON.parse(raw) : null;
}

const GOOD = { name: 'Source.zip', url: 'https://files.test/source.zip', size: '2.4 MB' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  requireStaff.mockResolvedValue({ userId: 'u1', email: 'kiana@bothmade.studio', role: 'owner' });
  requireRole.mockReturnValue(null);
  rowHolds(EXISTING);
  tx.project.update.mockResolvedValue({});
  prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
});

describe('who may touch the handover pack', () => {
  it('refuses nobody at all', async () => {
    requireStaff.mockResolvedValue(null);

    expect((await post(GOOD)).status).toBe(401);
    expect(tx.project.update).not.toHaveBeenCalled();
  });

  it('refuses a role the guard turns away', async () => {
    requireRole.mockReturnValue(new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }));

    expect((await post(GOOD)).status).toBe(403);
  });
});

describe('adding a file', () => {
  /**
   * The lock. Without it the read and the write are two round trips with a
   * gap in the middle, and the gap is where somebody else's file goes.
   */
  it('reads the row under FOR UPDATE, inside a transaction', async () => {
    await post(GOOD);

    expect(prisma.$transaction).toHaveBeenCalled();
    const sql = tx.$queryRaw.mock.calls[0][0].join('?');
    expect(sql).toMatch(/FOR UPDATE/);
  });

  it('keeps what was already there', async () => {
    await post(GOOD);

    const list = written();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('d1');
    expect(list[1]).toMatchObject({ name: 'Source.zip', url: 'https://files.test/source.zip' });
  });

  /**
   * The concurrency case, stated directly: the second writer must build on
   * what the lock handed it, not on a list it read before the first one wrote.
   */
  it('builds on whatever the locked read returned, not on a stale list', async () => {
    rowHolds([
      ...EXISTING,
      { id: 'd2', name: 'Added by somebody else.pdf', url: 'https://files.test/other.pdf', addedAt: '2026-08-02T09:00:00.000Z' },
    ]);

    await post(GOOD);

    const list = written();
    expect(list).toHaveLength(3);
    expect(list.map((d: { name: string }) => d.name)).toContain('Added by somebody else.pdf');
  });

  it('refuses a file name typed into the URL box', async () => {
    // Not a host, whatever it looks like — see deliverableHref.
    const res = await post({ name: 'Source.zip', url: 'Source.zip' });

    expect(res.status).toBe(400);
    expect(tx.project.update).not.toHaveBeenCalled();
  });

  it('answers 404 for a project that is gone, rather than 500', async () => {
    tx.$queryRaw.mockResolvedValue([]);

    const res = await post(GOOD);

    expect(res.status).toBe(404);
    expect(tx.project.update).not.toHaveBeenCalled();
  });

  it('answers 400 for a body that is not JSON', async () => {
    const res = await POST(
      { json: async () => { throw new SyntaxError('bad'); } } as unknown as NextRequest,
      { params }
    );

    expect(res.status).toBe(400);
  });

  /** Free text out of a form, and it lands on the client's dashboard. */
  it('caps the size label and drops a non-string one', async () => {
    await post({ ...GOOD, size: 'x'.repeat(200) });
    expect(written()[1].size).toHaveLength(40);

    vi.clearAllMocks();
    rowHolds(EXISTING);
    await post({ ...GOOD, size: { nope: true } });
    expect(written()[1].size).toBeUndefined();
  });

  it('survives a stored blob that is not a list', async () => {
    tx.$queryRaw.mockResolvedValue([{ deliverables: '{"not":"an array"}' }]);

    const res = await post(GOOD);

    expect(res.status).toBe(201);
    expect(written()).toHaveLength(1);
  });
});

describe('removing a file', () => {
  it('takes out the one asked for and leaves the rest', async () => {
    rowHolds([...EXISTING, { id: 'd2', name: 'Wrong file.pdf', url: 'https://files.test/w.pdf', addedAt: '' }]);

    const res = await del('d2');

    expect(res.status).toBe(200);
    expect(written().map((d: { id: string }) => d.id)).toEqual(['d1']);
  });

  it('needs an id', async () => {
    expect((await del()).status).toBe(400);
    expect(tx.project.update).not.toHaveBeenCalled();
  });

  /**
   * Filtering nothing out and answering "success" is how a stale tab reports
   * a file removed that somebody else removed minutes ago — and how it would
   * report one removed that is still sitting there.
   */
  it('does not claim success for a file that is not on the project', async () => {
    const res = await del('never-existed');

    expect(res.status).toBe(404);
  });

  it('answers 404 for a project that is gone', async () => {
    tx.$queryRaw.mockResolvedValue([]);

    expect((await del('d1')).status).toBe(404);
  });

  it('locks the row for the delete too', async () => {
    await del('d1');

    const sql = tx.$queryRaw.mock.calls[0][0].join('?');
    expect(sql).toMatch(/FOR UPDATE/);
  });
});
