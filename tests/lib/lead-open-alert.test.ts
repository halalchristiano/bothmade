import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "They just opened it" — fired once, by the fetch that earns it.
 *
 * Two failure modes matter more than the feature working. One alert per pixel
 * fetch would train everybody to ignore the alerts inside a day, and a mail
 * server's fetch-on-delivery announced as a person reading would send a rep to
 * ring somebody who has never seen the message. Both are pinned below.
 */

const prisma = {
  lead: { findUnique: vi.fn(), updateMany: vi.fn() },
  leadActivity: { create: vi.fn(async () => ({})) },
  user: { findFirst: vi.fn(async () => ({ id: 'user_1' })) },
};
const postSystemMessage = vi.fn(async (_input: unknown) => {});
const sendEmail = vi.fn(async (_input: unknown) => true);

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/team-chat', () => ({ postSystemMessage: (input: unknown) => postSystemMessage(input) }));
vi.mock('@/lib/email', () => ({
  sendEmail: (input: unknown) => sendEmail(input),
  renderShell: (opts: { bodyHtml: string }) => `<html>${opts.bodyHtml}</html>`,
}));
vi.mock('@/lib/site-url', () => ({ resolveSiteUrl: () => 'https://bothmade.studio' }));

const { alertOnFirstRealOpen } = await import('@/lib/lead-open-alert');

const SENT = new Date('2026-08-06T09:00:00.000Z');
const at = (ms: number) => new Date(SENT.getTime() + ms);

const lead = (over: Record<string, unknown> = {}) => ({
  id: 'lead_1',
  company: 'Ridgeline Roofing',
  contactName: 'Dana',
  email: 'office@ridgeline.example',
  phone: '+15125550142',
  estimatedValue: 900000,
  coldEmailSentAt: SENT,
  coldEmailOpens: 2,
  coldEmailOpenedAt: at(40 * 60 * 1000),
  coldEmailLastOpenedAt: at(90 * 60 * 1000),
  coldEmailOpenNotifiedAt: null,
  assignedTo: { id: 'user_1', email: 'evan@bothmade.studio', name: 'Evan' },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.lead.updateMany.mockResolvedValue({ count: 1 });
});

describe('the alert', () => {
  it('emails whoever owns the lead and says how many times', async () => {
    prisma.lead.findUnique.mockResolvedValue(lead());

    const result = await alertOnFirstRealOpen('lead_1');

    expect(result.sent).toBe(true);
    const mail = sendEmail.mock.calls[0][0] as unknown as { to: string; subject: string; html: string };
    expect(mail.to).toBe('evan@bothmade.studio');
    expect(mail.subject).toMatch(/Ridgeline Roofing just opened/i);
    expect(mail.html).toContain('2 times');
    // The one thing the email exists to produce.
    expect(mail.html).toContain('+15125550142');
  });

  it('also drops it into the team thread, marked urgent', async () => {
    prisma.lead.findUnique.mockResolvedValue(lead());

    await alertOnFirstRealOpen('lead_1');

    const posted = postSystemMessage.mock.calls[0][0] as unknown as {
      content: string;
      urgent: boolean;
    };
    expect(posted.urgent).toBe(true);
    expect(posted.content).toContain('Ridgeline Roofing');
  });

  /** The failure that would make every later alert worthless. */
  it('stays silent for a mail server fetching the image on delivery', async () => {
    prisma.lead.findUnique.mockResolvedValue(
      lead({ coldEmailOpens: 1, coldEmailOpenedAt: at(2000), coldEmailLastOpenedAt: at(2000) })
    );

    const result = await alertOnFirstRealOpen('lead_1');

    expect(result.sent).toBe(false);
    expect(result.reason).toMatch(/not a person/i);
    expect(sendEmail).not.toHaveBeenCalled();
    // Nothing claimed, so a later genuine open can still alert.
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });

  it('fires for a single open that arrives too late to be automatic', async () => {
    prisma.lead.findUnique.mockResolvedValue(
      lead({
        coldEmailOpens: 1,
        coldEmailOpenedAt: at(3 * 60 * 60 * 1000),
        coldEmailLastOpenedAt: at(3 * 60 * 60 * 1000),
      })
    );

    expect((await alertOnFirstRealOpen('lead_1')).sent).toBe(true);
  });

  it('does not alert twice for the same send', async () => {
    prisma.lead.findUnique.mockResolvedValue(lead({ coldEmailOpenNotifiedAt: at(60 * 60 * 1000) }));

    const result = await alertOnFirstRealOpen('lead_1');

    expect(result.sent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  /**
   * Two mail clients syncing the same message land here milliseconds apart.
   * The claim is what decides which of them owns the alert, and the loser has
   * to go quiet rather than send a second copy.
   */
  it('sends nothing when another fetch claimed it first', async () => {
    prisma.lead.findUnique.mockResolvedValue(lead());
    prisma.lead.updateMany.mockResolvedValue({ count: 0 });

    const result = await alertOnFirstRealOpen('lead_1');

    expect(result.sent).toBe(false);
    expect(result.reason).toMatch(/claimed/i);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(postSystemMessage).not.toHaveBeenCalled();
  });

  it('claims only while nothing has claimed it, in the same statement', async () => {
    prisma.lead.findUnique.mockResolvedValue(lead());

    await alertOnFirstRealOpen('lead_1');

    const claim = prisma.lead.updateMany.mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(claim.where).toMatchObject({ id: 'lead_1', coldEmailOpenNotifiedAt: null });
  });

  it('still posts to the thread when the lead has no owner to email', async () => {
    prisma.lead.findUnique.mockResolvedValue(lead({ assignedTo: null }));

    const result = await alertOnFirstRealOpen('lead_1');

    expect(result.sent).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(postSystemMessage).toHaveBeenCalled();
  });

  it('says nothing about a lead that was never emailed', async () => {
    prisma.lead.findUnique.mockResolvedValue(lead({ coldEmailSentAt: null, coldEmailOpens: 3 }));

    expect((await alertOnFirstRealOpen('lead_1')).sent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
