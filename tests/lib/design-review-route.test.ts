import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * `/api/admin/projects/[projectId]/design-review` — the Section 4 clock, and
 * the approval that stops it. Neither had a test.
 *
 * This is the route the contract leans on hardest. POST starts the five
 * business days a client has to respond, and writes the deadline into the
 * email and onto their timeline — because deemed approval is only defensible
 * if the client knew the terms before their silence began counting against
 * them. PATCH records that they said yes, which under Section 7 is the moment
 * Payment 2 becomes due.
 *
 * That last part was the gap. The STAGE route has reported its payment gate
 * since it was written, from an inference — somebody moved a dropdown to
 * Build. This route records the approval itself and reported nothing, so the
 * studio was prompted for the guess and told nothing about the fact.
 */

const prisma = {
  project: { findUnique: vi.fn(), update: vi.fn() },
  projectUpdate: { create: vi.fn() },
  instalment: { findMany: vi.fn() },
};

const requireStaff = vi.fn();
const requireRole = vi.fn();
const sendDesignPresentedEmail = vi.fn();

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
  sendDesignPresentedEmail: (...args: unknown[]) => sendDesignPresentedEmail(...args),
}));
vi.mock('@/lib/site-url', () => ({ resolveSiteUrl: () => 'https://bothmade.studio' }));

const { POST, PATCH } = await import('@/app/api/admin/projects/[projectId]/design-review/route');

function request(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}
const params = Promise.resolve({ projectId: 'proj_1' });
const post = (body: unknown = {}) => POST(request(body), { params });
const patch = () => PATCH(request({}), { params });

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj_1',
    name: 'Havisham Joinery — Custom Website',
    status: 'design',
    designPresentedAt: null,
    designApprovedAt: null,
    designRound: 1,
    designUrl: null,
    client: { email: 'ruth@havisham.co.uk', contactName: 'Ruth', company: 'Havisham Joinery' },
    ...overrides,
  };
}

/** Payment 2 sitting unsent — the row Design Approval makes due. */
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
  prisma.project.findUnique.mockResolvedValue(projectRow());
  prisma.project.update.mockResolvedValue({});
  prisma.projectUpdate.create.mockResolvedValue({});
  prisma.instalment.findMany.mockResolvedValue(SCHEDULE);
  sendDesignPresentedEmail.mockResolvedValue({ sent: true });
});

describe('who may start a review', () => {
  it('refuses nobody at all', async () => {
    requireStaff.mockResolvedValue(null);

    expect((await post()).status).toBe(401);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('answers 404 for a project that is gone', async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    expect((await post()).status).toBe(404);
  });
});

describe('starting the Section 4 clock', () => {
  it('records when it started and when it runs out', async () => {
    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(written().designPresentedAt).toBeInstanceOf(Date);
    expect(written().designReviewEndsAt).toBeInstanceOf(Date);
    expect(new Date(body.reviewEndsAt).getTime()).toBeGreaterThan(
      new Date(body.presentedAt).getTime()
    );
  });

  /**
   * Deemed approval is only fair if the client was told the terms first, so
   * the deadline has to be in the email AND on the timeline they can go back
   * and read.
   */
  it('puts the deadline in the email and on their timeline', async () => {
    const body = await (await post()).json();

    expect(sendDesignPresentedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ reviewEndsLabel: body.reviewEndsLabel })
    );
    const entry = prisma.projectUpdate.create.mock.calls[0][0].data;
    expect(entry.description).toContain(body.reviewEndsLabel);
    expect(entry.description).toMatch(/take it as approved/i);
  });

  it('can be told not to email, and still starts the clock', async () => {
    const res = await post({ notifyClient: false });

    expect(res.status).toBe(200);
    expect(sendDesignPresentedEmail).not.toHaveBeenCalled();
    expect(written().designPresentedAt).toBeInstanceOf(Date);
  });

  it('starts the clock even when the email will not go', async () => {
    sendDesignPresentedEmail.mockRejectedValue(new Error('Resend is down'));

    const body = await (await post()).json();

    expect(body.emailSent).toBe(false);
    expect(written().designPresentedAt).toBeInstanceOf(Date);
  });

  /** The round belongs to the version they were looking at. */
  it('does not advance the round on a first presentation', async () => {
    await post();

    expect(written().designRound).toBeUndefined();
  });

  it('advances the round on a second one', async () => {
    prisma.project.findUnique.mockResolvedValue(
      projectRow({ designPresentedAt: new Date('2026-08-01'), designRound: 1 })
    );

    await post();

    expect(written().designRound).toEqual({ increment: 1 });
  });

  it('refuses once the design is already approved', async () => {
    prisma.project.findUnique.mockResolvedValue(
      projectRow({ designApprovedAt: new Date('2026-08-01') })
    );

    const res = await post();

    expect(res.status).toBe(409);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });
});

describe('recording that the client approved', () => {
  it('stamps the approval and marks it as theirs, not deemed', async () => {
    const res = await patch();

    expect(res.status).toBe(200);
    expect(written().designApprovedAt).toBeInstanceOf(Date);
    // "They said yes" and "they said nothing for a week" are different facts.
    expect(written().designApprovalDeemed).toBe(false);
  });

  /**
   * The gap. Section 7 puts Payment 2 on this exact event, and it reported
   * nothing while the stage dropdown — a guess at the same thing — prompted.
   */
  it('reports the payment it just made due', async () => {
    const body = await (await patch()).json();

    expect(body.gateOpened).toMatchObject({
      label: 'Payment 2 of 3',
      amountCents: 180000,
      claim: 'Design Approval',
      clause: 'Section 7',
    });
  });

  it('says what happened in words that are true of an approval', async () => {
    const body = await (await patch()).json();

    // Not "you moved them to Build" — nobody moved anything.
    expect(body.gateOpened.lead).toMatch(/approved the design/i);
    expect(body.gateOpened.lead).not.toMatch(/you moved/i);
  });

  it('never invoices anything on its own', async () => {
    await patch();

    // Every path here ends at a button somebody presses.
    expect(prisma.instalment.findMany).toHaveBeenCalled();
    expect(prisma.project.update).toHaveBeenCalledTimes(1);
  });

  it('prompts for nothing when Payment 2 has already gone out', async () => {
    prisma.instalment.findMany.mockResolvedValue(
      SCHEDULE.map((i) => (i.index === 2 ? { ...i, status: 'due' } : i))
    );

    const body = await (await patch()).json();

    // Prompting again would raise a second invoice for the same payment.
    expect(body.gateOpened).toBeNull();
  });

  it('prompts for nothing on a project with no schedule', async () => {
    prisma.instalment.findMany.mockResolvedValue([]);

    const body = await (await patch()).json();

    expect(body.gateOpened).toBeNull();
  });

  it('still records the approval if the schedule cannot be read', async () => {
    prisma.instalment.findMany.mockRejectedValue(new Error('db blip'));

    const res = await patch();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.gateOpened).toBeNull();
    expect(written().designApprovedAt).toBeInstanceOf(Date);
  });

  it('is idempotent — a second press changes nothing', async () => {
    prisma.project.findUnique.mockResolvedValue(
      projectRow({ designApprovedAt: new Date('2026-08-01') })
    );

    const body = await (await patch()).json();

    expect(body.alreadyApproved).toBe(true);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });
});
