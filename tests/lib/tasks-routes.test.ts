import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The studio's to-do list, whose two routes had no tests and did not agree
 * with each other about what a task is.
 *
 * Creating one refused an empty title. Editing one accepted anything, so a
 * PATCH could blank a title POST would never have written — a checkbox on the
 * list with nothing beside it, no way to tell which task it was, and no way
 * to get the words back.
 *
 * Both routes then took whatever `dueAt` arrived and handed it to `new Date`.
 * A string that is not a date becomes an Invalid Date, Prisma refuses it, and
 * the catch reported "Internal server error" — the one answer that does not
 * say which field to fix. Same for `assignedToId`: it came off the request
 * body and went into the write, so an id belonging to nobody hit the foreign
 * key and produced a third 500.
 *
 * None of that is exotic. It is what an untested pair of routes looks like
 * when the only client is a widget that happens to send well-formed input.
 */

const prisma = {
  task: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  user: { findUnique: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ type: 'user', userId: 'user_kiana', email: 'k@bothmade.studio', role: 'owner' }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));

const list = await import('@/app/api/admin/tasks/route');
const one = await import('@/app/api/admin/tasks/[taskId]/route');
const { TASK_TITLE_MAX } = await import('@/lib/tasks');

const post = async (body: unknown) => {
  const res = await list.POST(
    new Request('https://bothmade.studio/api/admin/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  );
  return { status: res.status, body: await res.json() };
};

const patch = async (body: unknown, taskId = 'task_1') => {
  const res = await one.PATCH(
    new Request('https://bothmade.studio/x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ taskId }) } as never
  );
  return { status: res.status, body: await res.json() };
};

const written = () => (prisma.task.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
const patched = () => (prisma.task.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;

beforeEach(() => {
  vi.clearAllMocks();
  prisma.task.create.mockImplementation(async (a: { data: unknown }) => ({ id: 'task_new', ...(a.data as object) }));
  prisma.task.findUnique.mockResolvedValue({ id: 'task_1', assignedToId: 'user_kiana', title: 'Ring Havisham' });
  prisma.task.update.mockImplementation(async (a: { data: unknown }) => ({ id: 'task_1', ...(a.data as object) }));
  prisma.user.findUnique.mockResolvedValue({ id: 'user_evan' });
});

describe('writing a task down', () => {
  it('keeps it, trimmed, against whoever wrote it', async () => {
    const { status } = await post({ title: '  Ring Havisham about the deposit  ' });

    expect(status).toBe(201);
    expect(written()).toMatchObject({
      title: 'Ring Havisham about the deposit',
      assignedToId: 'user_kiana',
      createdById: 'user_kiana',
      dueAt: null,
    });
  });

  it('refuses a title that is nothing but spaces', async () => {
    const { status, body } = await post({ title: '   ' });

    expect(status).toBe(400);
    expect(body.error).toMatch(/title/i);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('cuts a pasted paragraph down to a line', async () => {
    await post({ title: 'x'.repeat(TASK_TITLE_MAX + 500) });

    expect((written().title as string).length).toBe(TASK_TITLE_MAX);
  });

  it('takes a real due date', async () => {
    await post({ title: 'Send the proposal', dueAt: '2026-09-01' });

    expect(written().dueAt).toBeInstanceOf(Date);
    expect((written().dueAt as Date).toISOString()).toContain('2026-09-01');
  });

  /*
   * The 500. `new Date('next tuesday')` is an Invalid Date, Prisma refuses
   * it, and an error page for one mistyped field is not an answer.
   */
  it('says a date that is not a date is a bad field, not a broken server', async () => {
    const { status, body } = await post({ title: 'Send the proposal', dueAt: 'next tuesday' });

    expect(status).toBe(400);
    expect(status, 'a typo in one field is not a server error').not.toBe(500);
    expect(body.error).toMatch(/due date/i);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('treats an emptied date field as no date', async () => {
    await post({ title: 'Chase the mockup', dueAt: '' });

    expect(written().dueAt).toBeNull();
  });

  it('checks an assignee exists before writing against them', async () => {
    await post({ title: 'Draft the change order', assignedToId: 'user_evan' });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_evan' },
      select: { id: true },
    });
    expect(written()).toMatchObject({ assignedToId: 'user_evan', createdById: 'user_kiana' });
  });

  it('refuses an assignee who is nobody, rather than letting the key fail', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const { status, body } = await post({ title: 'Draft the change order', assignedToId: 'user_ghost' });

    expect(status).toBe(400);
    expect(body.error).toMatch(/assignee/i);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('does not go looking for a user when the task is your own', async () => {
    await post({ title: 'Mine', assignedToId: 'user_kiana' });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('changing a task', () => {
  it('ticks one off without being asked about anything else', async () => {
    const { status } = await patch({ done: true });

    expect(status).toBe(200);
    expect(patched()).toEqual({ title: undefined, done: true, dueAt: undefined });
  });

  /*
   * The disagreement between the two routes, stated: what POST refuses,
   * PATCH must refuse too. A row whose title has been blanked cannot be
   * identified, edited back, or told apart from the one below it.
   */
  it('refuses to blank a title that could never have been written blank', async () => {
    const { status, body } = await patch({ title: '' });

    expect(status).toBe(400);
    expect(body.error).toMatch(/title/i);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('refuses a due date that is not a date', async () => {
    const { status } = await patch({ dueAt: 'whenever' });

    expect(status).toBe(400);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('clears a due date when one is explicitly removed', async () => {
    await patch({ dueAt: null });

    expect(patched().dueAt).toBeNull();
  });

  it("will not touch somebody else's task", async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 'task_1', assignedToId: 'user_evan' });

    const { status } = await patch({ done: true });

    expect(status).toBe(404);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("will not delete somebody else's task either", async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 'task_1', assignedToId: 'user_evan' });

    const res = await one.DELETE(new Request('https://bothmade.studio/x', { method: 'DELETE' }) as never, {
      params: Promise.resolve({ taskId: 'task_1' }),
    } as never);

    expect(res.status).toBe(404);
    expect(prisma.task.delete).not.toHaveBeenCalled();
  });
});
