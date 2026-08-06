import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

/**
 * Attaching a mockup is the moment a deal stops waiting on design, so it
 * carries more than an insert: the lead's cached "latest mockup" moves, the
 * urgent request in team chat gets resolved, and the team is told. These
 * tests pin that sequence — and the two ways it used to go wrong: a second
 * version overwriting the first, and one paste landing twice.
 */

const mockupFindMany = vi.fn();
const mockupCreate = vi.fn();
const leadUpdate = vi.fn();
const teamMessageUpdateMany = vi.fn();
const teamMessageCreate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    leadMockup: {
      findMany: (...args: unknown[]) => mockupFindMany(...args),
      create: (...args: unknown[]) => mockupCreate(...args),
    },
    lead: { update: (...args: unknown[]) => leadUpdate(...args) },
    teamMessage: {
      updateMany: (...args: unknown[]) => teamMessageUpdateMany(...args),
      create: (...args: unknown[]) => teamMessageCreate(...args),
    },
  },
}));

const {
  normalizeMockupUrl,
  recordLeadMockup,
  MOCKUP_LINK_DAYS,
  isMockupStatus,
  mockupExpiryFrom,
  mockupLinkExpired,
  mockupSignal,
  MOCKUPS_TO_BUILD_WHERE,
} = await import('@/lib/mockups');
type LeadMockupDTO = import('@/lib/mockups').LeadMockupDTO;

const CREATED_AT = new Date('2026-08-02T14:14:00.000Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mk_1',
    url: 'https://figma.test/v1',
    fileName: null,
    note: '',
    createdAt: CREATED_AT,
    uploadedBy: { name: 'Kiana' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockupFindMany.mockResolvedValue([]);
  mockupCreate.mockResolvedValue(row());
  leadUpdate.mockResolvedValue({ id: 'lead_1', company: 'Duran Roofing' });
  teamMessageUpdateMany.mockResolvedValue({ count: 1 });
  teamMessageCreate.mockResolvedValue({ id: 'msg_1' });
});

describe('what counts as a mockup link', () => {
  it('takes an ordinary web link', () => {
    expect(normalizeMockupUrl('https://figma.test/v1')).toBe('https://figma.test/v1');
    expect(normalizeMockupUrl('  http://staging.test/v1  ')).toBe('http://staging.test/v1');
  });

  it('rescues a bare address-bar paste', () => {
    expect(normalizeMockupUrl('www.figma.test/v1')).toBe('https://www.figma.test/v1');
  });

  it('refuses anything that would render as a dead or hostile button', () => {
    expect(normalizeMockupUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeMockupUrl('ask kiana for it')).toBeNull();
    expect(normalizeMockupUrl('   ')).toBeNull();
    expect(normalizeMockupUrl(undefined)).toBeNull();
    expect(normalizeMockupUrl(42)).toBeNull();
  });
});

describe('attaching the first mockup', () => {
  it('numbers it one, caches it on the lead, and clears the urgent request', async () => {
    const result = await recordLeadMockup({
      leadId: 'lead_1',
      url: 'https://figma.test/v1',
      userId: 'user_evan',
    });

    expect(result.index).toBe(1);
    expect(result.alreadyAttached).toBe(false);
    expect(leadUpdate).toHaveBeenCalledWith({
      where: { id: 'lead_1' },
      data: { mockupUrl: 'https://figma.test/v1', mockupDeliveredAt: CREATED_AT },
    });
    expect(teamMessageUpdateMany).toHaveBeenCalledWith({
      where: { relatedLeadId: 'lead_1', urgent: true, resolved: false },
      data: { resolved: true },
    });
    expect(teamMessageCreate.mock.calls[0]![0].data.content).toBe(
      '✅ Mockup ready for Duran Roofing: https://figma.test/v1'
    );
  });

  it('hands back the version with who uploaded it and when', async () => {
    const { mockup } = await recordLeadMockup({
      leadId: 'lead_1',
      url: 'https://figma.test/v1',
      userId: 'user_evan',
    });

    expect(mockup).toMatchObject({
      id: 'mk_1',
      url: 'https://figma.test/v1',
      fileName: null,
      note: '',
      uploadedAt: CREATED_AT.toISOString(),
      uploadedByName: 'Kiana',
      // Freshly attached, so it exists but has not been offered to anyone.
      status: 'draft',
      viewCount: 0,
      sentAt: null,
    });
  });
});

