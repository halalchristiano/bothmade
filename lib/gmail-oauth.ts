import { google } from 'googleapis';
import { encodeMimeMessage } from '@/lib/gmail-mime';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
];

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

function getOAuthCreds(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isGoogleOAuthConfigured(): boolean {
  return getOAuthCreds() !== null;
}

function buildOAuthClient() {
  const creds = getOAuthCreds();
  if (!creds) throw new Error('Google OAuth is not configured (GOOGLE_OAUTH_CLIENT_ID/SECRET missing)');
  return new google.auth.OAuth2(creds.clientId, creds.clientSecret, `${SITE_URL}/api/admin/settings/gmail-oauth/callback`);
}

/**
 * Where "Sign in with Google" sends the user. `state` carries the signed
 * session so the callback knows who's connecting without relying on cookies
 * surviving the round-trip to Google and back (prompt=consent forces Google
 * to hand back a refresh_token every time, not just on first-ever connect —
 * without it, reconnecting after a disconnect silently gets no refresh
 * token at all).
 */
export function buildGoogleAuthUrl(state: string): string {
  const client = buildOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

/** Exchanges the callback's ?code for a refresh token and the Google account's email address. */
export async function exchangeGoogleAuthCode(code: string): Promise<{ refreshToken: string; email: string }> {
  const client = buildOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not return a refresh token — this can happen if the account already granted access before. Disconnect in your Google Account permissions (myaccount.google.com/permissions) and try connecting again.'
    );
  }
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();
  if (!data.email) throw new Error('Could not read the Google account email');
  return { refreshToken: tokens.refresh_token, email: data.email };
}

export type GmailOAuthClient = ReturnType<typeof buildOAuthClient>;

/**
 * One authenticated client for a whole batch of sends — googleapis caches
 * the access token it fetches from the refresh token and reuses it until
 * it expires, so building this once per batch (not once per email) avoids
 * redundant token refreshes across a loop.
 */
export function createGmailOAuthBatchClient(refreshToken: string): GmailOAuthClient {
  const client = buildOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/** Sends one email through the Gmail API as the OAuth-connected account — lands in their real Sent folder, no App Password involved. */
export async function sendViaGmailOAuth(
  client: GmailOAuthClient,
  opts: { fromEmail: string; fromName?: string | null; to: string; subject: string; html: string }
): Promise<boolean> {
  try {
    const gmail = google.gmail({ version: 'v1', auth: client });
    const raw = encodeMimeMessage({
      from: opts.fromName ? `${opts.fromName} <${opts.fromEmail}>` : opts.fromEmail,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return true;
  } catch (error) {
    console.error('Gmail OAuth send failed:', error);
    return false;
  }
}
