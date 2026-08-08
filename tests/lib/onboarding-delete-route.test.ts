import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deleting an onboarding question — the untested route behind a bin icon
 * that destroys a client's typed answer.
 *
 * OnboardingResponse cascades from OnboardingQuestion, so this endpoint is
 * the only one in the onboarding flow that can lose something a client
 * wrote. It had no tests. What that hid:
 *
 *   - it looked the question up by id alone, ignoring the projectId sitting
 *     in its own URL, so a stale tab or a pasted id could take a question off
 *     a different project's form and answer 200 as though it had done what
 *     was asked;
 *
 *   - `delete` throws P2025 when nothing matches, which fell through to the
 *     catch and came back a 500. A question already removed in another tab —
 *     or one bin icon double-clicked — produced a server error describing a
 *     form that was already in the state the caller wanted.
 *
 * Both are the shape the team chat route wrote down when it made the same
 * change: scope the write to what the caller is actually addressing, and
 * treat a row that has gone as nothing to do.
 */

const deleteMany = vi.fn(async (_args: unknown) => ({ count: 1 }));
const prisma = { onboardingQuestion: { deleteMany: (a: unknown) => deleteMany(a) } };

let role = 'owner';
let denyRole = false;

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ type: 'user', userId: 'user_kiana', email: 'k@bothmade.studio', role }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));
vi.mock('@/lib/authz', () => ({
  ANY_STAFF: ['owner', 'ops', 'sales'],
  requireRole: () => (denyRole ? new Response('{}', { status: 403 }) : null),
}));

const { DELETE } = await import('@/app/api/admin/projects/[projectId]/onboarding/[questionId]/route');

const remove = async (projectId: string, questionId: string) => {
  const res = await DELETE(
    new Request('https://bothmade.studio/x', { method: 'DELETE' }) as never,
    { params: Promise.resolve({ projectId, questionId }) } as never
  );
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  vi.clearAllMocks();
  deleteMany.mockResolvedValue({ count: 1 });
  role = 'owner';
  denyRole = false;
});

describe('removing a question', () => {
  it('deletes it and says so', async () => {
    const { status, body } = await remove('proj_1', 'q_1');

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  /*
   * The scoping bug in one assertion. `{ id }` on its own was enough to
   * delete a question belonging to a project the URL never mentioned.
   */
  it('will only delete a question that is on the project in the URL', async () => {
    await remove('proj_1', 'q_1');

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'q_1', projectId: 'proj_1' } });
  });

  it('does not report success when nothing matched', async () => {
    deleteMany.mockResolvedValue({ count: 0 });

    const { status, body } = await remove('proj_other', 'q_1');

    expect(status).toBe(404);
    expect(body.success).toBeUndefined();
  });

  /*
   * The crash. `delete` raises P2025 for a row that is not there, and this
   * route's catch turned that into "Internal server error" — a 500 for a
   * form that was already how the caller wanted it.
   */
  it('treats an already-deleted question as stale, not as a server error', async () => {
    deleteMany.mockResolvedValue({ count: 0 });

    const { status, body } = await remove('proj_1', 'q_gone');

    expect(status).toBe(404);
    expect(status, 'a question that has already gone is not a crash').not.toBe(500);
    expect(body.error).toMatch(/no longer on this form/i);
  });

  it('still answers 500 when the database actually fails', async () => {
    deleteMany.mockRejectedValue(new Error('connection reset'));

    const { status } = await remove('proj_1', 'q_1');

    expect(status).toBe(500);
  });
});

describe('who may delete one', () => {
  it('refuses a request with no session', async () => {
    const middleware = await import('@/lib/middleware');
    vi.spyOn(middleware, 'requireStaff').mockResolvedValueOnce(null as never);

    const { status } = await remove('proj_1', 'q_1');

    expect(status).toBe(401);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('refuses a role the project pages are withheld from', async () => {
    denyRole = true;

    const { status } = await remove('proj_1', 'q_1');

    expect(status).toBe(403);
    expect(deleteMany, 'a refused role must not reach the delete').not.toHaveBeenCalled();
  });
});
