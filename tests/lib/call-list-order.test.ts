import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Where an opened lead actually lands in the queue.
 *
 * The bands were tested in isolation and the ordering was not, so the two
 * drifted apart in the way that matters most: a lead with three opens was
 * banded `delivered`, fell past the `opened` branch, and came out under
 * "Contacted, but nothing booked" — rank five, below a follow-up somebody
 * booked last week. It still wore its "3x" badge on the row, hundreds of rows
 * down the page, which is how it was spotted.
 *
 * This tests the route's real output, because that is the thing that was
 * wrong. Any open outranks every follow-up band; inside the opened band the
 * order is the strength of the evidence.
 */

const prisma = {
  user: { findUnique: vi.fn(async () => ({ role: 'admin', googleRefreshToken: 'x', gmailNeedsReconnect: false })) },
  lead: { count: vi.fn(async () => 0), findMany: vi.fn() },
  leadActivity: {
    count: vi.fn(async () => 0),
    findMany: vi.fn(
      async (_a: unknown) =>
        [] as {
          leadId: string;
          createdAt: Date;
          createdById: string | null;
          createdBy: { name: string } | null;
        }[]
    ),
    groupBy: vi.fn(async (_a: unknown) => [] as { leadId: string; _count: { _all: number } }[]),
  },
};

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ userId: 'user_1' }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));
vi.mock('@/lib/gmail-oauth', () => ({ isGoogleOAuthConfigured: () => true }));

const { GET } = await import('@/app/api/admin/leads/call-list/route');

const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let n = 0;
const lead = (over: Record<string, unknown> = {}) => ({
  id: `lead_${++n}`,
  company: `Business ${n}`,
  contactName: null,
  phone: '+13365550100',
  email: 'x@example.com',
  status: 'contacted',
  hotLead: false,
  estimatedValue: 500000,
  nextFollowUpAt: null,
  emailDeliveryFailedAt: null,
  phoneInvalidAt: null,
  replyReceivedAt: null,
  emailDeliveryFailedReason: null,
  coldEmailSentAt: ago(2 * DAY),
  coldEmailOpens: 0,
  coldEmailOpenedAt: null,
  coldEmailLastOpenedAt: null,
  industry: 'Roofing',
  region: 'NC',
  salesNote: null,
  updatedAt: ago(DAY),
  mockupRequested: false,
  mockupSentManuallyAt: null,
  mockups: [],
  assignedTo: null,
  activities: [],
  _count: { activities: 0 },
  ...over,
});

/** Opened `count` times, first fetch well clear of the delivery window. */
const opened = (count: number, over: Record<string, unknown> = {}) =>
  lead({
    coldEmailOpens: count,
    coldEmailOpenedAt: ago(2 * DAY - HOUR),
    coldEmailLastOpenedAt: ago(HOUR),
    ...over,
  });

const call = async () =>
  (await GET(new Request('https://x/api/admin/leads/call-list') as never)).json();

beforeEach(() => {
  n = 0;
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({
    role: 'admin',
    googleRefreshToken: 'x',
    gmailNeedsReconnect: false,
  });
  prisma.lead.count.mockResolvedValue(0);
  prisma.leadActivity.count.mockResolvedValue(0);
  prisma.leadActivity.findMany.mockResolvedValue([]);
  prisma.leadActivity.groupBy.mockResolvedValue([]);
});

