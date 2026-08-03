import { sanitizeDisplayName, sanitizeEmailAddress, sanitizeHeaderValue } from '@/lib/html';

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
export function encodeMimeMessage(opts: { from: string; to: string; subject: string; html: string }): string {
  const from = sanitizeHeaderValue(opts.from);
  const to = sanitizeEmailAddress(opts.to);
  const subject = sanitizeHeaderValue(opts.subject);

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
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    opts.html,
  ].join('\r\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
