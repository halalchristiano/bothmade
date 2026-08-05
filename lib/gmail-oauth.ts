import { google } from 'googleapis';
import { resolveSiteUrl } from '@/lib/site-url';
import { buildFromHeader, encodeMimeMessage } from '@/lib/gmail-mime';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  // Lets us create the "Bounced — Call Instead" label + inbox-skip filter
  // (setupBounceFolder below) so delivery-failure notices never clutter
  // the inbox — not needed just to send.
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  // Read-only access to the bounce notices themselves. The filter above only
  // files them away; without this we can't read them back to work out WHICH
  // lead bounced, which is the difference between a tidy inbox and knowing
  // to ring someone instead of emailing them again.
  'https://www.googleapis.com/auth/gmail.readonly',
];

export const BOUNCE_LABEL_NAME = 'Bounced — Call Instead';

const SITE_URL = resolveSiteUrl();

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

export interface BounceFolderResult {
  ok: boolean;
  alreadyExisted: boolean;
  error?: string;
}

/**
 * Creates a "Bounced — Call Instead" label plus a Gmail filter that catches
 * delivery-failure notices (from mailer-daemon/postmaster, or the standard
 * "Delivery Status Notification (Failure)" / "Undelivered Mail Returned to
 * Sender" subjects) and routes them straight to that label, skipping the
 * inbox — so a bounce never has to be manually spotted and filed away, and
 * the inbox stays leads-only. Safe to call more than once: reuses the
 * label/filter if they already exist instead of duplicating them.
 */
