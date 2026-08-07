import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Who the call sheet stops asking you to ring, and when it starts again.
 *
 * The complaint that produced this: a lead was rung, a mockup was requested,
 * and the sheet went on listing them every morning as somebody to call. There
 * is nothing to say to a person waiting on work that isn't finished — ringing
 * them anyway is how a warm lead gets talked back out of interest. And the
 * moment the mockup does go out, that same lead becomes the single best call
 * on the page and used to be buried under whatever date was booked before the
 * mockup existed.
 *
 * So: held back while it is being built, top of the sheet once it is sent,
 * and off that band again the moment somebody actually rings.
 */

const prisma = {
  user: { findUnique: vi.fn(async () => ({ googleRefreshToken: 'x', gmailNeedsReconnect: false })) },
  lead: { count: vi.fn(async () => 0), findMany: vi.fn() },
  leadActivity: {
    count: vi.fn(async () => 0),
    findMany: vi.fn(async (_a: unknown) => [] as { leadId: string; createdAt: Date; createdById: string | null; createdBy: { name: string } | null }[]),
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
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW - ms);

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
  // Never emailed, so every lead here starts plainly callable and the band
  // each test lands in is the one that test put it in — an emailed-and-never-
  // opened lead is held back for its own separate reason.
  coldEmailSentAt: null,
  coldEmailOpens: 0,
  coldEmailOpenedAt: null,
  coldEmailLastOpenedAt: null,
  industry: 'Roofing',
  region: 'NC',
  salesNote: null,
  updatedAt: ago(DAY),
  mockupRequested: false,
  mockupRequestedAt: null,
  mockupSentManuallyAt: null,
  mockupFolderUrl: null,
  mockupUrl: null,
  mockups: [] as { sentAt: Date }[],
  assignedTo: null,
  activities: [],
  _count: { activities: 0 },
  ...over,
});

const call = async () =>
  (await GET(new Request('https://x/api/admin/leads/call-list') as never)).json();
const names = (rows: { company: string }[]) => rows.map((r) => r.company);

beforeEach(() => {
  n = 0;
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ googleRefreshToken: 'x', gmailNeedsReconnect: false });
  prisma.lead.count.mockResolvedValue(0);
  prisma.leadActivity.count.mockResolvedValue(0);
  prisma.leadActivity.findMany.mockResolvedValue([]);
});

describe('a lead waiting on a mockup', () => {
  it('comes off the call sheet entirely', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({ company: 'Waiting', mockupRequested: true, mockupRequestedAt: ago(DAY) }),
      lead({ company: 'Ordinary' }),
    ]);

    const { callable, breakdown, awaitingMockup } = await call();

    expect(names(callable)).toEqual(['Ordinary']);
    expect(breakdown['awaiting-mockup']).toBe(1);
    // Counted out loud. A sheet that quietly holds twelve leads back is a
    // sheet nobody believes when it looks empty.
    expect(awaitingMockup).toBe(1);
  });

  /**
   * The three signals that normally mean "ring them today", all overruled.
   *
   * Each is a genuine reason to call in every other case, which is exactly
   * why this has to be tested: the branch is only correct because it is
   * checked before all three.
   */
  it('stays off it even while opening the email, bouncing, or overdue', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({
        company: 'Reading It',
        mockupRequested: true,
        mockupRequestedAt: ago(DAY),
        coldEmailSentAt: ago(5 * DAY),
        coldEmailOpens: 6,
        coldEmailOpenedAt: ago(2 * DAY),
        coldEmailLastOpenedAt: ago(HOUR),
      }),
      lead({ company: 'Bounced', mockupRequested: true, mockupRequestedAt: ago(DAY), emailDeliveryFailedAt: ago(DAY) }),
      lead({ company: 'Overdue', mockupRequested: true, mockupRequestedAt: ago(DAY), nextFollowUpAt: ago(3 * DAY) }),
    ]);

    const { callable, breakdown } = await call();

    expect(callable).toHaveLength(0);
    expect(breakdown['awaiting-mockup']).toBe(3);
  });

  /** A lead who has written to us is not waiting quietly any more. */
  it('is callable again the moment they write back', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({ company: 'Wrote Back', mockupRequested: true, mockupRequestedAt: ago(DAY), replyReceivedAt: ago(HOUR) }),
    ]);

    const { callable } = await call();

    expect(callable[0].reason).toBe('replied');
  });
});

