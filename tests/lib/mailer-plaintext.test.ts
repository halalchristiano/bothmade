import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The App Password transport was the one still sending HTML-only.
 *
 * tests/lib/email-plaintext.test.ts opens by stating that "every outbound
 * message carries a text/plain alternative", and covers `htmlToPlainText` and
 * `encodeMimeMessage` — the delegated and OAuth Gmail paths. lib/email.ts
 * passes `text` to Resend. That is three of the four transports in
 * `sendAsUser`, and nothing asserted the fourth, which did not have it.
 *
 * Nodemailer sends `text/html` alone when given only `html`, and builds
 * `multipart/alternative` when given both. So the omission was invisible in
 * the code and invisible in the suite.
 *
 * It also happened to be the worst one to miss. `createGmailBatchTransport`
 * pools exactly this transport for bulk cold outreach — the highest-volume,
 * most deliverability-sensitive mail the product sends, and the reason the
 * plaintext work was done in the first place.
 */

const sendMail = vi.fn().mockResolvedValue({ messageId: 'x' });

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail, close: vi.fn() })) },
}));

// Decryption is not what is under test, and the App Password is encrypted.
vi.mock('@/lib/crypto', () => ({
  decryptSecret: (value: string) => `decrypted:${value}`,
  encryptSecret: (value: string) => `encrypted:${value}`,
}));

// The two transports that come first in the fallback chain must be off, or
// the App Password branch is never reached.
vi.mock('@/lib/gmail-delegated', () => ({
  isDomainDelegationConfigured: () => false,
  sendAsDelegatedUser: vi.fn(),
}));

vi.mock('@/lib/email-preview', () => ({ captureForPreview: () => false }));

const SENDER = {
  name: 'Evan',
  email: 'evan@bothmade.studio',
  gmailAddress: 'evan@bothmade.studio',
  gmailAppPassword: 'encrypted-app-password',
  googleRefreshToken: null,
};

beforeEach(() => {
  sendMail.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function send(html: string) {
  const { sendAsUser } = await import('@/lib/mailer');
  const result = await sendAsUser(SENDER, {
    to: 'dana@northgatedental.test',
    subject: 'A quick idea for your site',
    html,
  });
  return { result, message: sendMail.mock.calls[0]?.[0] };
}

describe('the Gmail App Password transport', () => {
  it('sends a plaintext part alongside the HTML', async () => {
    const { result, message } = await send('<p>Hello there.</p>');

    expect(result.sentVia).toBe('gmail-app-password');
    // Both, which is what makes nodemailer emit multipart/alternative rather
    // than text/html on its own.
    expect(message.html).toBe('<p>Hello there.</p>');
    expect(message.text).toBe('Hello there.');
  });

  it('carries a link destination into the plaintext, not just its label', async () => {
    // The plaintext part is the whole message for anyone reading it, so a
    // call to action that loses its URL there is a dead end.
    const { message } = await send(
      '<p>See the <a href="https://bothmade.studio/start">pricing</a>.</p>'
    );

    expect(message.text).toContain('https://bothmade.studio/start');
  });

  it('does not leak markup into the plaintext part', async () => {
    const { message } = await send(
      '<style>p{color:red}</style><div><p>Hello</p><p>Goodbye</p></div>'
    );

    expect(message.text).not.toMatch(/<[a-z]/i);
    expect(message.text).not.toContain('color');
    expect(message.text).toContain('Hello');
    expect(message.text).toContain('Goodbye');
  });

  it('never sends an html body with no text body', async () => {
    // The property that actually matters, stated on its own so it survives
    // any future rewrite of how the text is derived.
    const { message } = await send('<p>Anything at all.</p>');

    expect(message.html).toBeTruthy();
    expect(message.text).toBeTruthy();
  });

  it('still carries the one-click unsubscribe headers', async () => {
    // Pinned alongside, because both exist for the same reason — Gmail's
    // bulk-sender rules — and a change to this call must not drop one while
    // adding the other.
    const { sendAsUser } = await import('@/lib/mailer');
    sendMail.mockClear();
    await sendAsUser(SENDER, {
      to: 'dana@northgatedental.test',
      subject: 'A quick idea',
      html: '<p>Hi</p>',
      unsubscribeUrl: 'https://bothmade.studio/stop/abc123',
    });

    const message = sendMail.mock.calls[0][0];
    expect(message.text).toBeTruthy();
    expect(message.headers['List-Unsubscribe']).toBe('<https://bothmade.studio/stop/abc123>');
    expect(message.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});