describe('attaching a later version', () => {
  beforeEach(() => {
    mockupFindMany.mockResolvedValue([row()]);
    mockupCreate.mockResolvedValue(row({ id: 'mk_2', url: 'https://figma.test/v2' }));
  });

  it('keeps the first one and numbers this one two', async () => {
    const result = await recordLeadMockup({
      leadId: 'lead_1',
      url: 'https://figma.test/v2',
      userId: 'user_evan',
    });

    expect(result.index).toBe(2);
    expect(mockupCreate).toHaveBeenCalledOnce();
    expect(teamMessageCreate.mock.calls[0]![0].data.content).toBe(
      '✅ Mockup 2 added for Duran Roofing: https://figma.test/v2'
    );
  });

  it('moves the lead’s cached link to the newest version', async () => {
    await recordLeadMockup({ leadId: 'lead_1', url: 'https://figma.test/v2', userId: 'user_evan' });

    expect(leadUpdate.mock.calls[0]![0].data.mockupUrl).toBe('https://figma.test/v2');
  });

  it('does not re-resolve an urgent request that version one already answered', async () => {
    await recordLeadMockup({ leadId: 'lead_1', url: 'https://figma.test/v2', userId: 'user_evan' });

    expect(teamMessageUpdateMany).not.toHaveBeenCalled();
  });
});

describe('the same link arriving twice', () => {
  it('returns the version it already is instead of duplicating it', async () => {
    mockupFindMany.mockResolvedValue([row(), row({ id: 'mk_2', url: 'https://figma.test/v2' })]);

    const result = await recordLeadMockup({
      leadId: 'lead_1',
      url: 'https://figma.test/v2',
      userId: 'user_evan',
    });

    expect(result.alreadyAttached).toBe(true);
    expect(result.index).toBe(2);
    expect(result.mockup.id).toBe('mk_2');
    expect(mockupCreate).not.toHaveBeenCalled();
    expect(teamMessageCreate).not.toHaveBeenCalled();
    // Re-posting the same link must not re-date the delivery either.
    expect(leadUpdate).not.toHaveBeenCalled();
  });
});

/**
 * The tracking layer. The point of it is that a rep opens a call already
 * knowing whether the client looked at the thing — so the one line of text
 * they read has to be right.
 */
const BASE: LeadMockupDTO = {
  id: 'm1',
  url: 'https://preview.bothmade.studio/northgate',
  fileName: null,
  note: '',
  uploadedAt: '2026-08-01T09:00:00Z',
  uploadedByName: 'Kiana',
  status: 'draft',
  shareToken: 'tok',
  sendFailedAt: null,
  sendFailedReason: null,
  sentAt: null,
  firstViewedAt: null,
  lastViewedAt: null,
  viewCount: 0,
  expiresAt: null,
  expired: false,
  respondedAt: null,
  responseNote: null,
};

const NOW = new Date('2026-08-10T12:00:00Z');

