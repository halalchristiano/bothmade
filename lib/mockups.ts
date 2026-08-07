import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { normalizeUrl } from '@/lib/html';

/**
 * One lead gets several mockups over the life of a deal. Attaching one is
 * more than an insert: it's the moment the handoff from design to sales
 * completes, so the lead's cached "latest mockup" columns move, the urgent
 * "I need a mockup" flag in team chat gets resolved, and the team is told.
 * That sequence lives here because three call sites do it — the mockup
 * queue's PATCH, the attach button on the dashboard, and a CSV import that
 * arrives with a link already in it.
 */

/**
 * Where a mockup is in its life.
 *
 * `viewed` is the one that earns its keep. Whether a prospect has opened the
 * thing you built for them is the strongest signal in the whole pipeline and
 * it used to be unrecorded, so the rep's opening line on a follow-up call was
 * "did you get a chance to look at it?" — the weakest question in sales, and
 * one the system could have answered for him.
 */
export const MOCKUP_STATUSES = ['draft', 'sent', 'viewed', 'approved', 'changes_requested'] as const;
export type MockupStatus = (typeof MOCKUP_STATUSES)[number];

export function isMockupStatus(value: unknown): value is MockupStatus {
  return typeof value === 'string' && (MOCKUP_STATUSES as readonly string[]).includes(value);
}

/** How long a sent mockup stays reachable. */
export const MOCKUP_LINK_DAYS = 30;

export function mockupExpiryFrom(sentAt: Date): Date {
  const expires = new Date(sentAt);
  expires.setDate(expires.getDate() + MOCKUP_LINK_DAYS);
  return expires;
}

export function mockupLinkExpired(
  mockup: { expiresAt: Date | string | null },
  now: Date = new Date()
): boolean {
  return Boolean(mockup.expiresAt) && new Date(mockup.expiresAt as Date) <= now;
}

/**
 * How long before a live link dies is worth saying so.
 *
 * A thirty-day link warned at five days left leaves room to re-send before
 * anybody hits a dead one. Shorter and the warning arrives too late to act
 * on; longer and it is on screen for most of a mockup's life, which is the
 * same as not being there.
 */
export const MOCKUP_EXPIRY_WARNING_DAYS = 5;

/**
 * A link that still works and is about to stop.
 *
 * THE FAILURE THIS EXISTS FOR. Nothing said anything about expiry until the
 * link was already dead — and the person who finds out is the prospect,
 * clicking a link we sent them and getting nothing. A deal in its slowest,
 * most considered week is exactly when a mockup is thirty days old and
 * exactly when that click happens.
 *
 * Re-sending resets the clock, which is one button that already exists. The
 * only thing missing was knowing to press it.
 */
export function mockupLinkExpiringSoon(
  mockup: { expiresAt: Date | string | null },
  now: Date = new Date()
): boolean {
  if (!mockup.expiresAt) return false;
  const left = new Date(mockup.expiresAt as Date).getTime() - now.getTime();
  return left > 0 && left <= MOCKUP_EXPIRY_WARNING_DAYS * 86_400_000;
}

/** Whole days until the link stops working. Null when it never will. */
export function mockupDaysLeft(
  mockup: { expiresAt: Date | string | null },
  now: Date = new Date()
): number | null {
  if (!mockup.expiresAt) return null;
  const left = new Date(mockup.expiresAt as Date).getTime() - now.getTime();
  return left <= 0 ? 0 : Math.ceil(left / 86_400_000);
}

export interface LeadMockupDTO {
  id: string;
  url: string;
  fileName: string | null;
  note: string;
  uploadedAt: string;
  uploadedByName: string | null;
  status: MockupStatus;
  shareToken: string;
  sentAt: string | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  expiresAt: string | null;
  expired: boolean;
  /** Still works, about to stop. See mockupLinkExpiringSoon. */
  expiringSoon: boolean;
  respondedAt: string | null;
  responseNote: string | null;
  /** Set when the last send failed. The link is live; the email is not. */
  sendFailedAt: string | null;
  sendFailedReason: string | null;
}

