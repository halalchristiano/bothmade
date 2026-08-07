import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "A hard stop, not a preference."
 *
 * That is what the schema says about `doNotContact`: *every outreach path
 * checks it before sending or dialling*. Three did not.
 *
 * The worst of them was the call sheet. Somebody who unsubscribed on Tuesday
 * was back at the top of the call queue on Wednesday — and near the top
 * precisely because they had just engaged with an email, which is what the
 * strongest bands rank on. So "we stopped emailing them" quietly became "we
 * rang them instead", which is the one outcome the flag exists to prevent.
 */

const prisma = {
  // Every stub declares the argument it is called with, even where the body
  // ignores it. A `vi.fn(async () => 0)` types its own `mock.calls` as an
  // empty tuple, so reading `calls[0][0]` — which is the whole point of these
  // assertions — is a type error rather than a test failure. tsconfig includes
  // tests, so that error fails `next build` and takes the deploy with it.
  lead: {
    findMany: vi.fn(async (_a: unknown) => [] as unknown[]),
    count: vi.fn(async (_a: unknown) => 0),
    findUnique: vi.fn(async (_a: unknown) => null as unknown),
  },
  leadActivity: {
    count: vi.fn(async (_a: unknown) => 0),
    findMany: vi.fn(async (_a: unknown) => [] as unknown[]),
    groupBy: vi.fn(async (_a: unknown) => [] as unknown[]),
    create: vi.fn(async (_a: unknown) => ({})),
  },
  user: { findUnique: vi.fn(async () => ({ googleRefreshToken: 'x', gmailNeedsReconnect: false })) },
};

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ userId: 'user_1' }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));
vi.mock('@/lib/gmail-oauth', () => ({ isGoogleOAuthConfigured: () => true }));

const callList = await import('@/app/api/admin/leads/call-list/route');
const followUp = await import('@/app/api/admin/leads/[leadId]/follow-up/route');

beforeEach(() => {
  vi.clearAllMocks();
  prisma.lead.findMany.mockResolvedValue([]);
  prisma.lead.count.mockResolvedValue(0);
  prisma.leadActivity.count.mockResolvedValue(0);
  prisma.leadActivity.findMany.mockResolvedValue([]);
  prisma.leadActivity.groupBy.mockResolvedValue([]);
});

describe('the call sheet', () => {
  /**
   * The list is the dialling path, and the schema's promise covers dialling
   * in exactly the same breath as sending.
   */
  it('asks the database to leave them out rather than filtering later', async () => {
    await callList.GET(new Request('https://x/api/admin/leads/call-list') as never);

    const where = (prisma.lead.findMany.mock.calls[0]![0] as { where: Record<string, unknown> })
      .where;
    expect(where.doNotContact).toBe(false);
  });

  /**
   * The count beside the list has to exclude them too, or the page reports a
   * total it will not show and reads as though rows went missing.
   */
  it('does not count them in the total either', async () => {
    await callList.GET(new Request('https://x/api/admin/leads/call-list') as never);

    const where = (prisma.lead.count.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where.doNotContact).toBe(false);
  });
});

describe('the follow-up written straight after a call', () => {
  const send = async () => {
    const res = await followUp.POST(
      new Request('https://x/api', {
        method: 'POST',
        body: JSON.stringify({ subject: 'Following up', body: 'Good speaking earlier.' }),
        headers: { 'Content-Type': 'application/json' },
      }) as never,
      { params: Promise.resolve({ leadId: 'lead_1' }) }
    );
    return { status: res.status, body: await res.json() };
  };

  /**
   * The one send a person presses deliberately, seconds after a call — which
   * makes it more likely to reach somebody who has asked to be left alone,
   * not less. Every other path already refused.
   */
  it('refuses to send to somebody who asked to be left alone', async () => {
    prisma.lead.findUnique.mockResolvedValue({
      id: 'lead_1',
      company: 'Ridgeline Roofing',
      email: 'dana@ridgeline.com',
      doNotContact: true,
    });

    const { status, body } = await send();

    expect(status).toBe(400);
    expect(body.error).toMatch(/asked not to be contacted/i);
  });
});
