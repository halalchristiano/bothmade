import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The one thing in this system nobody has to remember to record.
 *
 * Every other entry in a lead's history is somebody's account of what
 * happened. Somebody rings twelve businesses, comes back, and tells the
 * system about three — usually not out of dishonesty but because logging is
 * admin done between calls and the afternoon runs out. Either way the number
 * on the dashboard was a self-report, and a self-report is not a measurement.
 *
 * This is a measurement. It fires as the `tel:` link is tapped, before the
 * phone app takes the screen.
 *
 * WHAT IT HONESTLY IS NOT: proof a call connected, that anybody answered, or
 * how long it lasted. The browser hands off to the operating system and never
 * hears another word. A number that rang out and a twenty-minute conversation
 * are identical here. Closing that gap needs the call routed through a
 * telephony provider; until then the value is that the two numbers — dialled
 * and written up — can be compared at all.
 */

const prisma = {
  leadActivity: { findFirst: vi.fn(async (_a: unknown) => null as unknown), create: vi.fn(async (_a: unknown) => ({})) },
  lead: {
    findUnique: vi.fn(
      async (_a: unknown) =>
        ({ id: 'lead_1', phone: '(212) 555-0100' }) as { id: string; phone: string | null } | null
    ),
  },
};

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ userId: 'user_evan' }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));

const { POST } = await import('@/app/api/admin/leads/[leadId]/dial/route');

const dial = async () => {
  const res = await POST(new Request('https://x/api', { method: 'POST' }) as never, {
    params: Promise.resolve({ leadId: 'lead_1' }),
  });
  return { status: res.status, body: await res.json() };
};

const written = () =>
  (prisma.leadActivity.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;

beforeEach(() => {
  vi.clearAllMocks();
  prisma.leadActivity.findFirst.mockResolvedValue(null);
  prisma.lead.findUnique.mockResolvedValue({ id: 'lead_1', phone: '(212) 555-0100' });
});

describe('recording a dial', () => {
  it('writes it against the lead, attributed to whoever tapped it', async () => {
    const { status, body } = await dial();

    expect(status).toBe(201);
    expect(body.recorded).toBe(true);
    expect(written()).toMatchObject({ leadId: 'lead_1', type: 'dial', createdById: 'user_evan' });
  });

  /**
   * The number as it stood when it was rung. If somebody corrects a wrong
   * number next week, the record still says which one was actually dialled —
   * the only version worth keeping.
   */
  it('keeps the number that was actually dialled', async () => {
    await dial();

    expect(written().content).toContain('(212) 555-0100');
  });

  it('still records the attempt when the number has since been cleared', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead_1', phone: null });

    const { body } = await dial();

    expect(body.recorded).toBe(true);
    expect(written().content).toMatch(/no longer on file/i);
  });
});

describe('the same number tapped twice', () => {
  /**
   * A `tel:` link gets double-tapped constantly — the call fails to start,
   * the browser comes back, the thumb lands again. That is one attempt to
   * reach a business, and counting it as two would inflate precisely the
   * number that exists to be trustworthy.
   */
  it('counts one attempt, not two', async () => {
    prisma.leadActivity.findFirst.mockResolvedValue({ id: 'act_1' });

    const { body } = await dial();

    expect(body.recorded).toBe(false);
    expect(prisma.leadActivity.create).not.toHaveBeenCalled();
  });

  it('looks only at this person, this lead, and the last couple of minutes', async () => {
    await dial();

    const where = (prisma.leadActivity.findFirst.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    }).where;

    expect(where).toMatchObject({ leadId: 'lead_1', type: 'dial', createdById: 'user_evan' });
    const since = (where.createdAt as { gte: Date }).gte;
    expect(Date.now() - since.getTime()).toBeLessThanOrEqual(3 * 60 * 1000);
  });
});

describe('when it cannot record', () => {
  /**
   * This fires as the screen is being taken over by the phone app. There is
   * nobody left to show an error to, and a failed measurement must never look
   * like a failed call — so it answers 200 and says nothing rather than
   * throwing something the caller cannot act on.
   */
  it('never fails loudly at the person about to make a call', async () => {
    prisma.leadActivity.findFirst.mockRejectedValue(new Error('db down'));

    const { status, body } = await dial();

    expect(status).toBe(200);
    expect(body.success).toBe(false);
  });

  it('says so plainly when the lead is gone', async () => {
    prisma.lead.findUnique.mockResolvedValue(null);

    expect((await dial()).status).toBe(404);
  });
});