interface MockupRow {
  id: string;
  url: string;
  fileName: string | null;
  note: string;
  createdAt: Date;
  uploadedBy?: { name: string | null } | null;
  status?: string;
  shareToken?: string;
  sentAt?: Date | null;
  firstViewedAt?: Date | null;
  lastViewedAt?: Date | null;
  viewCount?: number;
  expiresAt?: Date | null;
  respondedAt?: Date | null;
  sendFailedAt?: Date | null;
  sendFailedReason?: string | null;
  responseNote?: string | null;
}

/**
 * What "still to build" means, in one place.
 *
 * Three screens counted it three different ways, so the dashboard could say
 * "1 mockup to build" while the Mockups page listed several. Two of them
 * required `mockupUrl: null`, which quietly excluded every lead that already
 * has a preview deployment standing but no client folder — work that is very
 * much still to do, and exactly the work the Mockups page shows.
 *
 * The folder is the deliverable. A preview deployment is a password-protected
 * subdomain we look at; it is not something anybody has been given. So a lead
 * is still to build while it has no folder, and it counts as work at all once
 * somebody has either asked for a mockup or already started one.
 *
 * Used by the Mockups page, the dashboard's Deliver lane, and the ops stats.
 * A number that disagrees with itself across three screens is a number people
 * stop trusting on all three.
 */
export const MOCKUPS_TO_BUILD_WHERE: Prisma.LeadWhereInput = {
  mockupFolderUrl: null,
  // Already delivered by hand. The work is done; it simply did not go out
  // through the button, and a queue that cannot be told that keeps showing
  // finished work as outstanding forever.
  mockupSentManuallyAt: null,
  /*
   * And already delivered through the button, which is the ordinary way.
   *
   * Sending a mockup writes only to the mockup row — it has never touched
   * `mockupRequested` or `mockupFolderUrl` on the lead. So a mockup that was
   * built, sent, opened and replied to left this clause completely unchanged,
   * and the lead sat on the build queue forever as work still to do. The
   * dashboard said "6 mockups requested and not built" over a list that
   * included mockups the client had already seen.
   *
   * A mockup somebody has received is built. That is what the tab means, and
   * this is the only line that could say so.
   */
  mockups: { none: { sentAt: { not: null } } },
  OR: [{ mockupRequested: true }, { mockupUrl: { not: null } }],
};

export const mockupInclude = { uploadedBy: { select: { name: true } } } as const;

export function toMockupDTO(m: MockupRow): LeadMockupDTO {
  return {
    id: m.id,
    url: m.url,
    fileName: m.fileName,
    note: m.note,
    uploadedAt: m.createdAt.toISOString(),
    uploadedByName: m.uploadedBy?.name ?? null,
    status: isMockupStatus(m.status) ? m.status : 'draft',
    shareToken: m.shareToken ?? '',
    sentAt: m.sentAt?.toISOString() ?? null,
    firstViewedAt: m.firstViewedAt?.toISOString() ?? null,
    lastViewedAt: m.lastViewedAt?.toISOString() ?? null,
    viewCount: m.viewCount ?? 0,
    expiresAt: m.expiresAt?.toISOString() ?? null,
    expired: mockupLinkExpired({ expiresAt: m.expiresAt ?? null }),
    // So a list can sort and colour by it without re-deriving the rule.
    expiringSoon: mockupLinkExpiringSoon({ expiresAt: m.expiresAt ?? null }),
    respondedAt: m.respondedAt?.toISOString() ?? null,
    responseNote: m.responseNote ?? null,
    sendFailedAt: m.sendFailedAt?.toISOString() ?? null,
    sendFailedReason: m.sendFailedReason ?? null,
  };
}

/**
 * What the rep should be told about a mockup, in one line.
 *
 * Deliberately leads with the fact that changes what they do next. "Opened 4
 * times, last 2 hours ago" is a reason to pick up the phone right now;
 * "Sent 6 days ago, never opened" is a reason to try a different channel.
 */
