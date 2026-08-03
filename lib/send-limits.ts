import { prisma } from '@/lib/prisma';

/**
 * Volume guardrails for outbound sending.
 *
 * Cold outreach goes out from the reps' own Gmail mailboxes. Gmail does not
 * publish a hard number, but a personal-domain Workspace account that
 * suddenly sends a few hundred near-identical messages back-to-back gets
 * rate-limited, then temporarily blocked, then reputation-damaged — and the
 * damage lands on the whole domain, including the invoices and password
 * resets going to paying clients.
 *
 * Two mechanisms, because they solve different halves of it:
 *   - a daily cap, so a single "send all" can't empty a 500-row import into
 *     one mailbox in an afternoon;
 *   - a delay with jitter between sends, so a batch doesn't arrive as a
 *     burst of identically-spaced messages, which is the single easiest
 *     automation signature to spot.
 */

/**
 * Per-sender, per-day ceiling. Deliberately well under Gmail's published
 * 2,000/day Workspace limit: that limit is for legitimate mail, and cold
 * outreach earns spam complaints that count against reputation long before
 * a quota does.
 */
export const DAILY_SEND_CAP = Number(process.env.DAILY_SEND_CAP ?? 120);

/** Base gap between sends in a batch, in milliseconds. */
const BASE_DELAY_MS = Number(process.env.SEND_DELAY_MS ?? 2500);

/** Random extra on top, so the gaps aren't a constant. */
const JITTER_MS = Number(process.env.SEND_JITTER_MS ?? 3500);

export function nextSendDelayMs(): number {
  return BASE_DELAY_MS + Math.floor(Math.random() * JITTER_MS);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Local midnight, so "today" means the rep's working day. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface SendAllowance {
  /** How many more this sender may send today. */
  remaining: number;
  sentToday: number;
  cap: number;
}

/**
 * How much of today's allowance this sender has left.
 *
 * Counted from logged email activity rather than a counter column, so it
 * stays right even when sends happen through more than one route and
 * cannot drift out of sync with what actually went out.
 */
export async function sendAllowanceFor(userId: string): Promise<SendAllowance> {
  const sentToday = await prisma.leadActivity.count({
    where: {
      type: 'email',
      createdById: userId,
      createdAt: { gte: startOfToday() },
    },
  });

  return {
    sentToday,
    cap: DAILY_SEND_CAP,
    remaining: Math.max(0, DAILY_SEND_CAP - sentToday),
  };
}