describe('the one line a rep reads', () => {
  it('says so plainly when nothing has been sent', () => {
    expect(mockupSignal(BASE, NOW)).toBe('Not sent to the client yet');
  });

  it('distinguishes sent-and-ignored from sent-today', () => {
    expect(
      mockupSignal({ ...BASE, status: 'sent', sentAt: '2026-08-04T09:00:00Z' }, NOW)
    ).toBe('Sent 6d ago, never opened');
    expect(
      mockupSignal({ ...BASE, status: 'sent', sentAt: '2026-08-10T09:00:00Z' }, NOW)
    ).toBe('Sent today, not opened yet');
  });

  /** The reason any of this exists: a lead that just opened it is a call to make now. */
  it('leads with the view count and how fresh it is', () => {
    expect(
      mockupSignal(
        { ...BASE, status: 'viewed', sentAt: '2026-08-08T09:00:00Z', viewCount: 4, lastViewedAt: '2026-08-10T10:00:00Z' },
        NOW
      )
    ).toBe('Opened 4 times, last 2h ago');
  });

  it('singularises a single view', () => {
    expect(
      mockupSignal({ ...BASE, status: 'viewed', viewCount: 1, lastViewedAt: '2026-08-10T11:30:00Z' }, NOW)
    ).toBe('Opened 1 time, last just now');
  });

  it('puts a verdict above everything else', () => {
    expect(mockupSignal({ ...BASE, status: 'approved', viewCount: 9 }, NOW)).toBe('Approved by the client');
    expect(mockupSignal({ ...BASE, status: 'changes_requested', viewCount: 9 }, NOW)).toBe(
      'They asked for changes'
    );
  });

  it('tells the rep an expired link is why nothing is happening', () => {
    expect(mockupSignal({ ...BASE, status: 'sent', expired: true, sentAt: '2026-06-01T09:00:00Z' }, NOW)).toBe(
      'Link expired — re-send to reopen it'
    );
  });

  /**
   * The row is stamped sent *before* the send goes out — it has to be, or the
   * tracked link 404s on a client who was mailed it. That made a failed send
   * read exactly like a delivered one: "Sent today, not opened yet", on a
   * client who had never been written to. A rep reading that waits, then
   * chases somebody who never heard from us, while the fix is one click.
   */
  it('says the email failed, on a row that is stamped as sent', () => {
    const failed = {
      ...BASE,
      status: 'sent' as const,
      sentAt: '2026-08-10T09:00:00Z',
      sendFailedAt: '2026-08-10T09:00:01Z',
    };

    expect(mockupSignal(failed, NOW)).toMatch(/failed to send/i);
    expect(mockupSignal(failed, NOW)).not.toMatch(/not opened/i);
  });

  it('says it whatever the row otherwise looks like', () => {
    for (const extra of [
      { status: 'sent' as const, expired: true },
      { status: 'sent' as const, sentAt: '2026-06-01T09:00:00Z' },
    ]) {
      expect(
        mockupSignal({ ...BASE, ...extra, sendFailedAt: '2026-08-10T09:00:01Z' }, NOW)
      ).toMatch(/failed to send/i);
    }
  });

  /**
   * Except what the client themselves said. An approval is the most valuable
   * thing this table holds, and a stale failure from an earlier send must
   * never be shown over it.
   */
  it('never talks over something the client has actually said', () => {
    expect(
      mockupSignal({ ...BASE, status: 'approved', sendFailedAt: '2026-08-01T09:00:00Z' }, NOW)
    ).toBe('Approved by the client');
    expect(
      mockupSignal({ ...BASE, status: 'changes_requested', sendFailedAt: '2026-08-01T09:00:00Z' }, NOW)
    ).toBe('They asked for changes');
  });
});

describe('link expiry', () => {
  it('runs from the send, not from when it was built', () => {
    const sent = new Date('2026-08-01T09:00:00Z');
    const expires = mockupExpiryFrom(sent);
    expect(Math.round((expires.getTime() - sent.getTime()) / 86_400_000)).toBe(MOCKUP_LINK_DAYS);
  });

  it('treats a mockup with no expiry as live, not as expired', () => {
    // An unsent mockup has nothing to expire, and defaulting it to expired
    // would hide work that was never offered.
    expect(mockupLinkExpired({ expiresAt: null }, NOW)).toBe(false);
  });

  it('expires on the boundary rather than a moment after it', () => {
    expect(mockupLinkExpired({ expiresAt: NOW }, NOW)).toBe(true);
  });
});

describe('statuses', () => {
  it('accepts only the five that exist', () => {
    for (const s of ['draft', 'sent', 'viewed', 'approved', 'changes_requested']) {
      expect(isMockupStatus(s)).toBe(true);
    }
    for (const s of ['SENT', 'opened', '', null, undefined, 7]) {
      expect(isMockupStatus(s)).toBe(false);
    }
  });
});

/**
 * The two writes around a send, and the one rule between them: a mockup can
 * never be showing a failure and a success at the same time. Somebody reading
 * the card has to be able to trust which of the two it is.
 */
