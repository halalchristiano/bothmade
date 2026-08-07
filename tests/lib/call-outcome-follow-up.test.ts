import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The second touch, booked by the machine at the moment the call is logged.
 *
 * The reason it is booked here and not on the answer to "did they want a
 * mockup?" is the case nobody plans for: the rep logs the call from the
 * queue's quick buttons, or closes the tab, or never sees the question. If
 * the follow-up depended on somebody answering, those leads would get nothing
 * — and they are the majority. The default has to be the thing that happens
 * anyway; asking for a mockup is what changes it.
 */

const prisma = {
  lead: { findUnique: vi.fn(), update: vi.fn() },
  leadActivity: { create: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ userId: 'user_1' }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));

const { POST } = await import('@/app/api/admin/leads/[leadId]/call-outcome/route');

const DAY = 24 * 60 * 60 * 1000;

const existing = (over: Record<string, unknown> = {}) => ({
  id: 'lead_1',
  status: 'contacted',
  email: 'dana@example.com',
  phone: '+13365550100',
  nextFollowUpAt: null,
  lostReason: null,
  phoneInvalidAt: null,
  doNotContact: false,
  mockupRequested: false,
  autoFollowUpDueAt: null,
  autoFollowUpSentAt: null,
  ...over,
});

const log = async (outcome: string) => {
  const res = await POST(
    new Request('https://x/api', {
      method: 'POST',
      body: JSON.stringify({ outcome }),
      headers: { 'Content-Type': 'application/json' },
    }) as never,
    { params: Promise.resolve({ leadId: 'lead_1' }) }
  );
  return { status: res.status, body: await res.json() };
};

/** What the route asked Prisma to write to the lead. */
const written = () => prisma.$transaction.mock.calls[0][0][1].data;

beforeEach(() => {
  vi.clearAllMocks();
  prisma.lead.findUnique.mockResolvedValue(existing());
  prisma.lead.update.mockImplementation((args: { data: Record<string, unknown> }) => args);
  prisma.leadActivity.create.mockImplementation((args: unknown) => args);
  prisma.$transaction.mockImplementation(async () => [
    { id: 'act_1', createdBy: { id: 'user_1', name: 'Evan' } },
    { id: 'lead_1', autoFollowUpDueAt: new Date(Date.now() + 3 * DAY) },
  ]);
});

describe('booking it', () => {
  it('schedules one three days out when somebody actually spoke', async () => {
    await log('spoke-interested');

    const due = written().autoFollowUpDueAt as Date;
    expect(due).toBeInstanceOf(Date);
    expect(Math.round((due.getTime() - Date.now()) / DAY)).toBe(3);
  });

  /** An unanswered ring must not produce "we spoke the other day". */
  it('books nothing for a call nobody answered', async () => {
    await log('no-answer');

    expect(written().autoFollowUpDueAt).toBeUndefined();
  });

  it('tells the screen to ask about a mockup only when there was a conversation', async () => {
    expect((await log('spoke-interested')).body.askAboutMockup).toBe(true);
    vi.clearAllMocks();
    prisma.lead.findUnique.mockResolvedValue(existing());
    prisma.$transaction.mockResolvedValue([{ id: 'act_1' }, { id: 'lead_1' }]);
    expect((await log('voicemail')).body.askAboutMockup).toBe(false);
  });
});

describe('what stops it being booked', () => {
  it('leaves an existing booking alone rather than pushing it back', async () => {
    const alreadyDue = new Date(Date.now() + DAY);
    prisma.lead.findUnique.mockResolvedValue(existing({ autoFollowUpDueAt: alreadyDue }));

    await log('spoke-interested');

    expect(written().autoFollowUpDueAt).toBeUndefined();
  });

  /** One automated email per lead, ever. A second is a sequence nobody asked for. */
  it('never books a second one for a lead already sent to', async () => {
    prisma.lead.findUnique.mockResolvedValue(existing({ autoFollowUpSentAt: new Date() }));

    await log('spoke-interested');

    expect(written().autoFollowUpDueAt).toBeUndefined();
  });

  it('books nothing for a lead who asked to be left alone', async () => {
    prisma.lead.findUnique.mockResolvedValue(existing({ doNotContact: true }));

    await log('spoke-interested');

    expect(written().autoFollowUpDueAt).toBeUndefined();
  });

  it('books nothing when there is no address to send to', async () => {
    prisma.lead.findUnique.mockResolvedValue(existing({ email: null }));

    await log('spoke-interested');

    expect(written().autoFollowUpDueAt).toBeUndefined();
  });

  /** The mockup email IS the follow-up. Both in one week reads as automated. */
  it('books nothing when a mockup is already on the way', async () => {
    prisma.lead.findUnique.mockResolvedValue(existing({ mockupRequested: true }));

    await log('spoke-interested');

    expect(written().autoFollowUpDueAt).toBeUndefined();
  });
});

describe('cancelling one', () => {
  /**
   * Emailing somebody three days after they said no is how a sender gets
   * reported. A flat no has to reach through and clear a booking made on an
   * earlier call, not merely decline to add one.
   */
  it('clears a pending email when they say no', async () => {
    prisma.lead.findUnique.mockResolvedValue(
      existing({ autoFollowUpDueAt: new Date(Date.now() + DAY) })
    );

    await log('not-interested');

    expect(written().autoFollowUpDueAt).toBeNull();
  });
});

/**
 * Undo has to reach the email too.
 *
 * Logging a call books something that leaves the building three days later.
 * An undo that puts the status and the date back but leaves that booking
 * standing sends "we spoke the other day" about a call that was un-logged —
 * the one part of this undo that reaches a customer, and so the part that
 * matters most to get right.
 */
describe('undoing the call', () => {
  it('puts the booking back exactly as it was', async () => {
    const undo = await import('@/app/api/admin/leads/[leadId]/call-outcome/undo/route');
    prisma.lead.findUnique.mockResolvedValue(existing());
    prisma.lead.update.mockResolvedValue({ id: 'lead_1' });

    await undo.POST(
      new Request('https://x/api', {
        method: 'POST',
        body: JSON.stringify({ previous: { status: 'new', autoFollowUpDueAt: null } }),
        headers: { 'Content-Type': 'application/json' },
      }) as never,
      { params: Promise.resolve({ leadId: 'lead_1' }) }
    );

    expect(prisma.lead.update.mock.calls[0][0].data.autoFollowUpDueAt).toBeNull();
  });
});