describe('a lead the mockup has gone out to', () => {
  it('goes to the top of the sheet', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({ company: 'Overdue', nextFollowUpAt: ago(3 * DAY) }),
      lead({
        company: 'Has The Mockup',
        mockupRequested: true,
        mockups: [{ sentAt: ago(HOUR) }],
      }),
    ]);

    const { callable } = await call();

    expect(names(callable)).toEqual(['Has The Mockup', 'Overdue']);
    expect(callable[0].reason).toBe('mockup-sent');
  });

  /**
   * The date in the diary was chosen during a call that happened before the
   * mockup existed, so it is a plan made without the one fact that matters.
   * Sitting on it wastes the two days the thing is still on their desk.
   */
  it('outranks the follow-up date booked before it was sent', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({
        company: 'Booked For Thursday',
        mockupRequested: true,
        mockups: [{ sentAt: ago(HOUR) }],
        nextFollowUpAt: new Date(NOW + 4 * DAY),
      }),
    ]);

    const { callable } = await call();

    expect(callable[0].reason).toBe('mockup-sent');
  });

  /** Delivered by hand is delivered. The work reached them either way. */
  it('counts a hand-delivered mockup the same as a tracked send', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({ company: 'By Hand', mockupRequested: true, mockupSentManuallyAt: ago(HOUR) }),
    ]);

    expect((await call()).callable[0].reason).toBe('mockup-sent');
  });

  /**
   * The half that stops this being a band which never empties. Without it the
   * same twelve names sit at the top every morning long after the
   * conversation happened, and a permanent alert is one nobody reads.
   */
  it('drops out of the band once somebody has rung', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({ company: 'Already Rung', mockupRequested: true, mockups: [{ sentAt: ago(2 * DAY) }] }),
    ]);
    prisma.leadActivity.findMany.mockResolvedValue([
      { leadId: 'lead_1', createdAt: ago(HOUR), createdById: 'user_1', createdBy: { name: 'Evan' } },
    ]);

    expect((await call()).callable[0].reason).not.toBe('mockup-sent');
  });

  /**
   * A call from before the mockup went out is not a call about the mockup.
   * It is the call that produced it.
   */
  it('stays in the band when the only call predates the send', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({ company: 'Rung First', mockupRequested: true, mockups: [{ sentAt: ago(HOUR) }] }),
    ]);
    prisma.leadActivity.findMany.mockResolvedValue([
      { leadId: 'lead_1', createdAt: ago(3 * DAY), createdById: 'user_1', createdBy: { name: 'Evan' } },
    ]);

    expect((await call()).callable[0].reason).toBe('mockup-sent');
  });

  /**
   * A preview deployment is a password-protected subdomain we look at. It is
   * not something anybody has been given, and ringing to ask what they
   * thought of it is the exact embarrassment the distinction prevents.
   */
  it('does not count a mockup that was only ever built', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({ company: 'Built Not Sent', mockupRequested: true, mockupRequestedAt: ago(DAY), mockups: [] }),
    ]);

    expect((await call()).callable).toHaveLength(0);
  });
});

/**
 * One sheet for the whole team.
 *
 * A rep used to see only leads assigned to them, which for two people working
 * one book meant the strongest lead of the morning was invisible to whoever
 * happened to be free to ring it — and neither could tell an empty queue from
 * an empty half of one.
 */
describe('whose leads are on it', () => {
  it('never filters by who the lead is assigned to', async () => {
    prisma.lead.findMany.mockResolvedValue([lead({ company: 'Somebody Elses' })]);

    await call();

    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('assignedToId');
    expect(names((await call()).callable)).toContain('Somebody Elses');
  });
});

/**
 * Two people, one sheet, one phone number.
 *
 * Merging the call sheets was right — the strongest lead of the morning
 * should not be invisible to whoever is free to ring it. But it made one
 * failure possible that could not happen before: both of them see the same
 * business at the top and both dial it, eleven minutes apart, in front of the
 * customer. Nothing about good intentions prevents that; only the row saying
 * so does.
 */
describe('who rang this last', () => {
  const rang = (leadId: string, by: { id: string; name: string }, at: Date) => [
    { leadId, createdAt: at, createdById: by.id, createdBy: { name: by.name } },
  ];

  it('names the other person and when', async () => {
    prisma.lead.findMany.mockResolvedValue([lead({ company: 'Ridgeline' })]);
    prisma.leadActivity.findMany.mockResolvedValue(
      rang('lead_1', { id: 'user_evan', name: 'Evan' }, ago(11 * 60 * 1000))
    );

    const { callable } = await call();

    expect(callable[0].lastCall).toMatchObject({ byName: 'Evan', byYou: false });
  });

  /**
   * "You rang this an hour ago" and "Kiana rang this an hour ago" call for
   * completely different behaviour. A row that cannot tell them apart is one
   * you learn to ignore.
   */
  it('says "You" rather than your own name', async () => {
    prisma.lead.findMany.mockResolvedValue([lead()]);
    prisma.leadActivity.findMany.mockResolvedValue(
      rang('lead_1', { id: 'user_1', name: 'Kiana' }, ago(HOUR))
    );

    expect((await call()).callable[0].lastCall).toMatchObject({ byName: 'You', byYou: true });
  });

  it('is null for a business nobody has ever rung', async () => {
    prisma.lead.findMany.mockResolvedValue([lead()]);

    expect((await call()).callable[0].lastCall).toBeNull();
  });

  /** A deleted account should not render as a blank accusation. */
  it('still names someone when the account is gone', async () => {
    prisma.lead.findMany.mockResolvedValue([lead()]);
    prisma.leadActivity.findMany.mockResolvedValue([
      { leadId: 'lead_1', createdAt: ago(HOUR), createdById: null, createdBy: null },
    ]);

    expect((await call()).callable[0].lastCall.byName).toBe('Someone');
  });
});