describe('an opened lead against the follow-up bands', () => {
  it('outranks an overdue follow-up on a single open', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({ company: 'Overdue', nextFollowUpAt: ago(3 * DAY) }),
      opened(1, { company: 'Opened Once' }),
    ]);

    const { callable } = await call();

    expect(callable.map((r: { company: string }) => r.company)).toEqual(['Opened Once', 'Overdue']);
    expect(callable[0].reason).toBe('opened');
  });

  /** The exact shape of the bug: three opens, filed under "nothing booked". */
  it('never leaves an opened lead in the contacted-nothing-booked band', async () => {
    prisma.lead.findMany.mockResolvedValue([opened(3, { company: 'Reading It' })]);

    const { callable } = await call();

    expect(callable[0].reason).toBe('opened');
    expect(callable[0].reason).not.toBe('no-follow-up');
  });

  it('puts every open above every lead with none', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({ company: 'Never Opened A' }),
      lead({ company: 'Due Today', nextFollowUpAt: ago(-1 * HOUR) }),
      opened(1, { company: 'One Open' }),
      lead({ company: 'Never Opened B' }),
      opened(1, { company: 'One Open On Arrival', coldEmailOpenedAt: ago(2 * DAY - 1000), coldEmailLastOpenedAt: ago(2 * DAY - 1000) }),
    ]);

    const { callable } = await call();
    const reasons = callable.map((r: { reason: string }) => r.reason);

    expect(reasons.slice(0, 2)).toEqual(['opened', 'opened']);
    expect(reasons.slice(2)).not.toContain('opened');
  });

  it('still puts a reply above everything', async () => {
    prisma.lead.findMany.mockResolvedValue([
      opened(9, { company: 'Very Opened' }),
      lead({ company: 'Wrote Back', replyReceivedAt: ago(HOUR) }),
    ]);

    const { callable } = await call();
    expect(callable[0].company).toBe('Wrote Back');
    expect(callable[1].company).toBe('Very Opened');
  });
});

describe('order inside the opened band', () => {
  it('is most-opened first', async () => {
    prisma.lead.findMany.mockResolvedValue([
      opened(1, { company: 'One' }),
      opened(6, { company: 'Six' }),
      opened(2, { company: 'Two' }),
    ]);

    const { callable } = await call();
    expect(callable.map((r: { company: string }) => r.company)).toEqual(['Six', 'Two', 'One']);
  });

  it('ranks a late single open above a fetch on delivery', async () => {
    prisma.lead.findMany.mockResolvedValue([
      opened(1, {
        company: 'On Arrival',
        coldEmailOpenedAt: ago(2 * DAY - 1000),
        coldEmailLastOpenedAt: ago(2 * DAY - 1000),
      }),
      opened(1, { company: 'Hours Later' }),
    ]);

    const { callable } = await call();
    expect(callable.map((r: { company: string }) => r.company)).toEqual(['Hours Later', 'On Arrival']);
  });
});

describe('the unopened pile', () => {
  it('holds only leads with no opens at all', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({ company: 'Silent' }),
      opened(1, { company: 'One Open' }),
    ]);

    const { noSignal, callable } = await call();

    expect(noSignal.map((r: { company: string }) => r.company)).toEqual(['Silent']);
    expect(callable.map((r: { company: string }) => r.company)).toEqual(['One Open']);
  });

  /** The heading says "nobody has opened it" and must be true of every row. */
  it('never contains a lead that opened the email', async () => {
    prisma.lead.findMany.mockResolvedValue([
      opened(1, { company: 'Opened On Arrival', coldEmailOpenedAt: ago(2 * DAY - 1000), coldEmailLastOpenedAt: ago(2 * DAY - 1000) }),
      opened(4, { company: 'Opened A Lot' }),
    ]);

    const { noSignal } = await call();
    expect(noSignal).toHaveLength(0);
  });
});

describe('opened leads with no number', () => {
  it('are reported separately but still ranked opened', async () => {
    prisma.lead.findMany.mockResolvedValue([
      opened(3, { company: 'No Number', phone: null }),
      lead({ company: 'Has Number, Overdue', nextFollowUpAt: ago(3 * DAY) }),
    ]);

    const { callable, noPhone } = await call();

    expect(noPhone.map((r: { company: string }) => r.company)).toEqual(['No Number']);
    expect(noPhone[0].reason).toBe('opened');
    expect(callable.map((r: { company: string }) => r.company)).toEqual(['Has Number, Overdue']);
  });
});
