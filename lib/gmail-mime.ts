import {
  htmlToPlainText,
  sanitizeDisplayName,
  sanitizeEmailAddress,
  sanitizeHeaderValue,
} from '@/lib/html';

/**
 * `Name <address>`, with the display name stripped of the characters that
 * would change how the header parses and the address validated as one.
 * Throws rather than falling back to a partial header — a From: we can't
 * build correctly is not a From: worth guessing at.
 */
export function buildFromHeader(name: string | null | undefined, address: string): string {
  const from = sanitizeEmailAddress(address);
  if (!from) {
    throw new Error('Refusing to build a message: sender is not a valid email address');
  }
  const displayName = sanitizeDisplayName(name);
  return displayName ? `${displayName} <${from}>` : from;
}

/**
 * Builds the base64url raw MIME message the Gmail API's messages.send expects.
 * Shared by domain-delegated and per-user OAuth sending.
 *
 * Unlike the Resend path, we hand-assemble the headers here, so a CR or LF in
 * `from` or `to` doesn't just corrupt a header — it injects one. A lead's
 * email address arrives from a CSV import and a sender's display name from a
 * profile field, so both are strings a person controls. Anything with a line
 * break in it is rejected outright rather than quietly stripped and sent to
 * whoever's left, because "we sent it somewhere" is the failure mode worth
 * avoiding.
 */
export function encodeMimeMessage(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  /**
   * Where a reply should land when that is not the From: address — the
   * inbound-enquiry alerts reply to the customer, not to the studio. Without
   * this header the Gmail path silently reroutes those replies to the
   * sender, which is a quieter failure than not sending at all.
   */
  replyTo?: string | null;
}): string {
  const from = sanitizeHeaderValue(opts.from);
  const to = sanitizeEmailAddress(opts.to);
  const subject = sanitizeHeaderValue(opts.subject);
  const replyTo = opts.replyTo ? sanitizeEmailAddress(opts.replyTo) : null;

  if (!to) {
    throw new Error('Refusing to build a message: recipient is not a valid email address');
  }
  if (!from) {
    throw new Error('Refusing to build a message: sender address is empty after sanitizing');
  }

  // Base64-encode the subject per RFC 2047 so non-ASCII characters (emoji,
  // accents) don't corrupt the header — most subjects here are plain ASCII
  // but this keeps it safe either way.
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;

  /**
   * multipart/alternative, not text/html alone.
   *
   * These messages went out HTML-only, which is a scored spam signal in its
   * own right: genuine transactional senders offer a plaintext alternative
   * and bulk phishing typically doesn't. Authentication was already clean
   * (SPF, DKIM aligned to the sending domain, DMARC all passing) and Gmail
   * was still filing these as phishing, so the remaining levers are the
   * message's own shape and the domain's age. This is the half we control.
   *
   * The boundary is fixed rather than random: these messages are assembled
   * from our own templates, so there is no attacker-supplied content that
   * could contain it, and a constant keeps the output deterministic for
   * tests.
   */
  const boundary = '----=_bothmade_alt_boundary';
  const text = htmlToPlainText(opts.html);

  const message = [
    `From: ${from}`,
    `To: ${to}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    // Least-preferred part first: a client picks the last one it can render.
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    opts.html,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
