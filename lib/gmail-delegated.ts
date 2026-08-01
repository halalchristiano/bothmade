import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

function getServiceAccountCreds(): { clientEmail: string; privateKey: string } | null {
  const clientEmail = process.env.GOOGLE_SA_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) return null;
  return { clientEmail, privateKey };
}

export function isDomainDelegationConfigured(): boolean {
  return getServiceAccountCreds() !== null;
}

function encodeMimeMessage(opts: { from: string; to: string; subject: string; html: string }): string {
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

/**
 * Sends an email as if it came directly from a real Workspace user's Gmail
 * account — via domain-wide delegation, so it lands in their actual Sent
 * folder with no per-user OAuth consent or app password needed. Requires a
 * Google Cloud service account authorized for domain-wide delegation with
 * the gmail.send scope (set up once by the Workspace admin), configured via
 * GOOGLE_SA_CLIENT_EMAIL and GOOGLE_SA_PRIVATE_KEY env vars.
 */
export async function sendAsDelegatedUser(
  userEmail: string,
  opts: { fromName?: string | null; to: string; subject: string; html: string }
): Promise<boolean> {
  const creds = getServiceAccountCreds();
  if (!creds) return false;

  try {
    const jwtClient = new google.auth.JWT({
      email: creds.clientEmail,
      key: creds.privateKey,
      scopes: SCOPES,
      subject: userEmail,
    });

    const gmail = google.gmail({ version: 'v1', auth: jwtClient });

    const raw = encodeMimeMessage({
      from: opts.fromName ? `${opts.fromName} <${userEmail}>` : userEmail,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });

    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return true;
  } catch (error) {
    console.error('Domain-delegated Gmail send failed:', error);
    return false;
  }
}