describe('recording what happened to a send', () => {
  it('clears an earlier failure when a re-send is stamped', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'm1' });
    vi.doMock('@/lib/prisma', () => ({
      prisma: {
        leadMockup: { findUnique: vi.fn().mockResolvedValue({ status: 'sent' }), update },
      },
    }));
    vi.resetModules();
    const { markMockupSent } = await import('@/lib/mockups');

    await markMockupSent('m1', new Date('2026-08-11T09:00:00Z'));

    // Cleared on the stamp, not on the success: the stamp runs before every
    // send, so a re-send that works must not leave last time's failure up.
    expect(update.mock.calls[0][0].data).toMatchObject({
      sendFailedAt: null,
      sendFailedReason: null,
    });
    vi.doUnmock('@/lib/prisma');
    vi.resetModules();
  });

  it('writes the provider’s own words, so the reason names the fix', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'm1' });
    vi.doMock('@/lib/prisma', () => ({ prisma: { leadMockup: { update } } }));
    vi.resetModules();
    const { markMockupSendFailed } = await import('@/lib/mockups');

    await markMockupSendFailed('m1', 'The mail provider refused it: domain is not verified');

    expect(update.mock.calls[0][0].data.sendFailedReason).toContain('domain is not verified');
    expect(update.mock.calls[0][0].data.sendFailedAt).toBeInstanceOf(Date);
    vi.doUnmock('@/lib/prisma');
    vi.resetModules();
  });

  /** Losing the note about a failure must not also lose the send's response. */
  it('survives the database refusing the write', async () => {
    vi.doMock('@/lib/prisma', () => ({
      prisma: { leadMockup: { update: vi.fn().mockRejectedValue(new Error('gone')) } },
    }));
    vi.resetModules();
    const { markMockupSendFailed } = await import('@/lib/mockups');

    await expect(markMockupSendFailed('m1', 'nope')).resolves.toBeNull();
    vi.doUnmock('@/lib/prisma');
    vi.resetModules();
  });
});

/**
 * One definition of "still to build", read by three screens.
 *
 * The dashboard's Deliver lane said "1 mockup to build" while the Mockups
 * page it links to listed several. Two of the three counters required
 * `mockupUrl: null`, which silently excluded every lead that already has a
 * preview deployment standing but no client folder — work very much still to
 * do, and exactly what the Mockups page shows. A number that disagrees with
 * itself across three screens is a number people stop trusting on all three.
 */
describe('what counts as still to build', () => {
  it('is the absence of a client folder, not the absence of a preview', () => {
    expect(MOCKUPS_TO_BUILD_WHERE).toEqual({
      mockupFolderUrl: null,
      // Work already delivered by hand is finished, not outstanding.
      mockupSentManuallyAt: null,
      OR: [{ mockupRequested: true }, { mockupUrl: { not: null } }],
    });
  });

  /**
   * The preview deployment is a password-protected subdomain we look at. It
   * is not something anybody has been given, so having one is not "built" —
   * and requiring it to be absent is what made the counts disagree.
   */
  it('does not exclude a lead that already has a preview standing', () => {
    expect(JSON.stringify(MOCKUPS_TO_BUILD_WHERE)).not.toContain('"mockupUrl":null');
  });

  it('is the same object every screen reads, not a copy per screen', async () => {
    const [queue, today, ops] = await Promise.all([
      readFile('app/api/admin/leads/mockup-queue/route.ts', 'utf8'),
      readFile('app/api/admin/today/route.ts', 'utf8'),
      readFile('app/api/admin/ops-stats/route.ts', 'utf8'),
    ]);

    for (const [name, source] of [
      ['the Mockups page', queue],
      ["the dashboard's Deliver lane", today],
      ['the ops stats', ops],
    ] as const) {
      expect(source, `${name} should count with MOCKUPS_TO_BUILD_WHERE`).toContain(
        'MOCKUPS_TO_BUILD_WHERE'
      );
      // The shape that caused the disagreement, in any of its spellings.
      expect(source, `${name} still has its own idea of "to build"`).not.toMatch(
        /mockupRequested:\s*true,\s*mockupUrl:\s*null/
      );
    }
  });
});

