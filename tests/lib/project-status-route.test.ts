import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * `PATCH /api/admin/projects/[projectId]/status` — moving a project's stage.
 * It had no tests, and it is the most consequential route in Delivery: it is
 * the one that emails the client, writes the timeline they read, and works
 * out whether the move just made a payment due.
 *
 * Everything in it was written for a stage going up. A stage can go down —
 * a mis-click, a stage advanced by the wrong person — and the route did the
 * full ceremony in reverse: it wrote the EARLIER stage's forward-looking copy
 * onto the client's timeline and emailed it to them. A client whose site was
 * in Build received "Design has started — Discovery's done and we're
 * designing... You'll see a concept before a single line of code is written."
 *
 * That is not noise. It reads as the project having gone backwards, which is
 * the one thing a client is most likely to ring about, and it is us saying it
 * in our own words, apparently on purpose.
 */

const prisma = {
  project: { findUnique: vi.fn(), update: vi.fn() },
  projectUpdate: { create: vi.fn() },
  instalment: { findMany: vi.fn() },
  emailPreferences: { findUnique: vi.fn() },
};

const requireStaff = vi.fn();
const requireRole = vi.fn();
const sendStatusUpdateEmail = vi.fn();

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
vi.mock('@/lib/email', () => ({
  sendStatusUpdateEmail: (...args: unknown[]) => sendStatusUpdateEmail(...args),
}));
vi.mock('@/lib/email-preferences', () => ({ clientWantsEmail: () => true }));

const { PATCH } = await import('@/app/api/admin/projects/[projectId]/status/route');

function request(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}
const params = Promise.resolve({ projectId: 'proj_1' });
const call = (body: unknown) => PATCH(request(body), { params });

/** Sitting at Build — so 'design' and 'discovery' are backwards from here. */
function projectAt(status: string, statusStage: number) {
  return {
    id: 'proj_1',
    clientId: 'client_1',
    name: 'Havisham Joinery — Custom Website',
    status,
    statusStage,
    client: { id: 'client_1', email: 'ruth@havisham.co.uk', company: 'Havisham Joinery' },
  };
}

const SCHEDULE = [
  { id: 'i1', index: 1, label: 'Payment 1 of 3', amountCents: 240000, trigger: 'signing', status: 'paid' },
  { id: 'i2', index: 2, label: 'Payment 2 of 3', amountCents: 180000, trigger: 'design-approval', status: 'scheduled' },
  { id: 'i3', index: 3, label: 'Payment 3 of 3', amountCents: 180000, trigger: 'ready-for-launch', status: 'scheduled' },
];

const written = () => prisma.project.update.mock.calls[0]?.[0]?.data ?? {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  requireStaff.mockResolvedValue({ userId: 'u1', email: 'kiana@bothmade.studio', role: 'owner' });
  requireRole.mockReturnValue(null);
  prisma.project.findUnique.mockResolvedValue(projectAt('build', 2));
  prisma.project.update.mockResolvedValue({ ...projectAt('build', 2) });
  prisma.projectUpdate.create.mockResolvedValue({ id: 'u1', title: 'T', description: 'D' });
  prisma.instalment.findMany.mockResolvedValue(SCHEDULE);
  prisma.emailPreferences.findUnique.mockResolvedValue(null);
  sendStatusUpdateEmail.mockResolvedValue({ sent: true });
});

describe('who may use it, and what it will accept', () => {
  it('refuses nobody at all', async () => {
    requireStaff.mockResolvedValue(null);

    const res = await call({ status: 'launch' });

    expect(res.status).toBe(401);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('refuses a stage that is not one of the five', async () => {
    const res = await call({ status: 'nearly-done' });

    expect(res.status).toBe(400);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('answers 404 for a project that is gone', async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    const res = await call({ status: 'launch' });

    expect(res.status).toBe(404);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });
});

describe('moving a project forward', () => {
  it('writes the stage and its index together', async () => {
    await call({ status: 'launch' });

    expect(written()).toMatchObject({ status: 'launch', statusStage: 3 });
  });

  it('tells the client, in the words written for that stage', async () => {
    await call({ status: 'launch' });

    expect(prisma.projectUpdate.create).toHaveBeenCalled();
    expect(sendStatusUpdateEmail).toHaveBeenCalled();
  });

  it('prefers whatever the sender actually wrote', async () => {
    await call({ status: 'launch', description: 'Your logo files came in late so we started Tuesday.' });

    const data = prisma.projectUpdate.create.mock.calls[0][0].data;
    expect(data.description).toBe('Your logo files came in late so we started Tuesday.');
  });

  it('reports the payment gate the move opened, without invoicing it', async () => {
    const res = await call({ status: 'launch' });
    const body = await res.json();

    expect(body.gateOpened).toMatchObject({ label: 'Payment 3 of 3', claim: 'Ready for Launch' });
  });
});

describe('moving a project backwards', () => {
  /**
   * The bug. Build → Design used to email the client "Design has started".
   */
  it('does not email the client a correction', async () => {
    const res = await call({ status: 'design' });

    expect(res.status).toBe(200);
    expect(sendStatusUpdateEmail).not.toHaveBeenCalled();
  });

  it('does not put a correction on the timeline the client reads', async () => {
    await call({ status: 'design' });

    expect(prisma.projectUpdate.create).not.toHaveBeenCalled();
  });

  it('still moves the stage, which is the whole point of pressing it', async () => {
    await call({ status: 'design' });

    expect(written()).toMatchObject({ status: 'design', statusStage: 1 });
  });

  it('says it told nobody, rather than looking like an ordinary send', async () => {
    const body = await (await call({ status: 'design' })).json();

    expect(body.correctedSilently).toBe(true);
    expect(body.update).toBeNull();
  });

  it('never reports a payment gate on the way back', async () => {
    const body = await (await call({ status: 'design' })).json();

    expect(body.gateOpened).toBeNull();
  });

  /**
   * A backwards move somebody wrote a message for is a different act: they
   * have deliberately decided to tell the client something.
   */
  it('does send when somebody has written to them on purpose', async () => {
    await call({
      status: 'design',
      description: 'We are reopening the design — the new brand guidelines change the homepage.',
    });

    expect(prisma.projectUpdate.create).toHaveBeenCalled();
    expect(sendStatusUpdateEmail).toHaveBeenCalled();
  });

  it('treats a message of nothing but spaces as no message', async () => {
    await call({ status: 'design', description: '   \n  ' });

    expect(sendStatusUpdateEmail).not.toHaveBeenCalled();
  });
});

describe('re-sending at the stage a project is already at', () => {
  /** Not a correction — the ordinary "post an update" path. */
  it('still writes and sends', async () => {
    await call({ status: 'build', description: 'Halfway through the booking flow.' });

    expect(prisma.projectUpdate.create).toHaveBeenCalled();
    expect(sendStatusUpdateEmail).toHaveBeenCalled();
  });

  it('opens no gate, because nothing moved', async () => {
    const body = await (await call({ status: 'build' })).json();

    expect(body.gateOpened).toBeNull();
  });
});

describe('when the email will not go', () => {
  it('still records the move rather than failing the whole request', async () => {
    sendStatusUpdateEmail.mockRejectedValue(new Error('Resend is down'));

    const res = await call({ status: 'launch' });

    expect(res.status).toBe(200);
    expect(prisma.projectUpdate.create).toHaveBeenCalled();
  });
});
