import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A client turning off their own status link, and who finds out.
 *
 * Revoking is deliberately the client's to do: they are the ones who forward
 * that link — to a colleague, an investor, a contractor — so they are the ones
 * who discover it went somewhere it shouldn't. What was missing is that the
 * rotation does not only kill *their* copies. A new token kills every copy in
 * existence, including the ones the studio sent, pasted into a proposal, or
 * pinned in a thread months ago.
 *
 * With nobody told, the studio's first sign is a link of its own that has
 * quietly started 404ing with nothing to explain it — which reads as a bug in
 * our software rather than a deliberate act by the client, and gets debugged
 * as one.
 *
 * The staff path in the same route already leaves a timeline note for exactly
 * this reason ("the client says the link is dead" wanting an answer other than
 * guessing). This is that reasoning applied to the path where it is stronger.
 */

const prisma = {
  project: { updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  lead: { update: vi.fn() },
  leadActivity: { create: vi.fn() },
};
const requireStaff = vi.fn();
const requireClient = vi.fn();
const notifyAdminsShareLinkRevoked = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  requireClient: () => requireClient(),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));
vi.mock('@/lib/notify', () => ({
  notifyAdminsShareLinkRevoked: (...args: unknown[]) => notifyAdminsShareLinkRevoked(...args),
}));
vi.mock('@/lib/share-links', () => ({ buildSignUrl: () => 'https://example.test/sign' }));

const { POST } = await import('@/app/api/share-links/rotate/route');

const rotate = async (body: unknown) =>
  POST(
    new Request('http://localhost/api/share-links/rotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  );

beforeEach(() => {
  vi.clearAllMocks();
  requireStaff.mockResolvedValue(null);
  requireClient.mockResolvedValue({ session: { clientId: 'cl_1' }, response: null });
  prisma.project.updateMany.mockResolvedValue({ count: 1 });
  prisma.project.findUnique.mockResolvedValue({
    shareToken: 'freshtoken',
    name: 'Northwind — Website',
    client: { company: 'Northwind Trading Co.' },
  });
  notifyAdminsShareLinkRevoked.mockResolvedValue(undefined);
});

describe('a client revoking their own status link', () => {
  it('tells the studio, naming the project and the company', async () => {
    const res = await rotate({ type: 'project', id: 'proj_1' });

    expect(res.status).toBe(200);
    expect(notifyAdminsShareLinkRevoked).toHaveBeenCalledWith({
      projectId: 'proj_1',
      projectName: 'Northwind — Website',
      company: 'Northwind Trading Co.',
    });
  });

  it('hands back the fresh token so they can share the new link', async () => {
    const body = (await (await rotate({ type: 'project', id: 'proj_1' })).json()) as {
      success: boolean;
      shareToken: string;
    };

    expect(body).toEqual({ success: true, shareToken: 'freshtoken' });
  });

  /**
   * Ownership is proved by the scoped `updateMany`, not by anything the caller
   * sent — so a project that isn't theirs matches nothing, and must not
   * announce a revocation that did not happen.
   */
  it('says nothing when the project is not theirs', async () => {
    prisma.project.updateMany.mockResolvedValue({ count: 0 });

    const res = await rotate({ type: 'project', id: 'someone_elses' });

    expect(res.status).toBe(404);
    expect(notifyAdminsShareLinkRevoked).not.toHaveBeenCalled();
  });

  /**
   * The revocation is the thing the client actually asked for. A mail failure
   * must not undo it, nor report it as not having happened — they would press
   * the button again on a link that is already dead.
   */
  it('still revokes when the notification fails', async () => {
    notifyAdminsShareLinkRevoked.mockRejectedValue(new Error('smtp down'));

    const res = await rotate({ type: 'project', id: 'proj_1' });
    const body = (await res.json()) as { success: boolean; shareToken: string };

    expect(res.status).toBe(200);
    expect(body.shareToken).toBe('freshtoken');
    expect(prisma.project.updateMany).toHaveBeenCalled();
  });

  it('rotates the token that was actually stored, not one the caller sent', async () => {
    await rotate({ type: 'project', id: 'proj_1', shareToken: 'attacker-chosen' });

    const [args] = prisma.project.updateMany.mock.calls[0] as [
      { where: Record<string, unknown>; data: { shareToken: string } },
    ];
    expect(args.where).toEqual({ id: 'proj_1', clientId: 'cl_1' });
    expect(args.data.shareToken).not.toBe('attacker-chosen');
    expect(args.data.shareToken).toHaveLength(64);
  });
});

describe('a client reaching for anything else', () => {
  it('cannot rotate a lead link, and nothing is announced', async () => {
    const res = await rotate({ type: 'lead', id: 'lead_1' });

    expect(res.status).toBe(401);
    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(notifyAdminsShareLinkRevoked).not.toHaveBeenCalled();
  });
});

describe('staff rotating a link', () => {
  beforeEach(() => {
    requireStaff.mockResolvedValue({ userId: 'user_kiana', role: 'owner' });
    prisma.project.update.mockResolvedValue({ id: 'proj_1' });
    prisma.lead.update.mockResolvedValue({ id: 'lead_1', company: 'Northwind' });
    prisma.leadActivity.create.mockResolvedValue({});
  });

  /**
   * The client notice is for the rotation nobody at the studio asked for.
   * Mailing the studio about its own click would be noise, and the kind that
   * teaches people to filter the sender.
   */
  it('does not tell the studio about its own click', async () => {
    const res = await rotate({ type: 'project', id: 'proj_1' });

    expect(res.status).toBe(200);
    expect(notifyAdminsShareLinkRevoked).not.toHaveBeenCalled();
  });

  it('still leaves the lead timeline note it always did', async () => {
    await rotate({ type: 'lead', id: 'lead_1' });

    const [args] = prisma.leadActivity.create.mock.calls[0] as [
      { data: { content: string; createdById: string } },
    ];
    expect(args.data.content).toMatch(/no longer opens/);
    expect(args.data.createdById).toBe('user_kiana');
  });
});