/**
 * Delivered, just not through here.
 *
 * The send button mails the folder on a tracked link, and the email it writes
 * says the mockup is "a working preview, not a picture of one". True almost
 * every time; once it was not, so the right call was a written email and the
 * button was deliberately not pressed — which left finished work sitting on
 * the build queue as outstanding forever, because the only thing that could
 * clear it was the button that should not have been used.
 */
describe('a mockup sent by hand', () => {
  it('comes off the build queue', () => {
    expect(MOCKUPS_TO_BUILD_WHERE).toMatchObject({ mockupSentManuallyAt: null });
  });

  /**
   * It is a third state, not a synonym for either of the other two. The queue
   * has to be able to tell "still to do" from "done, elsewhere" — and from
   * "done, here", which is the only one with a tracked link behind it.
   */
  it('is still only excluded on the folder being absent, not instead of it', () => {
    expect(MOCKUPS_TO_BUILD_WHERE).toMatchObject({
      mockupFolderUrl: null,
      mockupSentManuallyAt: null,
    });
    expect(MOCKUPS_TO_BUILD_WHERE.OR).toEqual([
      { mockupRequested: true },
      { mockupUrl: { not: null } },
    ]);
  });
});

/**
 * What the mockup email is allowed to claim.
 *
 * The standard wording says the mockup is "a working preview, not a picture
 * of one". True almost every time, and once it was not — so the send button
 * was correctly not pressed, the client got a hand-written email, and the
 * lead sat on the build queue as outstanding work forever. A claim the email
 * cannot always make has to be a choice, not a reason to abandon the tracked
 * send.
 */
describe('what the mockup email says it is', () => {
  it('promises a clickable build only when that is what was made', async () => {
    const { mockupEmailBody } = await import('@/lib/email');
    const base = { contactName: 'Dana Cole', company: 'Havis' };

    const preview = mockupEmailBody({ ...base, kind: 'preview' });
    expect(preview).toContain('not a picture of one');
    expect(preview).toContain('click around');
  });

  /** The exact sentence that was wrong for Havis must be absent. */
  it('claims nothing clickable when it is designs to look at', async () => {
    const { mockupEmailBody } = await import('@/lib/email');

    const visuals = mockupEmailBody({ contactName: 'Dana Cole', company: 'Havis', kind: 'visuals' });

    expect(visuals).not.toContain('not a picture of one');
    expect(visuals).not.toContain('working preview');
    expect(visuals).not.toMatch(/click around/i);
    expect(visuals).toMatch(/designed something/i);
  });

  /** Left unsaid, it is the usual case — no existing caller changes behaviour. */
  it('is a working preview unless somebody says otherwise', async () => {
    const { mockupEmailBody } = await import('@/lib/email');

    expect(mockupEmailBody({ contactName: null, company: 'Havis' })).toContain(
      'not a picture of one'
    );
  });

  /** The subject and the button carry the same claim as the body. */
  it('does not head an email about designs with "we built something"', async () => {
    const { sendMockupEmail } = await import('@/lib/email');
    const { composeOnly } = await import('@/lib/email-preview');

    const [mail] = await composeOnly(() =>
      sendMockupEmail({
        toEmail: 'dana@havis.example',
        contactName: 'Dana Cole',
        company: 'Havis',
        viewUrl: 'https://bothmade.studio/m/tok',
        kind: 'visuals',
      })
    );

    expect(mail.subject).not.toMatch(/we built/i);
    expect(mail.subject).toMatch(/designed/i);
    expect(mail.html).toContain('See the designs');
    expect(mail.html).not.toContain('Open the mockup');
  });

  it('offers both, each saying what it means', async () => {
    const { MOCKUP_KINDS } = await import('@/lib/mockup-kinds');

    expect(MOCKUP_KINDS.map((k) => k.value)).toEqual(['preview', 'visuals']);
    for (const kind of MOCKUP_KINDS) expect(kind.hint.length).toBeGreaterThan(20);
  });
});