/**
 * A number that does not get picked up.
 *
 * Four unanswered dials is not persistence. The rep cannot see it unaided,
 * because each morning the lead looks like any other overdue follow-up — so
 * the same dead number gets tried a fifth and sixth time while leads nobody
 * has touched sit further down the page.
 */
describe('a lead rung again and again', () => {
  const tried = (n: number, over: Record<string, unknown> = {}) =>
    lead({ _count: { activities: n }, ...over });

  it('is flagged after four attempts with nobody reached', async () => {
    prisma.lead.findMany.mockResolvedValue([tried(4)]);

    expect((await call()).callable[0].neverReached).toBe(true);
  });

  it('is not flagged while the number is still young', async () => {
    prisma.lead.findMany.mockResolvedValue([tried(3)]);

    expect((await call()).callable[0].neverReached).toBe(false);
  });

  /** Reaching them is the whole point — after that the count means nothing. */
  it('is not flagged once they have written back', async () => {
    prisma.lead.findMany.mockResolvedValue([tried(9, { replyReceivedAt: ago(DAY) })]);

    expect((await call()).callable[0].neverReached).toBe(false);
  });

  it('is not flagged for a lead that got qualified on the phone', async () => {
    prisma.lead.findMany.mockResolvedValue([tried(9, { status: 'qualified' })]);

    expect((await call()).callable[0].neverReached).toBe(false);
  });
});

/**
 * The escape hatch on a promise nobody kept.
 *
 * `awaiting-mockup` takes a lead off the sheet indefinitely, on the
 * undertaking that it comes back the day the mockup is sent. That is right
 * while somebody is building it and catastrophic if nobody ever does: the
 * lead is invisible forever, held back by a promise no one met, which is the
 * exact failure the band was added to prevent wearing a different hat.
 */
describe('a mockup promised and never sent', () => {
  const promised = (daysAgo: number, over: Record<string, unknown> = {}) =>
    lead({ mockupRequested: true, mockupRequestedAt: ago(daysAgo * DAY), ...over });

  it('stays off the sheet while it is still being built', async () => {
    prisma.lead.findMany.mockResolvedValue([promised(2)]);

    const { callable, breakdown } = await call();

    expect(callable).toHaveLength(0);
    expect(breakdown['awaiting-mockup']).toBe(1);
  });

  it('comes back once the promise is five days old', async () => {
    prisma.lead.findMany.mockResolvedValue([promised(6)]);

    const { callable } = await call();

    expect(callable[0].reason).toBe('mockup-stalled');
    expect(callable[0].promisedDaysAgo).toBe(6);
  });

  /** Our own failure, so it outranks every reason to ring that is theirs. */
  it('ranks above an open, a bounce and an overdue date', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead({ company: 'Overdue', nextFollowUpAt: ago(9 * DAY) }),
      lead({
        company: 'Reading It',
        coldEmailSentAt: ago(9 * DAY),
        coldEmailOpens: 5,
        coldEmailOpenedAt: ago(3 * DAY),
        coldEmailLastOpenedAt: ago(HOUR),
      }),
      promised(9, { company: 'Still Waiting' }),
    ]);

    expect(names((await call()).callable)[0]).toBe('Still Waiting');
  });

  /**
   * Two different jobs behind the same silence. "Nobody has started it" needs
   * a designer; "built and sitting there" needs one click. The row cannot say
   * which without both facts.
   */
  it('says whether it is unbuilt or merely unsent', async () => {
    prisma.lead.findMany.mockResolvedValue([
      promised(7, { company: 'Not Started' }),
      promised(7, { company: 'Built', mockupFolderUrl: 'https://drive.example/x' }),
    ]);

    const rows = (await call()).callable;

    expect(rows.find((r: { company: string }) => r.company === 'Not Started').mockupBuiltNotSent).toBe(false);
    expect(rows.find((r: { company: string }) => r.company === 'Built').mockupBuiltNotSent).toBe(true);
  });

  /** Sending it is what the whole band is waiting for. */
  it('stops once the mockup actually goes out', async () => {
    prisma.lead.findMany.mockResolvedValue([
      promised(20, { mockups: [{ sentAt: ago(HOUR) }] }),
    ]);

    expect((await call()).callable[0].reason).toBe('mockup-sent');
  });
});
