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
  respondedAt: string | null;
  responseNote: string | null;
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
  responseNote?: string | null;
}

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
    respondedAt: m.respondedAt?.toISOString() ?? null,
    responseNote: m.responseNote ?? null,
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
  if (m.expired) return 'Link expired — re-send to reopen it';
  if (m.viewCount > 0) {
    const last = m.lastViewedAt ? new Date(m.lastViewedAt) : null;
    const hours = last ? Math.floor((now.getTime() - last.getTime()) / 3_600_000) : null;
    const when =
      hours === null ? '' : hours < 1 ? ', last just now' : hours < 24 ? `, last ${hours}h ago` : `, last ${Math.floor(hours / 24)}d ago`;
    return `Opened ${m.viewCount} time${m.viewCount === 1 ? '' : 's'}${when}`;
  }
  if (m.status === 'sent' || m.sentAt) {
    const days = m.sentAt ? Math.floor((now.getTime() - new Date(m.sentAt).getTime()) / 86_400_000) : 0;
    return days <= 0 ? 'Sent today, not opened yet' : `Sent ${days}d ago, never opened`;
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
}: {
  leadId: string;
  url: string;
  fileName?: string | null;
  note?: string;
  userId: string;
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
    data: { mockupUrl: url, mockupDeliveredAt: created.createdAt },
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
    },
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