export function mockupSignal(m: LeadMockupDTO, now: Date = new Date()): string {
  if (m.status === 'approved') return 'Approved by the client';
  if (m.status === 'changes_requested') return 'They asked for changes';
  /*
   * Above everything except what the client has already said, because it is
   * the only line here that means the client has never heard from us. Read as
   * "sent, not opened", a rep waits, then chases a person who was never
   * written to — while the fix is to send it again, which takes one click.
   */
  if (m.sendFailedAt) return 'Failed to send — nobody received this. Send it again.';
  if (m.expired) return 'Link expired — re-send to reopen it';

  /*
   * Appended rather than replacing, because it is a deadline on a fact rather
   * than a fact of its own: "opened 4 times, link dies in 2 days" is a reason
   * to act today, and either half alone is not.
   */
  const daysLeft = mockupDaysLeft(m, now);
  const dying =
    mockupLinkExpiringSoon(m, now) && daysLeft !== null
      ? ` · link dies ${daysLeft <= 1 ? 'tomorrow' : `in ${daysLeft} days`} — re-send to reset it`
      : '';

  if (m.viewCount > 0) {
    const last = m.lastViewedAt ? new Date(m.lastViewedAt) : null;
    const hours = last ? Math.floor((now.getTime() - last.getTime()) / 3_600_000) : null;
    const when =
      hours === null ? '' : hours < 1 ? ', last just now' : hours < 24 ? `, last ${hours}h ago` : `, last ${Math.floor(hours / 24)}d ago`;
    return `Opened ${m.viewCount} time${m.viewCount === 1 ? '' : 's'}${when}${dying}`;
  }
  if (m.status === 'sent' || m.sentAt) {
    const days = m.sentAt ? Math.floor((now.getTime() - new Date(m.sentAt).getTime()) / 86_400_000) : 0;
    return (days <= 0 ? 'Sent today, not opened yet' : `Sent ${days}d ago, never opened`) + dying;
  }
  return 'Not sent to the client yet';
}

/**
 * These end up as an `href` on a button someone clicks mid-call, so anything
 * that isn't a real web link is refused at the door rather than rendered as
 * a dead — or hostile — button. A bare "www.figma.com/..." is the one thing
 * worth rescuing: it's what a paste from the address bar looks like.
 */
/**
 * The one link that may go to a client, and null when there isn't one.
 *
 * The preview deployment is not it. It sits behind Vercel's password
 * protection so a prospect's competitors can't find their unannounced
 * redesign, which means sending it hands the client a password wall — and
 * for a while the lead page offered exactly that, under a button reading
 * "open the mockup we sent" on a lead nothing had been sent to.
 *
 * So the choice is made here rather than at each call site. Anything that
 * emails, pre-fills, or shares a mockup asks this function; the preview URL
 * is for us to navigate to and nothing else.
 *
 * Normalised through `normalizeUrl` rather than `normalizeMockupUrl` below,
 * because this is a link that ends up in an email and it has to survive the
 * same way every other emailed link does — a Drive folder copied out of a
 * document arrives without its scheme, and the stricter normalizer drops it
 * on the floor.
 */
export function clientMockupLink(lead: {
  mockupFolderUrl?: string | null;
  mockupUrl?: string | null;
}): string | null {
  return normalizeUrl(lead.mockupFolderUrl);
}

export function normalizeMockupUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (!/^https?:\/\/\S/i.test(trimmed)) return null;
  return trimmed;
}

export async function listLeadMockups(leadId: string): Promise<LeadMockupDTO[]> {
  const mockups = await prisma.leadMockup.findMany({
    where: { leadId },
    orderBy: { createdAt: 'asc' },
    include: mockupInclude,
  });
  return mockups.map(toMockupDTO);
}

/**
 * Records a mockup against a lead and returns it with its version number.
 * Re-sending a URL the lead already has is treated as a no-op rather than a
 * second version — the queue's PATCH can fire twice for one paste, and two
 * identical "Mockup 2" rows help nobody.
 */
