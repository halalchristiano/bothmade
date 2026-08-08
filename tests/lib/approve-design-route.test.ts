import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A client pressing approve on their own design.
 *
 * This route had no tests, and it is not a quiet one. The approval it writes
 * is what makes the second instalment fall due under Section 7 — so this is
 * a money-moving, contractually meaningful write, reachable by a client
 * session rather than a staff one, and deliberately one-way.
 *
 * Three rules hold it up, and each is a different kind of expensive to get
 * wrong:
 *
 *   1. A client may only approve their OWN project. This is the only
 *      cross-tenant boundary on the route, and past it lies starting somebody
 *      else's payment clock.
 *   2. Nothing can be approved before it has been presented. The route's own
 *      comment says "a crafted request must not be able to start the
 *      project's clock from the outside" — which is precisely a thing worth
 *      asserting rather than commenting.
 *   3. Approval is never withdrawn and never re-stamped. A design approved
 *      and then reconsidered is a Change Order, not an undo, and a second
 *      press must not move the date the first one set.
 */

const projectFindUnique = vi.fn();
const projectUpdate = vi.fn();
const projectUpdateCreate = vi.fn();
const notifyAdmins = vi.fn();
const sendApprovedEmail = vi.fn();
let principal: { session: unknown; response: unknown } = { session: null, response: null };

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: (...a: unknown[]) => projectFindUnique(...a),
      update: (...a: unknown[]) => projectUpdate(...a),
    },
    projectUpdate: { create: (...a: unknown[]) => projectUpdateCreate(...a) },
  },
}));
vi.mock('@/lib/middleware', () => ({
  requirePrincipal: async () => principal,
  forbiddenResponse: () => new Response(null, { status: 403 }),
}));
vi.mock('@/lib/notify', () => ({
  notifyAdminsDesignApprovedByClient: (...a: unknown[]) => notifyAdmins(...a),
}));
vi.mock('@/lib/email', () => ({ sendDesignApprovedEmail: (...a: unknown[]) => sendApprovedEmail(...a) }));
vi.mock('@/lib/email-preferences', () => ({ clientWantsEmail: () => true }));
vi.mock('@/lib/site-url', () => ({ resolveSiteUrl: () => 'https://bothmade.studio' }));

const { POST } = await import('@/app/api/projects/[projectId]/approve-design/route');

const PRESENTED = {
  id: 'proj_1',
  name: 'Linpotia Dental — Site & Booking',
  clientId: 'client_1',
  status: 'design',
  designPresentedAt: new Date('2026-08-01T00:00:00.000Z'),
  designApprovedAt: null as Date | null,
  designRound: 1,
  designUrl: 'https://figma.test/x',
  client: { company: 'Linpotia Dental', email: 'sam@linpotia.test', contactName: 'Sam', emailPreferences: {} },
};

const call = () =>
  POST({} as Parameters<typeof POST>[0], { params: Promise.resolve({ projectId: 'proj_1' }) });

beforeEach(() => {
  projectFindUnique.mockReset().mockResolvedValue(PRESENTED);
  projectUpdate.mockReset().mockResolvedValue({});
  projectUpdateCreate.mockReset().mockResolvedValue({});
  notifyAdmins.mockReset().mockResolvedValue(undefined);
  sendApprovedEmail.mockReset().mockResolvedValue(undefined);
  principal = { session: { type: 'client', clientId: 'client_1' }, response: null };
});

describe('the client whose project it is', () => {
  it('can approve, and the approval is recorded as explicit rather than deemed', async () => {
    const res = await call();

    expect(res.status).toBe(200);
    const { data } = projectUpdate.mock.calls[0][0];
    expect(data.designApprovedAt).toBeInstanceOf(Date);
    // Explicit approval is worth more than five days of silence if it is ever
    // argued about, so pressing the button must clear the deemed flag.
    expect(data.designApprovedDeemed ?? data.designApprovalDeemed).toBe(false);
  });

  it('is told what their approval just did, rather than learning it from the invoice', async () => {
    await call();

    expect(sendApprovedEmail).toHaveBeenCalledTimes(1);
    expect(sendApprovedEmail.mock.calls[0][0].to).toBe('sam@linpotia.test');
  });

  it('puts it on the timeline and tells the studio', async () => {
    await call();

    expect(projectUpdateCreate.mock.calls[0][0].data.title).toBe('Design approved');
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
  });
});

describe('somebody else’s project', () => {
  it('is refused', async () => {
    principal = { session: { type: 'client', clientId: 'someone_else' }, response: null };

    const res = await call();

    expect(res.status).toBe(403);
  });

  it('is not approved, notified or emailed on the way out', async () => {
    principal = { session: { type: 'client', clientId: 'someone_else' }, response: null };

    await call();

    // The refusal has to happen before any of the writes, not alongside them.
    expect(projectUpdate).not.toHaveBeenCalled();
    expect(notifyAdmins).not.toHaveBeenCalled();
    expect(sendApprovedEmail).not.toHaveBeenCalled();
  });

  it('lets staff through, since they are not scoped to one client', async () => {
    principal = { session: { type: 'user', userId: 'user_1' }, response: null };

    const res = await call();

    expect(res.status).toBe(200);
  });
});

describe('a design that has not been presented', () => {
  it('cannot be approved from the outside', async () => {
    // The route's comment: "a crafted request must not be able to start the
    // project's clock from the outside." Section 7 hangs off this date.
    projectFindUnique.mockResolvedValue({ ...PRESENTED, designPresentedAt: null });

    const res = await call();

    expect(res.status).toBe(409);
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it('404s a project that does not exist', async () => {
    projectFindUnique.mockResolvedValue(null);

    expect((await call()).status).toBe(404);
  });
});

describe('approving twice', () => {
  it('does not move the date the first approval set', async () => {
    const first = new Date('2026-08-02T09:00:00.000Z');
    projectFindUnique.mockResolvedValue({ ...PRESENTED, designApprovedAt: first });

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.alreadyApproved).toBe(true);
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it('does not email or notify a second time', async () => {
    projectFindUnique.mockResolvedValue({ ...PRESENTED, designApprovedAt: new Date() });

    await call();

    expect(sendApprovedEmail).not.toHaveBeenCalled();
    expect(notifyAdmins).not.toHaveBeenCalled();
  });
});

describe('when the trimmings fail', () => {
  it('still approves, because the approval is the thing that matters', async () => {
    // The timeline entry, the studio notification and the client's email are
    // all best-effort in the route. A dead mail provider must not turn a
    // recorded approval into a 500 the client is invited to press again.
    projectUpdateCreate.mockRejectedValue(new Error('db hiccup'));
    notifyAdmins.mockRejectedValue(new Error('Resend is down'));
    sendApprovedEmail.mockRejectedValue(new Error('Resend is down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await call();

    expect(res.status).toBe(200);
    expect(projectUpdate).toHaveBeenCalledTimes(1);
  });
});
