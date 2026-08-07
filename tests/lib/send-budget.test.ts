import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The ceiling that was not there.
 *
 * There was a cap of 200 per request and nothing else, so four presses of
 * send was eight hundred emails in an afternoon and Google restricted the
 * account. Nothing in the app counted, warned, or refused — the mistake was
 * not somebody sending too much, it was that sending too much was the easiest
 * thing to do and looked identical to sending the right amount.
 *
 * Two properties matter more than the number itself: every send path is
 * counted against the same budget, and a batch that gets trimmed says so.
 */

const prisma = { leadActivity: { count: vi.fn(async (_a: unknown) => 0) } };
vi.mock('@/lib/prisma', () => ({ prisma }));

const { checkSendBudget, sentToday, dailySendLimit, DEFAULT_DAILY_SEND_LIMIT } = await import(
  '@/lib/send-budget'
);

const NOW = new Date('2026-08-07T15:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.DAILY_EMAIL_LIMIT;
  prisma.leadActivity.count.mockResolvedValue(0);
});
afterEach(() => {
  delete process.env.DAILY_EMAIL_LIMIT;
});

describe('the limit', () => {
  it('is far below what Google would technically allow', () => {
    // Gmail's own ceilings are 500 personal / 2,000 Workspace, and those are
    // the numbers that get an account suspended rather than the safe ones.
    expect(DEFAULT_DAILY_SEND_LIMIT).toBeLessThan(500);
    expect(dailySendLimit()).toBe(DEFAULT_DAILY_SEND_LIMIT);
  });

  it('can be raised deliberately, through the environment', () => {
    process.env.DAILY_EMAIL_LIMIT = '250';
    expect(dailySendLimit()).toBe(250);
  });

  it('ignores nonsense rather than falling open', () => {
    for (const bad of ['0', '-40', 'lots', '']) {
      process.env.DAILY_EMAIL_LIMIT = bad;
      expect(dailySendLimit(), bad).toBe(DEFAULT_DAILY_SEND_LIMIT);
    }
  });
});

describe('counting what has gone today', () => {
  it('counts this user, from midnight, and only email', async () => {
    await sentToday('user_1', NOW);

    const where = (prisma.leadActivity.count.mock.calls[0][0] as unknown as {
      where: { type: string; createdById: string; createdAt: { gte: Date } };
    }).where;
    expect(where.type).toBe('email');
    expect(where.createdById).toBe('user_1');
    expect(where.createdAt.gte.getHours()).toBe(0);
    expect(where.createdAt.gte.getDate()).toBe(NOW.getDate());
  });
});

describe('asking for room', () => {
  it('gives the whole batch when the day is empty', async () => {
    const b = await checkSendBudget('user_1', 50, NOW);

    expect(b.allowed).toBe(50);
    expect(b.error).toBeUndefined();
  });

  /** The behaviour that stops somebody pressing send again to "finish". */
  it('trims to what is left rather than refusing outright', async () => {
    prisma.leadActivity.count.mockResolvedValue(DEFAULT_DAILY_SEND_LIMIT - 10);

    const b = await checkSendBudget('user_1', 100, NOW);

    expect(b.allowed).toBe(10);
    expect(b.remaining).toBe(10);
    expect(b.error).toBeUndefined();
  });

  it('refuses, and explains, once the day is spent', async () => {
    prisma.leadActivity.count.mockResolvedValue(DEFAULT_DAILY_SEND_LIMIT);

    const b = await checkSendBudget('user_1', 1, NOW);

    expect(b.allowed).toBe(0);
    expect(b.error).toMatch(/daily limit/i);
    // Says when it comes back, or the only guess left is "press send again".
    expect(b.error).toMatch(/midnight/i);
  });

  /** A limit lowered mid-day would otherwise report a negative allowance. */
  it('never reports a debt', async () => {
    prisma.leadActivity.count.mockResolvedValue(DEFAULT_DAILY_SEND_LIMIT + 400);

    const b = await checkSendBudget('user_1', 10, NOW);

    expect(b.remaining).toBe(0);
    expect(b.allowed).toBe(0);
  });
});
