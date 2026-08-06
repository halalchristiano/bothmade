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

  /**
   * The one that went wrong in the wild.
   *
   * Three alerts landed in one evening, every one of them reading "opened
   * once", every one a mail scanner fetching the pixel a few minutes after
   * delivery. The gate was `callable`, which passes any single open slow
   * enough not to look automatic — a weaker test than the call sheet's own,
   * so the alert announced a reader the app itself did not believe in and
   * then sent somebody to the top of a list that lead was not on.
   *
   * One open proves the address is live. It is not a person.
   */
  it('stays silent for a single open, however late it arrives', async () => {
    for (const delay of [3 * 60 * 60 * 1000, 26 * 60 * 60 * 1000]) {
      vi.clearAllMocks();
      prisma.lead.updateMany.mockResolvedValue({ count: 1 });
      prisma.lead.findUnique.mockResolvedValue(
        lead({ coldEmailOpens: 1, coldEmailOpenedAt: at(delay), coldEmailLastOpenedAt: at(delay) })
      );

      const result = await alertOnFirstRealOpen('lead_1');

      expect(result.sent).toBe(false);
      expect(sendEmail).not.toHaveBeenCalled();
      // Nothing claimed, so the second open can still earn the alert.
      expect(prisma.lead.updateMany).not.toHaveBeenCalled();
    }
  });

  it('fires on the open that turns a delivery into a reader', async () => {
    prisma.lead.findUnique.mockResolvedValue(
      lead({
        coldEmailOpens: 2,
        coldEmailOpenedAt: at(30 * 1000),
        coldEmailLastOpenedAt: at(4 * 60 * 60 * 1000),
      })
    );

    expect((await alertOnFirstRealOpen('lead_1')).sent).toBe(true);
  });

  /**
   * Delivery is the part that lags, not the scanner. A send that sits in a
   * queue for five minutes and is fetched on arrival used to clear the
   * ninety-second window and read as a person.
   */
  it('treats a first open minutes after the send as the delivery', async () => {
    prisma.lead.findUnique.mockResolvedValue(
      lead({
        coldEmailOpens: 1,
        coldEmailOpenedAt: at(5 * 60 * 1000),
        coldEmailLastOpenedAt: at(5 * 60 * 1000),
      })
    );

    expect((await alertOnFirstRealOpen('lead_1')).sent).toBe(false);
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

  /**
   * The alert told everybody the lead was "on the call sheet now, at the top"
   * whether or not there was a number to ring. The call sheet is built from
   * leads that HAVE a phone number — one without lands under "No phone number
   * on file" — so a rep opened Call HQ, looked at the top, and the business
   * the alert had just named was not there.
   */
  it('does not promise the call sheet when there is no number to ring', async () => {
    prisma.lead.findUnique.mockResolvedValue(lead({ phone: null }));

    await alertOnFirstRealOpen('lead_1');

    const mail = sendEmail.mock.calls[0][0] as unknown as { html: string };
    expect(mail.html).not.toMatch(/at the top/i);
    expect(mail.html).toMatch(/no phone number/i);
    // The move that does exist, while the signal is live.
    expect(mail.html).toMatch(/reply to that email/i);

    const posted = postSystemMessage.mock.calls[0][0] as unknown as { content: string };
    expect(posted.content).not.toMatch(/top of the call sheet/i);
    expect(posted.content).toMatch(/reply/i);
  });

  it('still sends them to the top of the sheet when there is a number', async () => {
    prisma.lead.findUnique.mockResolvedValue(lead());

    await alertOnFirstRealOpen('lead_1');

    const mail = sendEmail.mock.calls[0][0] as unknown as { html: string };
    expect(mail.html).toMatch(/top/i);
    expect(mail.html).toContain('+15125550142');
    expect((postSystemMessage.mock.calls[0][0] as unknown as { content: string }).content).toMatch(
      /call sheet/i
    );
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
