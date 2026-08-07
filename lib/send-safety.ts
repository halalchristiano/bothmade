import { prisma } from '@/lib/prisma';

/**
 * Not sending into a wall.
 *
 * Roughly three quarters of the leads in this book carry an address that was
 * never published anywhere — `info@` guessed from the company's domain
 * because it is right most of the time. Most of the time is not all of the
 * time, and every wrong one is a hard bounce.
 *
 * That matters more than the daily volume did. The industry danger line for
 * bounce rate is about 2%; a list that is three-quarters guesswork can sit
 * near 10%, and a sender bouncing one message in ten looks mechanically
 * identical to somebody working a scraped list — which is exactly the shape
 * the automated systems at Google and Microsoft are built to act on. The
 * sender treated a guess and a verified address identically, so nothing in
 * the app could see it coming.
 *
 * Two guards, and they answer different questions. `verifiedFirst` decides
 * the ORDER — known-good addresses go before guesses, so the safe volume is
 * spent on the safe half. `BounceWatch` decides when to STOP — a batch that
 * starts bouncing is a batch that should not run to the end.
 */

/** The tag the research CSVs carry on an address seen published. */
const CONFIRMED_TAG = 'confirmed-email';
/** And the one on an address inferred from the domain. */
const GUESSED_TAG = 'convention-email';

export interface AddressConfidence {
  tags: string;
  email: string | null;
  /** What a verifier said, when one has been run. See lib/email-verification.ts. */
  emailVerificationStatus?: string | null;
}

/**
 * Whether we have ever actually seen this address, as opposed to worked it
 * out. Anything untagged counts as unverified: the older imports carry no tag
 * at all and were produced the same guessing way, so treating "unknown" as
 * "fine" would quietly exempt the largest and least trustworthy group.
 */
export function isVerifiedAddress(lead: AddressConfidence): boolean {
  // A verifier's answer beats anything the research CSV claimed. `valid`
  // means a mail server confirmed the mailbox exists, which is a stronger
  // statement than "somebody saw this printed on a website" — and a status
  // that is present but not `valid` is a checked address that came back
  // uncertain, which must not be promoted on the strength of a stale tag.
  if (lead.emailVerificationStatus) return lead.emailVerificationStatus === 'valid';

  const tags = (lead.tags || '').toLowerCase();
  if (tags.includes(CONFIRMED_TAG)) return true;
  if (tags.includes(GUESSED_TAG)) return false;
  return false;
}

/**
 * Reorders a batch so verified addresses go first, keeping the caller's
 * relative order inside each group.
 *
 * Stable rather than sorted, because the caller has usually already chosen an
 * order that means something — most-opened first, biggest deal first — and
 * this should only lift the safe ones above the risky ones, not replace that
 * decision with its own.
 *
 * The reason this is worth doing at all: when a batch gets trimmed by the
 * daily ceiling, or halted by the bounce watch below, whatever was at the
 * front is what actually went. Putting guesses at the front spends a limited,
 * hard-won sending allowance on the addresses most likely to bounce.
 */
export function verifiedFirst<T extends AddressConfidence>(leads: T[]): T[] {
  const verified: T[] = [];
  const guessed: T[] = [];
  for (const lead of leads) (isVerifiedAddress(lead) ? verified : guessed).push(lead);
  return [...verified, ...guessed];
}

/**
 * How many messages must go before a bounce rate means anything.
 *
 * One failure out of two is 50% and says nothing at all. Below this the watch
 * stays quiet however bad the ratio looks, because stopping a batch of five
 * on its first refusal would make the guard useless noise.
 */
export const BOUNCE_WATCH_MIN_SAMPLE = 12;

/**
 * The rate at which a batch stops.
 *
 * Deliberately well above the 2% that matters long-term: this is not the
 * healthy-list target, it is the point at which continuing is actively
 * dangerous to the account. A batch running at one-in-five refused is not a
 * list with some dead addresses in it, it is a list the provider is already
 * unhappy about.
 */
export const BOUNCE_HALT_RATE = 0.2;

export interface BounceVerdict {
  /** Stop sending the rest of this batch. */
  halt: boolean;
  attempted: number;
  failed: number;
  rate: number;
  reason?: string;
}

/**
 * Watches a batch as it sends and says when to stop.
 *
 * Counts only what the mail server refused outright — an address it would not
 * accept. Everything else the loop treats as a failure (no address on file, a
 * lead marked do-not-contact) is our own bookkeeping and says nothing about
 * deliverability; counting those would halt a batch for being careful.
 *
 * Asynchronous bounces — the ones that arrive minutes later as a message from
 * the postmaster — are not visible here at all. Those are what
 * `recentBounceRate` below is for, on the next send rather than this one.
 */
export class BounceWatch {
  private attempted = 0;
  private failed = 0;

  /** Record one delivery attempt. `accepted` is what the mail server said. */
  record(accepted: boolean): void {
    this.attempted++;
    if (!accepted) this.failed++;
  }

  verdict(): BounceVerdict {
    const rate = this.attempted === 0 ? 0 : this.failed / this.attempted;
    const halt = this.attempted >= BOUNCE_WATCH_MIN_SAMPLE && rate >= BOUNCE_HALT_RATE;
    return {
      halt,
      attempted: this.attempted,
      failed: this.failed,
      rate,
      reason: halt
        ? `Stopped after ${this.attempted} — ${this.failed} were refused by the mail server (${Math.round(
            rate * 100
          )}%). A bounce rate this high is what gets a sending account restricted, and most of these addresses were guessed rather than found. Verify the rest before sending again.`
        : undefined,
    };
  }
}

/**
 * The bounce rate across recent sends, for the batch that has not started yet.
 *
 * A hard bounce usually arrives after the send loop has finished, so the
 * in-flight watch above cannot see it — the damage from yesterday only shows
 * up as `emailDeliveryFailedAt` on the lead once the postmaster replies.
 * Checking it before a new batch is what turns yesterday's evidence into
 * today's decision.
 */
export async function recentBounceRate(
  days = 7,
  now: Date = new Date()
): Promise<{ sent: number; bounced: number; rate: number }> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const [sent, bounced] = await Promise.all([
    prisma.lead.count({ where: { coldEmailSentAt: { gte: since } } }),
    prisma.lead.count({ where: { emailDeliveryFailedAt: { gte: since } } }),
  ]);

  return { sent, bounced, rate: sent === 0 ? 0 : bounced / sent };
}