export async function recordLeadMockup({
  leadId,
  url,
  fileName = null,
  note = '',
  userId,
  cacheAsLatest = true,
}: {
  leadId: string;
  url: string;
  fileName?: string | null;
  note?: string;
  userId: string;
  /**
   * Whether to point the lead's `mockupUrl` cache at this version.
   *
   * True for an attach, which is what that column is a cache of. False when
   * the URL already lives in a column of its own — sending the client folder
   * would otherwise overwrite the preview build with the folder link and put
   * both links back in one field, which is the whole thing the folder column
   * exists to prevent. Caught by sending against a real database; nothing in
   * the types objects to it.
   */
  cacheAsLatest?: boolean;
}): Promise<{ mockup: LeadMockupDTO; index: number; alreadyAttached: boolean }> {
  const existing = await prisma.leadMockup.findMany({
    where: { leadId },
    orderBy: { createdAt: 'asc' },
    include: mockupInclude,
  });

  const duplicateAt = existing.findIndex((m) => m.url === url);
  if (duplicateAt !== -1) {
    return {
      mockup: toMockupDTO(existing[duplicateAt]!),
      index: duplicateAt + 1,
      alreadyAttached: true,
    };
  }

  const created = await prisma.leadMockup.create({
    data: { leadId, url, fileName, note, uploadedById: userId },
    include: mockupInclude,
  });
  const index = existing.length + 1;

  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: {
      ...(cacheAsLatest ? { mockupUrl: url } : {}),
      mockupDeliveredAt: created.createdAt,
    },
  });

  // The first mockup is the answer to a request someone flagged as urgent —
  // clearing that flag is what takes the lead out of "design is blocking me".
  if (index === 1) {
    await prisma.teamMessage.updateMany({
      where: { relatedLeadId: leadId, urgent: true, resolved: false },
      data: { resolved: true },
    });
  }

  await prisma.teamMessage.create({
    data: {
        kind: 'system',
      content:
        index === 1
          ? `✅ Mockup ready for ${lead.company}: ${url}`
          : `✅ Mockup ${index} added for ${lead.company}: ${url}`,
      fromUserId: userId,
      relatedLeadId: leadId,
      urgent: false,
    },
  });

  return { mockup: toMockupDTO(created), index, alreadyAttached: false };
}

/**
 * Mark a mockup as sent, stamping the clock that everything downstream reads.
 * The expiry is set here rather than at creation because an unsent mockup has
 * nothing to expire.
 */
export async function markMockupSent(mockupId: string, at: Date = new Date()) {
  const current = await prisma.leadMockup.findUnique({
    where: { id: mockupId },
    select: { status: true },
  });

  // Re-sending *this* mockup reopens a link that expired. It is not a new
  // version — that would be a new row — so it must not erase what the client
  // already said about it. Setting status back to 'sent' on an approved
  // mockup would delete the only record of them saying yes, and an approval
  // is the single most valuable thing this table holds.
  const settled = current?.status === 'approved' || current?.status === 'changes_requested';

  return prisma.leadMockup.update({
    where: { id: mockupId },
    data: {
      ...(settled ? {} : { status: 'sent' }),
      sentAt: at,
      expiresAt: mockupExpiryFrom(at),
      // Cleared here rather than only on success, because this runs before
      // every send: a re-send that works must not leave last time's failure
      // showing, and a re-send that fails writes its own reason a moment
      // later. The two states can never both be true.
      sendFailedAt: null,
      sendFailedReason: null,
    },
  });
}

/**
 * The send did not happen, on a row that says it did.
 *
 * `markMockupSent` stamps `sentAt` *before* the send goes out, deliberately —
 * the tracked link 404s while the row is still a draft, so a link mailed
 * against an unstamped row is one the client cannot open. The cost was that a
 * failed send looked exactly like a delivered one: the card read "Sent today,
 * not opened yet", the real error lived in the response and was gone on the
 * next reload, and the pipeline counted work delivered to nobody.
 *
 * The stamp stays. This is what sits next to it and says so, so the rep chases
 * the mail rather than the client.
 */
export async function markMockupSendFailed(mockupId: string, reason: string) {
  return prisma.leadMockup
    .update({
      where: { id: mockupId },
      data: { sendFailedAt: new Date(), sendFailedReason: reason.slice(0, 2000) },
    })
    .catch((e) => {
      console.error('Mockup send failure not recorded:', e);
      return null;
    });
}

/**
 * Record that the client opened it.
 *
 * Never downgrades: a mockup that has been approved and is then reopened is
 * still approved, and overwriting that with 'viewed' would lose the only
 * record of the client saying yes.
 */
export async function recordMockupView(mockupId: string, at: Date = new Date()) {
  const current = await prisma.leadMockup.findUnique({
    where: { id: mockupId },
    select: { status: true, firstViewedAt: true },
  });
  const keepsStatus = current?.status === 'approved' || current?.status === 'changes_requested';
  return prisma.leadMockup.update({
    where: { id: mockupId },
    data: {
      viewCount: { increment: 1 },
      lastViewedAt: at,
      ...(current?.firstViewedAt ? {} : { firstViewedAt: at }),
      ...(keepsStatus ? {} : { status: 'viewed' }),
    },
  });
}
