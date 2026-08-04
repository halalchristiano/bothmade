import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Outbound mail prefers the real mailbox over the mail provider.
 *
 * Sent through domain-wide delegation the message lands in the sending
 * account's Sent folder and carries that domain's own Gmail reputation —
 * which is the difference we actually observed between Primary and spam.
 * These tests pin the routing rules, especially the one case that must
 * never delegate: attachments, which this MIME builder cannot carry.
 */
const sendAsDelegatedUser = vi.fn();
const isDomainDelegationConfigured = vi.fn();
vi.mock('@/lib/gmail-delegated', () => ({
  sendAsDelegatedUser: (...args: unknown[]) => sendAsDelegatedUser(...args),
  isDomainDelegationConfigured: () => isDomainDelegationConfigured(),
}));

const resendSend = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => resendSend(...args) };
  },
}));

const { sendEmailDetailed } = await import('@/lib/email');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
  resendSend.mockResolvedValue({ error: null });
  sendAsDelegatedUser.mockResolvedValue(true);
  isDomainDelegationConfigured.mockReturnValue(true);
});

const MAIL = { to: 'client@example.com', subject: 'Your invoice', html: '<p>Hello</p>' };

describe('sendEmailDetailed routing', () => {
  it('sends through the real mailbox when delegation is available', async () => {
    const result = await sendEmailDetailed(MAIL);

    expect(result).toEqual({ sent: true });
    expect(sendAsDelegatedUser).toHaveBeenCalledOnce();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it('carries Reply-To through, so replies still reach the right person', async () => {
    await sendEmailDetailed({ ...MAIL, replyTo: 'lead@example.com' });

    expect(sendAsDelegatedUser.mock.calls[0][1].replyTo).toBe('lead@example.com');
  });

  it('addresses each recipient separately rather than listing them together', async () => {
    await sendEmailDetailed({ ...MAIL, to: ['one@example.com', 'two@example.com'] });

    expect(sendAsDelegatedUser).toHaveBeenCalledTimes(2);
    expect(sendAsDelegatedUser.mock.calls.map((call) => call[1].to)).toEqual([
      'one@example.com',
      'two@example.com',
    ]);
  });

  it('carries attachments down the delegated path now that the MIME builder can', async () => {
    const attachments = [{ filename: 'invoice.pdf', content: Buffer.from('%PDF-') }];
    const result = await sendEmailDetailed({ ...MAIL, attachments });

    expect(result).toEqual({ sent: true });
    // This used to force the fallback sender — the sign-and-pay email, the
    // one most needing to land in Primary, was the one email barred from
    // the path built for that. The gate is gone; the files ride along.
    expect(sendAsDelegatedUser).toHaveBeenCalledOnce();
    expect(sendAsDelegatedUser.mock.calls[0][1].attachments).toEqual(attachments);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it('stays on the provider when delegation is not configured', async () => {
    isDomainDelegationConfigured.mockReturnValue(false);

    await sendEmailDetailed(MAIL);

    expect(sendAsDelegatedUser).not.toHaveBeenCalled();
    expect(resendSend).toHaveBeenCalledOnce();
  });

  it('falls back to the provider rather than reporting a send that did not happen', async () => {
    sendAsDelegatedUser.mockResolvedValue(false);

    const result = await sendEmailDetailed(MAIL);

    expect(result).toEqual({ sent: true });
    expect(resendSend).toHaveBeenCalledOnce();
  });
});
