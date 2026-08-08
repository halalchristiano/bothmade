import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * Correcting a bounced address.
 *
 * The dead-number flag has always cleared itself: change a lead's phone and
 * `phoneInvalidAt` goes, because a lead whose number has been corrected is
 * callable again and "would otherwise sit in 'can't reach' forever with a
 * number that works". The email half of that rule was never written.
 *
 * So a rep read "The email bounced back — this address doesn't work", found
 * the right address, typed it in, saved — and the flag stayed. Which means:
 *
 *  - the call queue kept the lead in its "bounced" band, ahead of whatever
 *    its real reason was, because that branch is checked before overdue and
 *    scheduled; and
 *  - the automatic follow-up cron skips any lead with the flag set, so
 *    fixing the address had quietly switched the sequence off for them.
 *
 * Neither announces itself. The lead simply stops being emailed and starts
 * reading as unreachable, on the strength of an address that works.
 */

const prisma = {
  lead: { findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  leadMockup: { findMany: vi.fn() },
  user: { findFirst: vi.fn(), findMany: vi.fn() },
  teamMessage: { create: vi.fn() },
};

const requireStaff = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  requireOwner: () => requireStaff(),
  canOverridePricing: () => true,
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));
vi.mock('@/lib/playbook-seed', () => ({ ensurePlaybookSeeded: vi.fn(async () => {}) }));
vi.mock('@/lib/notify', () => ({ findDesigner: vi.fn(async () => null) }));
vi.mock('@/lib/mailer', () => ({ sendAsUser: vi.fn(async () => ({ sent: true })) }));
vi.mock('@/lib/email', () => ({ mockupRequestEmail: vi.fn(() => ({ subject: '', html: '' })) }));

const { PATCH } = await import('@/app/api/admin/leads/[leadId]/route');

const EXISTING = {
  id: 'lead_1',
  company: 'Brandon Roofing',
  status: 'contacted',
  email: 'ben@acme.test',
  phone: '+15550001111',
  emailDeliveryFailedAt: new Date('2026-07-01T00:00:00Z'),
  emailDeliveryFailedReason: "The email bounced back — this address doesn't work. Call them instead.",
  wonAt: null,
  lostAt: null,
  clientTakenOnAt: null,
  qualifiedAt: null,
  mockupRequested: false,
  mockupUrl: null,
  contractStatus: 'not_sent',
  qualNeed: null,
  qualAuthority: null,
  qualBudget: null,
  qualTiming: null,
  qualMotivation: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  requireStaff.mockResolvedValue({ userId: 'user_1', role: 'owner' });
  prisma.lead.findUnique.mockResolvedValue(EXISTING);
  prisma.lead.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...EXISTING,
    ...data,
    mockups: [],
  }));
  prisma.leadMockup.findMany.mockResolvedValue([]);
  prisma.user.findFirst.mockResolvedValue(null);
  prisma.user.findMany.mockResolvedValue([]);
});

const save = (body: Record<string, unknown>) =>
  PATCH(
    { json: async () => body } as unknown as NextRequest,
    { params: Promise.resolve({ leadId: 'lead_1' }) }
  );

/** What the handler asked Prisma to write. */
const written = () => prisma.lead.update.mock.calls[0][0].data as Record<string, unknown>;

describe('a corrected address', () => {
  it('clears the bounce, the way a corrected phone number clears its flag', async () => {
    await save({ email: 'ben@acme-roofing.test' });

    expect(written().emailDeliveryFailedAt).toBeNull();
    expect(written().emailDeliveryFailedReason).toBeNull();
  });

  it('clears it when the address is removed, since there is nothing left to bounce', async () => {
    await save({ email: '' });

    expect(written().emailDeliveryFailedAt).toBeNull();
  });
});

describe('a save that is not a correction', () => {
  /**
   * Re-saving the same address must not clear a real bounce — otherwise
   * opening a lead, changing its note and pressing save silently marks a dead
   * address as working and puts it back in the sequence.
   */
  it('leaves the bounce alone when the address is unchanged', async () => {
    await save({ email: 'ben@acme.test', notes: 'Rang, no answer' });

    expect(written().emailDeliveryFailedAt).toBeUndefined();
    expect(written().emailDeliveryFailedReason).toBeUndefined();
  });

  /** Case and surrounding space change nothing about where an email lands. */
  it('is not fooled by capitalisation or stray whitespace', async () => {
    await save({ email: '  Ben@Acme.TEST ' });

    expect(written().emailDeliveryFailedAt).toBeUndefined();
  });

  it('leaves it alone when the save does not mention email at all', async () => {
    await save({ notes: 'Left a voicemail' });

    expect(written().emailDeliveryFailedAt).toBeUndefined();
  });
});

describe('marking it resolved by hand', () => {
  /**
   * The other case, and why the explicit flag stays: the address was right
   * all along and their mailbox was full. Nothing to correct, so nothing
   * about the address changes.
   */
  it('still clears the flag without touching the address', async () => {
    await save({ clearEmailFailure: true });

    expect(written().emailDeliveryFailedAt).toBeNull();
    expect(written().email).toBeUndefined();
  });
});
