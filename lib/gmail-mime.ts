/** Builds the base64url raw MIME message the Gmail API's messages.send expects. Shared by domain-delegated and per-user OAuth sending. */
export function encodeMimeMessage(opts: { from: string; to: string; subject: string; html: string }): string {
  const { from, to, subject, html } = opts;
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
    html,
  ].join('\r\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
