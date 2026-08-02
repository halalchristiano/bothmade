import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/crypto';
import {
  createGmailOAuthBatchClient,
  scanBouncedAddresses,
  scanReplyAddresses,
} from '@/lib/gmail-oauth';

/** Records whether this mailbox needs re-authorising, so the UI can say so. */
async function flagNeedsReconnect(userId: string, needed: boolean): Promise<void> {
  await prisma.user
    .update({ where: { id: userId }, data: { gmailNeedsReconnect: needed } })
    .catch((err) => console.error('Could not record Gmail reconnect state:', err));
}

export interface BounceSyncResult {
  ok: boolean;
  scanned: number;
  flagged: number;
  companies: string[];
  needsReconnect?: boolean;
  error?: string;
}

/**
 * Reads one user's bounce label and flags every lead whose address came back
 * undeliverable.
 *
 * Shared by the button on the call list and the nightly job, so a bounce is
 * caught whether or not anyone thinks to press anything — the automatic pass
 * is the one that matters, since the whole failure mode here is that nobody
 * notices a dead address.
 */
export async function syncBouncesForUser(
  userId: string,
  opts: { maxMessages?: number; newerThanDays?: number } = {}
): Promise<BounceSyncResult> {
  const empty = { scanned: 0, flagged: 0, companies: [] as string[] };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleRefreshToken: true },
  });
  if (!user?.googleRefreshToken) {
    return { ok: false, ...empty, error: 'No Google account connected.' };
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(user.googleRefreshToken);
  } catch {
    return { ok: false, ...empty, error: 'Stored Google credentials could not be read.' };
  }

  const scan = await scanBouncedAddresses(createGmailOAuthBatchClient(refreshToken), opts);
  if (!scan.ok) {
    if (scan.needsReconnect) await flagNeedsReconnect(userId, true);
    return { ok: false, ...empty, needsReconnect: scan.needsReconnect, error: scan.error };
  }
  // A read that worked proves the scope is there, whatever we thought before.
  await flagNeedsReconnect(userId, false);
  if (scan.addresses.length === 0) {
    return { ok: true, ...empty, scanned: scan.scanned };
  }

  // Only leads not already flagged, so a nightly re-run doesn't keep resetting
  // the date on bounces that were dealt with weeks ago.
  const matches = await prisma.lead.findMany({
    where: {
      email: { in: scan.addresses, mode: 'insensitive' },
      emailDeliveryFailedAt: null,
      status: { notIn: ['won', 'lost'] },
    },
    select: { id: true, company: true },
  });

  if (matches.length > 0) {
    await prisma.lead.updateMany({
      where: { id: { in: matches.map((m) => m.id) } },
      data: {
        emailDeliveryFailedAt: new Date(),
        emailDeliveryFailedReason:
          "The email bounced back — this address doesn't work. Call them instead.",
      },
    });
  }

  return {
    ok: true,
    scanned: scan.scanned,
    flagged: matches.length,
    companies: matches.map((m) => m.company),
  };
}

/**
 * Runs the scan for every connected mailbox. Used by the nightly job.
 * One mailbox failing (a revoked token, a missing scope) must not stop the
 * others from being scanned.
 */
export async function syncBouncesForAllUsers(): Promise<{ flagged: number; scanned: number }> {
  const users = await prisma.user.findMany({
    where: { googleRefreshToken: { not: null } },
    select: { id: true, email: true },
  });

  let flagged = 0;
  let scanned = 0;
  for (const user of users) {
    try {
      // Runs daily, so a few days of overlap is plenty and keeps the job
      // comfortably inside its time limit.
      const result = await syncBouncesForUser(user.id, { maxMessages: 40, newerThanDays: 3 });
      scanned += result.scanned;
      flagged += result.flagged;
      if (!result.ok) console.error(`Bounce sync skipped for ${user.email}: ${result.error}`);
      else if (result.flagged > 0) {
        console.log(`Bounce sync flagged ${result.flagged} lead(s) for ${user.email}`);
      }
    } catch (error) {
      console.error(`Bounce sync threw for ${user.email}:`, error);
    }
  }
  return { flagged, scanned };
}

/**
 * Flags leads who have written back.
 *
 * Runs alongside the bounce scan and on the same schedule, because they're
 * two halves of the same question: which of the emails we sent actually
 * landed, and which of them got an answer. A reply left undetected is worse
 * than a bounce left undetected — the lead is warm and sinking down a queue
 * sorted by neglect.
 */
export async function syncRepliesForUser(
  userId: string,
  opts: { maxMessages?: number; newerThanDays?: number } = {}
): Promise<BounceSyncResult> {
  const empty = { scanned: 0, flagged: 0, companies: [] as string[] };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleRefreshToken: true },
  });
  if (!user?.googleRefreshToken) {
    return { ok: false, ...empty, error: 'No Google account connected.' };
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(user.googleRefreshToken);
  } catch {
    return { ok: false, ...empty, error: 'Stored Google credentials could not be read.' };
  }

  const scan = await scanReplyAddresses(createGmailOAuthBatchClient(refreshToken), opts);
  if (!scan.ok) {
    if (scan.needsReconnect) await flagNeedsReconnect(userId, true);
    return { ok: false, ...empty, needsReconnect: scan.needsReconnect, error: scan.error };
  }
  await flagNeedsReconnect(userId, false);
  if (scan.addresses.length === 0) {
    return { ok: true, ...empty, scanned: scan.scanned };
  }

  // A second reply from someone already flagged shouldn't reset the clock and
  // re-announce them, so only leads not currently flagged are picked up.
  const matches = await prisma.lead.findMany({
    where: {
      email: { in: scan.addresses, mode: 'insensitive' },
      replyReceivedAt: null,
      status: { notIn: ['won', 'lost'] },
    },
    select: { id: true, company: true },
  });

  if (matches.length > 0) {
    const ids = matches.map((m) => m.id);
    await prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: {
        replyReceivedAt: new Date(),
        // A reply means the address works, so any earlier bounce flag on it
        // was either wrong or has since been fixed.
        emailDeliveryFailedAt: null,
        emailDeliveryFailedReason: null,
      },
    });
    // Set separately: 'replied' is only ever an advance, and updateMany can't
    // apply a per-row condition.
    await prisma.lead.updateMany({
      where: { id: { in: ids }, status: { in: ['new', 'researched', 'contacted'] } },
      data: { status: 'replied' },
    });
  }

  return {
    ok: true,
    scanned: scan.scanned,
    flagged: matches.length,
    companies: matches.map((m) => m.company),
  };
}

/** Runs the reply scan for every connected mailbox. Used by the nightly job. */
export async function syncRepliesForAllUsers(): Promise<{ flagged: number; scanned: number }> {
  const users = await prisma.user.findMany({
    where: { googleRefreshToken: { not: null } },
    select: { id: true, email: true },
  });

  let flagged = 0;
  let scanned = 0;
  for (const user of users) {
    try {
      const result = await syncRepliesForUser(user.id, { maxMessages: 40, newerThanDays: 3 });
      scanned += result.scanned;
      flagged += result.flagged;
      if (!result.ok) console.error(`Reply sync skipped for ${user.email}: ${result.error}`);
      else if (result.flagged > 0) {
        console.log(`Reply sync flagged ${result.flagged} lead(s) for ${user.email}`);
      }
    } catch (error) {
      console.error(`Reply sync threw for ${user.email}:`, error);
    }
  }
  return { flagged, scanned };
}
