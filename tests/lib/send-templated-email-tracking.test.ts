import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Open tracking on the emails people actually send by hand.
 *
 * The pixel was added by exactly one route — the bulk cold-draft sender —
 * and this function is what both the Compose Email box and the bulk sender
 * call. So most of the mail leaving the app carried no pixel, and every
 * follow-up a rep wrote by hand came back as silence indistinguishable from
 * being ignored. The counts, the call-sheet ranking and the "they just
 * opened it" alert are all built on that pixel.
 *
 * Two halves, and the first is useless without the second: the pixel
 * endpoint discards any open on a lead whose coldEmailSentAt is null, so a
 * path that sends without recording the send is a path where tracking
 * silently does nothing.
 */

const prisma = {
  user: { findUnique: vi.fn() },
  lead: {
    findUnique: vi.fn(async () => ({ status: 'new' })),
    // Typed for the same reason as the mailer mock: an untyped vi.fn infers an
    // empty argument tuple, and the assertions below read what was written.
    update: vi.fn(async (_args: { where: unknown; data: Record<string, unknown> }) => ({})),
  },
  leadActivity: { create: vi.fn(async (_args: unknown) => ({})) },
};
// Typed, so the argument tuple isn't inferred as empty and the assertions
// below can reach the message that was actually handed to the mailer.
const sendAsUser = vi.fn(
  async (_sender: unknown, _message: { to: string; subject: string; html: string }, _opts?: unknown) => ({
    ok: true,
  })
);

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/mailer', () => ({
  sendAsUser: (...args: Parameters<typeof sendAsUser>) => sendAsUser(...args),
}));
vi.mock('@/lib/site-url', () => ({ resolveSiteUrl: () => 'https://bothmade.studio' }));

const { sendTemplatedEmail, buildTemplatedEmail } = await import('@/lib/send-templated-email');

const SENDER = {
  name: 'Evan',
  email: 'evan@bothmade.studio',
  gmailAddress: null,
  gmailAppPassword: null,
  googleRefreshToken: null,
  avatarUrl: null,
};

const send = (over: Record<string, unknown> = {}) =>
  sendTemplatedEmail({
    senderId: 'user_1',
    templateId: 'cold_outreach',
    to: 'office@ridgeline.example',
    toName: 'Dana',
    company: 'Ridgeline Roofing',
    fields: { observation: 'No pricing anywhere and the gallery is phone photos.' },
    leadId: 'lead_1',
    ...over,
  } as Parameters<typeof sendTemplatedEmail>[0]);

const sentHtml = () => sendAsUser.mock.calls[0][1].html;
const leadUpdate = () => prisma.lead.update.mock.calls.at(-1)![0].data;

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(SENDER);
  prisma.lead.findUnique.mockResolvedValue({ status: 'new' });
});

describe('the pixel', () => {
  it('goes on an email sent to a lead', async () => {
    const result = await send();

    expect(result.ok).toBe(true);
    expect(sentHtml()).toContain('https://bothmade.studio/o/lead_1');
  });

  /** A templated email with no lead is going to a client or a teammate. */
  it('stays off an email with no lead to attribute it to', async () => {
    await send({ leadId: undefined });

    expect(sentHtml()).not.toContain('/o/');
  });

  /**
   * The preview renders the same shell. A pixel in it would count the person
   * writing the email as the prospect reading it — and that lead would then
   * be at the top of the call sheet for an email nobody has received.
   */
  it('never goes in the preview', async () => {
    const built = await buildTemplatedEmail({
      senderId: 'user_1',
      templateId: 'cold_outreach',
      toName: 'Dana',
      company: 'Ridgeline Roofing',
      fields: { observation: 'No pricing anywhere and the gallery is phone photos.' },
    } as Parameters<typeof buildTemplatedEmail>[0]);

    expect(built.ok).toBe(true);
    if (built.ok) expect(built.html).not.toContain('/o/');
  });
});

describe('recording the send', () => {
  /**
   * Without this the pixel above is decoration: the endpoint discards opens
   * on a lead with no coldEmailSentAt, so every fetch would be binned and it
   * would look exactly like being ignored.
   */
  it('stamps coldEmailSentAt, or the pixel counts nothing', async () => {
    await send();

    expect(leadUpdate().coldEmailSentAt).toBeInstanceOf(Date);
  });

  it('starts the counters again, so last month is not evidence about today', async () => {
    await send();

    const data = leadUpdate();
    expect(data.coldEmailOpens).toBe(0);
    expect(data.coldEmailOpenedAt).toBeNull();
    expect(data.coldEmailLastOpenedAt).toBeNull();
  });

  /** A new email is a new question and has to be able to earn its own alert. */
  it('re-arms the open alert', async () => {
    await send();

    expect(leadUpdate().coldEmailOpenNotifiedAt).toBeNull();
  });

  it('touches nothing when there is no lead', async () => {
    await send({ leadId: undefined });

    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('does not stamp a send that failed', async () => {
    sendAsUser.mockResolvedValueOnce({ ok: false });

    const result = await send();

    expect(result.ok).toBe(false);
    // The only write on a failure is the bounce flag.
    expect(leadUpdate()).not.toHaveProperty('coldEmailSentAt');
    expect(leadUpdate().emailDeliveryFailedAt).toBeInstanceOf(Date);
  });
});
