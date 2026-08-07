import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The one job in this app that emails a stranger with nobody pressing send.
 *
 * The due date was stamped three days ago and a lot happens in three days: a
 * lead writes back, asks to be left alone, closes, bounces, or has a mockup
 * put in for them. Every one of those leaves a due date sitting there that was
 * correct when it was set and is wrong now. Trusting whoever changed the lead
 * to have also cleared the date is how an automated email reaches somebody who
 * told us to stop — so the refusals are asserted here, against the query the
 * job actually runs.
 */

const prisma = {
  user: { findFirst: vi.fn() },
  lead: { findMany: vi.fn(async () => []), update: vi.fn(async () => ({})) },
  leadActivity: { count: vi.fn(async () => 0), create: vi.fn(async () => ({})) },
  $transaction: vi.fn(async () => []),
};

const sendAsUser = vi.fn(async () => ({ ok: true, sentVia: 'oauth' as const }));

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/mailer', () => ({ sendAsUser }));
vi.mock('@/lib/crypto', () => ({ decryptSecret: (s: string) => s }));
vi.mock('@/lib/site-url', () => ({ resolveSiteUrl: () => 'https://bothmade.studio' }));
vi.mock('@/lib/cron-auth', () => ({ requireCronAuth: () => null }));

const { GET } = await import('@/app/api/cron/auto-follow-up/route');

const request = () => new Request('https://bothmade.studio/api/cron/auto-follow-up');
const run = async () => {
  const res = await GET(request() as never);
  return { status: res.status, body: await res.json() };
};

const SENDER = {
  id: 'user_k',
  name: 'Kiana',
  email: 'kiana@bothmadestudio.com',
  avatarUrl: null,
  gmailAddress: 'kiana@bothmadestudio.com',
  gmailAppPassword: null,
  googleRefreshToken: 'tok',
};

let n = 0;
const lead = (over: Record<string, unknown> = {}) => ({
  id: `lead_${++n}`,
  company: `Business ${n}`,
  contactName: 'Dana',
  email: `d${n}@example.com`,
  shareToken: `tok_${n}`,
  status: 'contacted',
  ...over,
});

beforeEach(() => {
  n = 0;
  vi.clearAllMocks();
  delete process.env.AUTO_FOLLOW_UP_FROM;
  prisma.user.findFirst.mockResolvedValue(SENDER);
  prisma.lead.findMany.mockResolvedValue([]);
  prisma.leadActivity.count.mockResolvedValue(0);
  prisma.$transaction.mockResolvedValue([]);
  sendAsUser.mockResolvedValue({ ok: true, sentVia: 'oauth' });
});

describe('who it will not email', () => {
  const whereOf = () => prisma.lead.findMany.mock.calls[0][0].where;

  it('asks only for leads that are due and have not been sent to', async () => {
    await run();

    expect(whereOf().autoFollowUpSentAt).toBeNull();
    expect(whereOf().autoFollowUpDueAt).toHaveProperty('lte');
  });

  /**
   * Each of these is a lead whose due date is still sitting there and whose
   * circumstances have changed underneath it. An automated nudge arriving
   * mid-conversation is worse than none at all; one arriving after a request
   * to stop is a complaint.
   */
  it('refuses a reply, a stop request, a closed deal, a bounce and a pending mockup', async () => {
    await run();
    const where = whereOf();

    expect(where.replyReceivedAt).toBeNull();
    expect(where.doNotContact).toBe(false);
    expect(where.status).toEqual({ notIn: ['won', 'lost'] });
    expect(where.emailDeliveryFailedAt).toBeNull();
    expect(where.mockupRequested).toBe(false);
  });

  it('will not try to email a lead with no address', async () => {
    await run();
    expect(whereOf().email).toEqual({ not: null });
  });
});

describe('the mailbox it sends from', () => {
  /**
   * Silently sending from whoever happens to have Gmail connected is how a
   * warming domain's work lands on a restricted account instead. A missing
   * sender stops the run and says what to do about it.
   */
  it('refuses to run at all rather than borrowing another mailbox', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.lead.findMany.mockResolvedValue([lead()]);

    const { status, body } = await run();

    expect(status).toBe(503);
    expect(body.error).toContain('kiana@bothmadestudio.com');
    expect(sendAsUser).not.toHaveBeenCalled();
  });

  it('looks the sender up by the configured address', async () => {
    process.env.AUTO_FOLLOW_UP_FROM = 'info@bothmade.studio';

    await run();

    expect(prisma.user.findFirst.mock.calls[0][0].where.OR).toEqual([
      { gmailAddress: 'info@bothmade.studio' },
      { email: 'info@bothmade.studio' },
    ]);
  });
});

describe('sending', () => {
  it('sends one email per due lead and stamps it', async () => {
    prisma.lead.findMany.mockResolvedValue([lead({ company: 'Ridgeline' }), lead()]);

    const { body } = await run();

    expect(body.sent).toBe(2);
    expect(sendAsUser).toHaveBeenCalledTimes(2);
    expect(sendAsUser.mock.calls[0][1].subject).toContain('Ridgeline');
    expect(sendAsUser.mock.calls[0][1].to).toBe('d1@example.com');
  });

  /**
   * Stamped sent even when it failed, and the failure recorded beside it.
   *
   * Leaving it due retries a dead address every night forever, and repeated
   * sends to an address that refuses them is exactly the pattern that got the
   * account restricted. The lead surfaces as "couldn't reach — ring instead",
   * which is its honest next step anyway.
   */
  it('does not retry an address that refused it', async () => {
    prisma.lead.findMany.mockResolvedValue([lead()]);
    sendAsUser.mockResolvedValue({ ok: false, sentVia: 'failed' });

    const { body } = await run();

    expect(body.failed).toBe(1);
    const data = prisma.lead.update.mock.calls[0][0].data;
    expect(data.autoFollowUpSentAt).toBeInstanceOf(Date);
    expect(data.emailDeliveryFailedAt).toBeInstanceOf(Date);
  });

  /**
   * The daily ceiling exists because an account that goes over it gets
   * restricted, and "it was the cron, not me" is not a distinction Google
   * draws. A trimmed run says by how much rather than reporting a full one.
   */
  it('stops at the daily limit and reports what was held back', async () => {
    process.env.DAILY_EMAIL_LIMIT = '2';
    prisma.lead.findMany.mockResolvedValue([lead(), lead(), lead(), lead()]);

    const { body } = await run();

    expect(body.sent).toBe(2);
    expect(body.heldBack).toBe(2);
    delete process.env.DAILY_EMAIL_LIMIT;
  });

  it('does nothing, quietly, when nobody is due', async () => {
    const { body } = await run();

    expect(body.sent).toBe(0);
    expect(sendAsUser).not.toHaveBeenCalled();
    // Not even a sender lookup failure should be reported as a problem on a
    // day with no work — this runs every weekday and mostly has none.
    expect(body.success).toBe(true);
  });
});
