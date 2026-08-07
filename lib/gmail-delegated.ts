import { google } from 'googleapis';
import { buildFromHeader, encodeMimeMessage } from '@/lib/gmail-mime';

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
  opts: {
    fromName?: string | null;
    to: string;
    subject: string;
    html: string;
    replyTo?: string | null;
    /** Becomes List-Unsubscribe. See lib/gmail-mime.ts. */
    unsubscribeUrl?: string | null;
    attachments?: { filename: string; content: Buffer; contentType?: string }[];
  }
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
      from: buildFromHeader(opts.fromName, userEmail),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo,
      attachments: opts.attachments,
      unsubscribeUrl: opts.unsubscribeUrl,
    });

    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return true;
  } catch (error) {
    console.error('Domain-delegated Gmail send failed:', error);
    return false;
  }
}
