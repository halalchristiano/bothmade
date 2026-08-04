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
// RFC 2045 caps an encoded line at 76 characters. Wrapping three short of
// that leaves room for both the `=` marking a soft break and the two extra
// characters a trailing space costs when it has to become `=20`.
const QP_WRAP_AT = 73;

/**
 * Quoted-printable, per RFC 2045.
 *
 * The parts used to go out with no Content-Transfer-Encoding at all, which
 * declares 7bit — a promise these messages don't keep on either count. The
 * HTML is one long line per template block (a whole message body arrives from
 * escParagraphs() with no newlines in it), routinely past the 998-octet line
 * limit RFC 5322 sets, and the copy is full of em dashes and curly quotes
 * that are multi-byte UTF-8. An agent in the path is entitled to re-wrap a
 * line that long, and a break inserted inside an `href` produces exactly the
 * failure worth avoiding: a button that renders perfectly and goes nowhere.
 *
 * Soft breaks here mean we choose where the wrapping happens, and the
 * decoder puts the line back together exactly as written.
 */
export function encodeQuotedPrintable(input: string): string {
  const bytes = Buffer.from(input.replace(/\r\n|\r|\n/g, '\r\n'), 'utf8');
  const lines: string[] = [];
  let line = '';

  // Trailing whitespace does not survive transport, so it has to be encoded
  // whenever a line ends — soft break or hard.
  const withSafeEnding = (value: string) => {
    if (value.endsWith(' ')) return `${value.slice(0, -1)}=20`;
    if (value.endsWith('\t')) return `${value.slice(0, -1)}=09`;
    return value;
  };

  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];

    if (byte === 0x0d && bytes[i + 1] === 0x0a) {
      lines.push(withSafeEnding(line));
      line = '';
      i += 1;
      continue;
    }

    // Printable ASCII except `=`, plus space and tab, travel as themselves.
    const literal = (byte >= 33 && byte <= 126 && byte !== 61) || byte === 32 || byte === 9;
    const chunk = literal
      ? String.fromCharCode(byte)
      : `=${byte.toString(16).toUpperCase().padStart(2, '0')}`;

    // Appended whole, so a soft break can never land inside an `=XX` escape
    // or between the two bytes of a multi-byte character.
    if (line.length + chunk.length > QP_WRAP_AT) {
      lines.push(`${withSafeEnding(line)}=`);
      line = '';
    }
    line += chunk;
  }

  if (line.length > 0) lines.push(withSafeEnding(line));
  return lines.join('\r\n');
}

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
  /**
   * Attached files, wrapping the alternative part in multipart/mixed. This
   * is what lets the sign-and-pay email — the one carrying the agreement
   * and the invoice — travel the delegated Gmail path instead of being
   * forced onto the fallback sender, which was the one email in the product
   * that most needed to land in Primary and the only one structurally
   * barred from the path built for that.
   */
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
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
  const MIXED_BOUNDARY = '----=_bothmade_mixed_boundary';
  const text = htmlToPlainText(opts.html);

  const alternativePart = [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    // Least-preferred part first: a client picks the last one it can render.
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    encodeQuotedPrintable(text),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    encodeQuotedPrintable(opts.html),
    '',
    `--${boundary}--`,
  ];

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
  ];

  const attachments = opts.attachments ?? [];
  const message =
    attachments.length === 0
      ? [...headers, ...alternativePart, ''].join('\r\n')
      : [
          ...headers,
          `Content-Type: multipart/mixed; boundary="${MIXED_BOUNDARY}"`,
          '',
          `--${MIXED_BOUNDARY}`,
          ...alternativePart,
          ...attachments.flatMap((att) => {
            // The filename ends up inside a quoted header parameter; strip
            // anything that could close the quote or break the line, for the
            // same reason every other header here is sanitized.
            const filename = sanitizeHeaderValue(att.filename).replace(/"/g, '') || 'attachment';
            return [
              `--${MIXED_BOUNDARY}`,
              `Content-Type: ${att.contentType ?? 'application/pdf'}; name="${filename}"`,
              'Content-Transfer-Encoding: base64',
              `Content-Disposition: attachment; filename="${filename}"`,
              '',
              // 76-char lines per RFC 2045 — some MTAs reject longer.
              att.content.toString('base64').replace(/(.{76})/g, '$1\r\n'),
              '',
            ];
          }),
          `--${MIXED_BOUNDARY}--`,
          '',
        ].join('\r\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
