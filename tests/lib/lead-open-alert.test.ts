import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "They just opened it" — three opens, once per send, honest about what it saw.
 *
 * The bar has moved twice. It required repetition, then it fired on any open
 * because an open is real information and silence throws the fact away. What
 * settled it was volume: at a thousand leads a day, every-first-open is a
 * notification every few minutes, and an alert stream nobody can keep up with
 * is one nobody reads. The fact is still kept — the count sits on the lead
 * and the lead is on the call sheet from the very first open. Three is only
 * the bar for interrupting a person.
 *
 * Three rather than two because a privacy proxy fetching on delivery plus one
 * genuine open is already two.
 *
 * Two failure modes still matter more than the feature working, and both are
 * pinned below: one alert per pixel fetch would train everybody to ignore
 * them inside a day, and a mail server's fetch announced as a person reading
 * would send a rep in expecting a live prospect.
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
  coldEmailOpens: 3,
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
    expect(mail.subject).toMatch(/Ridgeline Roofing is reading/i);
    expect(mail.html).toContain('3 times');
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

  /*
   * One open is enough now, and the four tests this replaces said the
   * opposite. They were right for the bar that existed then — three opens
   * plus a `confirmedReader` check — and that bar was lowered deliberately by
   * the studio's owner, on the grounds that a batch of a few hundred
   * producing one notification is indistinguishable from a tracker that has
   * stopped working.
   *
   * What that costs is written down here rather than lost: Apple Mail Privacy
   * Protection and Gmail's image proxy both fetch on delivery whether or not
   * a human looks, so some share of these alerts are a machine. The gain is
   * never missing one that is real, and the wording is what stops the alert
   * overclaiming — see the two tests below.
   */
  it('fires on a single open', async () => {
    prisma.lead.findUnique.mockResolvedValue(
      lead({ coldEmailOpens: 1, coldEmailOpenedAt: at(2000), coldEmailLastOpenedAt: at(2000) })
    );

    const result = await alertOnFirstRealOpen('lead_1');

    expect(result.sent).toBe(true);
    expect(sendEmail).toHaveBeenCalled();
  });

  it('fires on one open that arrives hours later', async () => {
    prisma.lead.findUnique.mockResolvedValue(
      lead({
        coldEmailOpens: 1,
        coldEmailOpenedAt: at(26 * 60 * 60 * 1000),
        coldEmailLastOpenedAt: at(26 * 60 * 60 * 1000),
      })
    );

    expect((await alertOnFirstRealOpen('lead_1')).sent).toBe(true);
  });

  /*
   * The distinction the old gate enforced still exists — it just decides the
   * words instead of deciding whether to send. A fetch that could be a proxy
   * is reported as an open; only a return visit is called reading.
   */
  it('does not claim somebody is reading it on a single fetch', async () => {
    prisma.lead.findUnique.mockResolvedValue(
      lead({ coldEmailOpens: 1, coldEmailOpenedAt: at(2000), coldEmailLastOpenedAt: at(2000) })
    );

    await alertOnFirstRealOpen('lead_1');

    const mail = sendEmail.mock.calls[0][0] as unknown as { subject: string; html: string };
    expect(mail.subject).toMatch(/opened your email/i);
    expect(mail.subject).not.toMatch(/is reading/i);
    expect(mail.html).not.toMatch(/come back to it/i);
  });

  it('still says "is reading it" once they have come back', async () => {
    prisma.lead.findUnique.mockResolvedValue(lead());

    await alertOnFirstRealOpen('lead_1');

    const mail = sendEmail.mock.calls[0][0] as unknown as { subject: string };
    expect(mail.subject).toMatch(/is reading/i);
  });

  it('fires on the third open, as it always did', async () => {
    prisma.lead.findUnique.mockResolvedValue(
      lead({
        coldEmailOpens: 3,
        coldEmailOpenedAt: at(30 * 1000),
        coldEmailLastOpenedAt: at(4 * 60 * 60 * 1000),
      })
    );

    expect((await alertOnFirstRealOpen('lead_1')).sent).toBe(true);
  });

  describe('who it comes from and who it reaches', () => {
    /*
     * Not info@. An open alert is a machine saying "pick up the phone" — it
     * is not a conversation, and a reply to it would land in the inbox the
     * studio answers clients from, where nobody is looking for it.
     */
    it('leaves from the alert mailbox, not the shared client inbox', async () => {
      prisma.lead.findUnique.mockResolvedValue(lead());

      await alertOnFirstRealOpen('lead_1');

      const mail = sendEmail.mock.calls[0][0] as unknown as { from?: string };
      expect(mail.from).toBe('no-reply@bothmadestudio.com');
      expect(mail.from).not.toMatch(/^info@/);
    });

    /*
     * The person who ran the import pressed send on the batch and is the one
     * waiting to hear whether any of it landed. Handing the lead to somebody
     * else afterwards is a decision about who works it, not about who wanted
     * to know it had been opened.
     */
    it('goes to whoever uploaded the CSV, not whoever owns the lead now', async () => {
      prisma.lead.findUnique.mockResolvedValue(
        lead({
          importedBy: { id: 'user_k', email: 'kiana@bothmadestudio.com', name: 'Kiana' },
          assignedTo: { id: 'user_1', email: 'evan@bothmade.studio', name: 'Evan' },
        })
      );

      await alertOnFirstRealOpen('lead_1');

      const mail = sendEmail.mock.calls[0][0] as unknown as { to: string };
      expect(mail.to).toBe('kiana@bothmadestudio.com');
    });

    /** Every lead predating the column has no importer. Those keep the old behaviour. */
    it('falls back to the assignee when nobody is recorded as having imported it', async () => {
      prisma.lead.findUnique.mockResolvedValue(lead({ importedBy: null }));

      await alertOnFirstRealOpen('lead_1');

      const mail = sendEmail.mock.calls[0][0] as unknown as { to: string };
      expect(mail.to).toBe('evan@bothmade.studio');
    });

    /*
     * The team-chat message still posts either way, so an unassigned,
     * un-imported lead is not silent — it just has no inbox to reach.
     */
    it('still posts to the team thread when there is nobody to email', async () => {
      prisma.lead.findUnique.mockResolvedValue(lead({ importedBy: null, assignedTo: null }));

      const result = await alertOnFirstRealOpen('lead_1');

      expect(result.sent).toBe(true);
      expect(postSystemMessage).toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });
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
