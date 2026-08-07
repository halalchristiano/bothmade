import { prisma } from '@/lib/prisma';

/**
 * How much sending is left today.
 *
 * There was a per-request cap of 200 and nothing else, so pressing send four
 * times sent eight hundred emails and the app was pleased with itself each
 * time. Google restricted the account. That is not a mistake somebody made —
 * it is a mistake the app made available, with no counter, no warning, and no
 * way to know you were near a limit until you were past it.
 *
 * WHY THE NUMBER IS LOW. Gmail's published ceiling is 500 recipients a day on
 * a personal account and 2,000 on Workspace, and those are the numbers that
 * get an account suspended rather than the numbers that are safe. Cold
 * outreach from a domain with no sending history is judged on complaint rate
 * and engagement, not on the published cap: a few hundred cold emails in a
 * day from a new domain looks exactly like a compromised mailbox, which is
 * what the automated systems are built to catch. A recovering domain wants to
 * be well under, not just inside.
 *
 * Five hundred is a deliberate choice, not a default nobody looked at. It sits
 * a quarter of the way into Workspace's 2,000 and is paired with the thing
 * that actually decides whether that volume is safe: every address verified
 * before it is sent to. Bounce rate is what gets a sender restricted, and a
 * verified list bounces at a fraction of a percent — the guards in
 * lib/send-safety.ts are what hold that promise to account, refusing a batch
 * outright if the standing rate ever climbs back.
 *
 * `DAILY_EMAIL_LIMIT` overrides it. Worth dropping to 30 or so for a week
 * after any restriction, because the first days back are judged harder than
 * the steady state.
 */
export const DEFAULT_DAILY_SEND_LIMIT = 500;

export function dailySendLimit(): number {
  const raw = Number(process.env.DAILY_EMAIL_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_DAILY_SEND_LIMIT;
}

/**
 * Counted from the activity timeline rather than a column of its own.
 *
 * Every path that sends to a lead already writes a `leadActivity` of type
 * `email` — the composer, the bulk sender and the cold-draft sender all do,
 * which is the whole reason this needed no migration and no new bookkeeping
 * that could drift out of step with what was really sent.
 *
 * Per user, because the limit that matters is per mailbox: two people sending
 * from two Gmail accounts have two separate ceilings, and pooling them would
 * throttle one of them for the other's work.
 */
export async function sentToday(userId: string, now: Date = new Date()): Promise<number> {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  return prisma.leadActivity.count({
    where: { type: 'email', createdById: userId, createdAt: { gte: startOfDay } },
  });
}

export interface SendBudget {
  limit: number;
  used: number;
  /** Never negative — a limit lowered mid-day would otherwise read as a debt. */
  remaining: number;
  /** How many of `wanted` may actually go now. */
  allowed: number;
  /** Set when nothing at all may be sent, phrased for the person who pressed send. */
  error?: string;
}

/**
 * Ask how many of `wanted` may go out right now.
 *
 * Trims rather than refuses, when there is room for some: a batch of a hundred
 * that can send forty should send forty and say so, because refusing the whole
 * thing teaches people to press send again rather than to send less. The
 * caller is expected to report `allowed` and `remaining` back — a silent trim
 * would be its own kind of lie.
 */
export async function checkSendBudget(
  userId: string,
  wanted: number,
  now: Date = new Date()
): Promise<SendBudget> {
  const limit = dailySendLimit();
  const used = await sentToday(userId, now);
  const remaining = Math.max(0, limit - used);
  const allowed = Math.max(0, Math.min(wanted, remaining));

  return {
    limit,
    used,
    remaining,
    allowed,
    error:
      allowed === 0
        ? `You have sent ${used} emails today and the daily limit is ${limit}. Sending more is how a Google account gets restricted — this resets at midnight. If you genuinely need a higher ceiling, raise DAILY_EMAIL_LIMIT rather than sending around it.`
        : undefined,
  };
}