export async function setupBounceFolder(client: GmailOAuthClient): Promise<BounceFolderResult> {
  try {
    const gmail = google.gmail({ version: 'v1', auth: client });

    const { data: labelList } = await gmail.users.labels.list({ userId: 'me' });
    let label = labelList.labels?.find((l) => l.name === BOUNCE_LABEL_NAME);
    let alreadyExisted = !!label;

    if (!label) {
      const { data: created } = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: BOUNCE_LABEL_NAME,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });
      label = created;
    }
    if (!label?.id) throw new Error('Could not create or find the bounce label');

    const bounceQuery =
      '(from:(mailer-daemon OR postmaster OR mail-daemon) OR subject:("Delivery Status Notification" OR "Undelivered Mail Returned to Sender" OR "Mail delivery failed" OR "failure notice"))';

    const { data: filterList } = await gmail.users.settings.filters.list({ userId: 'me' });
    const filterExists = filterList.filter?.some(
      (f) => f.criteria?.query === bounceQuery && f.action?.addLabelIds?.includes(label!.id!)
    );

    if (!filterExists) {
      await gmail.users.settings.filters.create({
        userId: 'me',
        requestBody: {
          criteria: { query: bounceQuery },
          action: { addLabelIds: [label.id], removeLabelIds: ['INBOX'] },
        },
      });
    } else {
      alreadyExisted = true;
    }

    return { ok: true, alreadyExisted };
  } catch (error) {
    console.error('Gmail bounce-folder setup failed:', error);
    return { ok: false, alreadyExisted: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/** Sends one email through the Gmail API as the OAuth-connected account — lands in their real Sent folder, no App Password involved. */
export async function sendViaGmailOAuth(
  client: GmailOAuthClient,
  opts: { fromEmail: string; fromName?: string | null; to: string; subject: string; html: string }
): Promise<boolean> {
  try {
    const gmail = google.gmail({ version: 'v1', auth: client });
    const raw = encodeMimeMessage({
      from: buildFromHeader(opts.fromName, opts.fromEmail),
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

export interface BounceScanResult {
  ok: boolean;
  /** Lowercased addresses that bounced. */
  addresses: string[];
  scanned: number;
  /** Set when the connected token predates the read scope. */
  needsReconnect?: boolean;
  error?: string;
}

/** Pulls every email address out of a blob of bounce-notice text. */
function extractAddresses(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)) {
    const addr = m[0].toLowerCase().replace(/[.,;:>)\]]+$/, '');
    // Skip the postmasters reporting the failure, and our own senders —
    // otherwise every bounce "matches" whoever sent it.
    if (/mailer-daemon|postmaster|no-?reply|mail-daemon|googlemail\.com$/.test(addr)) continue;
    found.add(addr);
  }
  return Array.from(found);
}

/**
 * Reads the bounce label and returns the addresses that failed.
 *
 * A bounce arrives asynchronously, minutes or hours after the send returned
 * success, so nothing in the send path can catch it. Without reading them
 * back, a dead address stays "contacted" forever and the rep keeps emailing
 * a black hole instead of picking up the phone.
 *
 * Reads headers first (X-Failed-Recipients is exact when present) and falls
 * back to scanning the body, which is where Gmail puts the failed address in
 * its own "Address not found" notices.
 */
export async function scanBouncedAddresses(
  client: GmailOAuthClient,
  opts: { maxMessages?: number; newerThanDays?: number } = {}
): Promise<BounceScanResult> {
  // Each message costs an API round trip, so the work has to be bounded —
  // an unbounded scan inside a cron job can outlive the function's time
  // limit and take the rest of that job down with it.
  const maxMessages = opts.maxMessages ?? 100;
  const recency = opts.newerThanDays ? `newer_than:${opts.newerThanDays}d` : '';
  const gmail = google.gmail({ version: 'v1', auth: client });
  try {
    const { data: labelList } = await gmail.users.labels.list({ userId: 'me' });
    const label = labelList.labels?.find((l) => l.name === BOUNCE_LABEL_NAME);

    // Fall back to the same query the filter uses, so this still works before
    // the label exists or if someone deleted it.
    const fallbackQuery =
      '(from:(mailer-daemon OR postmaster OR mail-daemon) OR subject:("Delivery Status Notification" OR "Address not found" OR "Message blocked" OR "Undelivered Mail Returned to Sender"))';
    const listParams = label?.id
      ? { userId: 'me' as const, labelIds: [label.id], maxResults: maxMessages, q: recency || undefined }
      : {
          userId: 'me' as const,
          q: [fallbackQuery, recency].filter(Boolean).join(' '),
          maxResults: maxMessages,
        };

    const { data: list } = await gmail.users.messages.list(listParams);
    const messages = list.messages ?? [];

    const addresses = new Set<string>();
    for (const msg of messages) {
      if (!msg.id) continue;
      const { data: full } = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const headers = full.payload?.headers ?? [];
      const failed = headers.find((h) => h.name?.toLowerCase() === 'x-failed-recipients')?.value;
      if (failed) {
        for (const a of extractAddresses(failed)) addresses.add(a);
        continue;
      }

      // Gmail's own notices put the address in the body, so walk the parts.
      const chunks: string[] = [full.snippet ?? ''];
      const walk = (part: typeof full.payload) => {
        if (!part) return;
        if (part.body?.data) {
          try {
            chunks.push(Buffer.from(part.body.data, 'base64url').toString('utf8'));
          } catch {
            /* a part we can't decode isn't worth failing the whole scan for */
          }
        }
        part.parts?.forEach(walk);
      };
      walk(full.payload);
      for (const a of extractAddresses(chunks.join('\n'))) addresses.add(a);
    }

    return { ok: true, addresses: Array.from(addresses), scanned: messages.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A token minted before gmail.readonly was added can't list messages.
    const needsReconnect = /insufficient|scope|forbidden|403/i.test(message);
    console.error('Bounce scan failed:', error);
    return {
      ok: false,
      addresses: [],
      scanned: 0,
      needsReconnect,
      error: needsReconnect
        ? 'Google needs reconnecting to read bounce notices — the current connection can send but not read.'
        : message,
    };
  }
}

export interface ReplyScanResult {
  ok: boolean;
  /** Lowercased addresses that have written to us. */
  addresses: string[];
  scanned: number;
  needsReconnect?: boolean;
  error?: string;
}

/**
 * Reads recent inbox mail and returns who wrote in.
 *
 * A prospect replying to a cold email is the strongest buying signal there
 * is, and nothing in the CRM knew about it — the reply sat in Gmail while the
 * lead stayed "contacted", drifting down a list ordered by how long it had
 * been ignored. Exactly backwards.
 *
 * Only From headers are fetched, not bodies: it's a fraction of the data, and
 * all that's needed is who replied. What they said is in the mailbox where it
 * already is.
 */
export async function scanReplyAddresses(
  client: GmailOAuthClient,
  opts: { maxMessages?: number; newerThanDays?: number } = {}
): Promise<ReplyScanResult> {
  const gmail = google.gmail({ version: 'v1', auth: client });
  const maxMessages = opts.maxMessages ?? 100;
  const days = opts.newerThanDays ?? 14;

  try {
    const { data: list } = await gmail.users.messages.list({
      userId: 'me',
      // Inbound only, and never our own sends or the bounce notices, which
      // are already handled elsewhere and would otherwise look like replies.
      q: `in:inbox newer_than:${days}d -from:me -from:(mailer-daemon OR postmaster OR mail-daemon)`,
      maxResults: maxMessages,
    });
    const messages = list.messages ?? [];

    const addresses = new Set<string>();
    for (const msg of messages) {
      if (!msg.id) continue;
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From'],
      });
      const from = data.payload?.headers?.find((h) => h.name?.toLowerCase() === 'from')?.value ?? '';
      // "Dave Duran <dave@example.com>" -> dave@example.com
      const match = from.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if (match) addresses.add(match[0].toLowerCase());
    }

    return { ok: true, addresses: Array.from(addresses), scanned: messages.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const needsReconnect = /insufficient|scope|forbidden|403/i.test(message);
    console.error('Reply scan failed:', error);
    return {
      ok: false,
      addresses: [],
      scanned: 0,
      needsReconnect,
      error: needsReconnect
        ? 'Google needs reconnecting to read your inbox — the current connection can send but not read.'
        : message,
    };
  }
}
