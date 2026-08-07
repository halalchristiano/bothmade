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

type Row = Record<string, unknown>;

const prisma = {
  user: { findFirst: vi.fn() },
  lead: {
    findMany: vi.fn(async (_a: unknown) => [] as Row[]),
    update: vi.fn(async (_a: unknown) => ({}) as Row),
  },
  leadActivity: {
    count: vi.fn(async (_a: unknown) => 0),
    create: vi.fn(async (_a: unknown) => ({}) as Row),
    // The quiet-days check: who a person emailed in the last two days.
    findMany: vi.fn(async (_a: unknown) => [] as { leadId: string }[]),
  },
  $transaction: vi.fn(async (_a: unknown) => [] as Row[]),
};

const sendAsUser = vi.fn(
  async (_sender: unknown, _mail: { to: string; subject: string; html: string }) => ({
    ok: true,
    sentVia: 'oauth' as string,
  })
);

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
  autoFollowUpDueAt: new Date('2026-08-07T09:00:00Z'),
  autoFollowUpStage: 0,
  ...over,
});

beforeEach(() => {
  n = 0;
  vi.clearAllMocks();
  delete process.env.AUTO_FOLLOW_UP_FROM;
  prisma.user.findFirst.mockResolvedValue(SENDER);
  prisma.lead.findMany.mockResolvedValue([]);
  prisma.leadActivity.count.mockResolvedValue(0);
  prisma.leadActivity.findMany.mockResolvedValue([]);
  prisma.$transaction.mockResolvedValue([]);
  sendAsUser.mockResolvedValue({ ok: true, sentVia: 'oauth' });
});

describe('who it will not email', () => {
  const whereOf = () =>
    (prisma.lead.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;

  it('asks only for leads whose next email is due', async () => {
    await run();

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

    expect(
      (prisma.user.findFirst.mock.calls[0]![0] as { where: { OR: unknown[] } }).where.OR
    ).toEqual([
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
    expect(sendAsUser.mock.calls[0]![1].subject).toContain('Ridgeline');
    expect(sendAsUser.mock.calls[0]![1].to).toBe('d1@example.com');
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
    const data = (prisma.lead.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
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

/**
 * Two emails, not one, and never the same one twice.
 *
 * The stage counter is the only thing that knows which wording is next.
 * Getting it wrong does not fail loudly — it sends the day-three email a
 * second time, to somebody who already read it, from an address trying to
 * build a reputation.
 */
describe('the sequence', () => {
  /**
   * What the route asked to be written to the lead.
   *
   * Read off `lead.update` rather than out of the `$transaction` array: the
   * array holds the promises those calls returned, not their arguments.
   */
  const writtenTo = () =>
    (prisma.lead.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;

  it('sends the opener first and books the closer', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({ autoFollowUpStage: 0, autoFollowUpDueAt: new Date('2026-08-10T09:00:00Z') }),
    ]);

    await run();

    expect(sendAsUser.mock.calls[0]![1].subject).toMatch(/^Following up/);
    expect(writtenTo().autoFollowUpStage).toBe(1);
    // Day seven, measured from the call rather than from now, so a run that
    // slipped a day does not drag the rest of the schedule with it.
    expect((writtenTo().autoFollowUpDueAt as Date).toISOString().slice(0, 10)).toBe('2026-08-14');
  });

  it('sends the closer second and ends the sequence', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({ autoFollowUpStage: 1, autoFollowUpDueAt: new Date('2026-08-14T09:00:00Z') }),
    ]);

    await run();

    expect(sendAsUser.mock.calls[0]![1].subject).toMatch(/^Last one from me/);
    expect(writtenTo().autoFollowUpStage).toBe(2);
    // Null is what ends it. There is no separate finished flag that could
    // drift out of step with the counter.
    expect(writtenTo().autoFollowUpDueAt).toBeNull();
  });

  /** A bounced first email means a bounced second. Stop, do not advance. */
  it('ends the sequence outright when one bounces', async () => {
    prisma.lead.findMany.mockResolvedValue([lead()]);
    sendAsUser.mockResolvedValue({ ok: false, sentVia: 'failed' });

    await run();

    const data = (prisma.lead.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.autoFollowUpDueAt).toBeNull();
  });
});

/**
 * The one collision that would make the whole thing read as automated.
 *
 * The rep sends the hand-written follow-up from the call screen and the
 * automated one lands the next morning. Two emails in two days from the same
 * company is the exact texture this is trying not to have.
 */
describe('a lead a person just emailed', () => {
  it('waits rather than landing the morning after', async () => {
    prisma.lead.findMany.mockResolvedValue([lead(), lead()]);
    prisma.leadActivity.findMany.mockResolvedValue([{ leadId: 'lead_1' }]);

    const { body } = await run();

    expect(body.sent).toBe(1);
    expect(body.deferred).toBe(1);
    expect(sendAsUser.mock.calls[0]![1].to).toBe('d2@example.com');
  });

  /** Pushed back, not dropped — the email is still worth sending. */
  it('reschedules rather than skipping', async () => {
    prisma.lead.findMany.mockResolvedValue([lead()]);
    prisma.leadActivity.findMany.mockResolvedValue([{ leadId: 'lead_1' }]);

    await run();

    const data = (prisma.lead.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.autoFollowUpDueAt).toBeInstanceOf(Date);
    expect((data.autoFollowUpDueAt as Date).getTime()).toBeGreaterThan(Date.now());
  });
});
