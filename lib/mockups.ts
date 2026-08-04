import { prisma } from '@/lib/prisma';

/**
 * One lead gets several mockups over the life of a deal. Attaching one is
 * more than an insert: it's the moment the handoff from design to sales
 * completes, so the lead's cached "latest mockup" columns move, the urgent
 * "I need a mockup" flag in team chat gets resolved, and the team is told.
 * That sequence lives here because three call sites do it — the mockup
 * queue's PATCH, the attach button on the dashboard, and a CSV import that
 * arrives with a link already in it.
 */

export interface LeadMockupDTO {
  id: string;
  url: string;
  fileName: string | null;
  note: string;
  uploadedAt: string;
  uploadedByName: string | null;
}

interface MockupRow {
  id: string;
  url: string;
  fileName: string | null;
  note: string;
  createdAt: Date;
  uploadedBy?: { name: string | null } | null;
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
  };
}

/**
 * These end up as an `href` on a button someone clicks mid-call, so anything
 * that isn't a real web link is refused at the door rather than rendered as
 * a dead — or hostile — button. A bare "www.figma.com/..." is the one thing
 * worth rescuing: it's what a paste from the address bar looks like.
 */
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
