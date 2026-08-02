import nodemailer from 'nodemailer';
import { decryptSecret } from '@/lib/crypto';
import { sendEmail as sendViaResend } from '@/lib/email';
import { sendAsDelegatedUser, isDomainDelegationConfigured } from '@/lib/gmail-delegated';
import { createGmailOAuthBatchClient, sendViaGmailOAuth, type GmailOAuthClient } from '@/lib/gmail-oauth';

export interface SenderIdentity {
  name: string | null;
  email?: string | null; // the sender's real login email, used for reply-to on the Resend fallback
  gmailAddress: string | null;
  gmailAppPassword: string | null; // encrypted
  googleRefreshToken?: string | null; // encrypted
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
}

export interface SendAsUserResult {
  ok: boolean;
  /** Which path actually sent it — everything except 'resend'/'failed' lands in the sender's real Gmail Sent folder. */
  sentVia: 'delegated' | 'oauth' | 'gmail-app-password' | 'resend' | 'failed';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GmailTransport = nodemailer.Transporter<any, any>;

/**
 * Builds one pooled SMTP connection for a whole batch of sends, instead of
 * every sendAsUser() call opening (and authenticating) its own connection.
 * Gmail's abuse detection throttles rapid repeated logins from the same App
 * Password — a 50-lead loop each doing its own createTransport+sendMail
 * looks like exactly that, so the first handful send fine and the rest
 * silently fail over to Resend. Reusing one pooled transport for the whole
 * batch avoids the repeated-login pattern entirely. Callers must call
 * transport.close() when the batch is done.
 *
 * Only relevant to the App Password path — most Google Workspace accounts
 * (like @bothmade.studio) can't generate App Passwords at all, which is
 * what createGmailOAuthBatchClient/OAuth is for instead.
 */
export function createGmailBatchTransport(gmailAddress: string, encryptedAppPassword: string): GmailTransport {
  return nodemailer.createTransport({
    service: 'gmail',
    pool: true,
    maxConnections: 1,
    rateDelta: 1000,
    rateLimit: 3, // stay well under Gmail's own per-second throttling
    auth: { user: gmailAddress, pass: decryptSecret(encryptedAppPassword) },
  });
}

/**
 * Sends a client-facing email as a specific team member, trying the best
 * available method in order:
 *   1. Domain-wide delegation (Google Cloud service account impersonating
 *      the user's real Workspace address) — no per-user setup, lands in
 *      their actual Gmail Sent folder. Used automatically once configured.
 *   2. Their own "Sign in with Google" OAuth connection — works for
 *      Workspace accounts that can't use App Passwords at all. Pass
 *      `gmailOAuthClient` (from createGmailOAuthBatchClient) when sending
 *      many emails in one batch so they share one authenticated client.
 *   3. Their own connected Gmail App Password (legacy path — mostly only
 *      still works for personal, non-Workspace Gmail accounts). Pass
 *      `gmailTransport` (from createGmailBatchTransport) for the same
 *      batch-reuse reason as #2.
 *   4. The shared Resend sender, with their name and reply-to — always works,
 *      but doesn't land in their personal Sent folder, so callers should
 *      surface sentVia to explain that instead of leaving it a silent gap.
 */
export async function sendAsUser(
  sender: SenderIdentity,
  email: OutgoingEmail,
  opts?: { gmailTransport?: GmailTransport; gmailOAuthClient?: GmailOAuthClient }
): Promise<SendAsUserResult> {
  if (sender.email && isDomainDelegationConfigured()) {
    const sent = await sendAsDelegatedUser(sender.email, {
      fromName: sender.name,
      to: email.to,
      subject: email.subject,
      html: email.html,
    });
    if (sent) return { ok: true, sentVia: 'delegated' };
  }

  if (sender.googleRefreshToken && sender.gmailAddress) {
    try {
      const client = opts?.gmailOAuthClient ?? createGmailOAuthBatchClient(decryptSecret(sender.googleRefreshToken));
      const sent = await sendViaGmailOAuth(client, {
        fromEmail: sender.gmailAddress,
        fromName: sender.name,
        to: email.to,
        subject: email.subject,
        html: email.html,
      });
      if (sent) return { ok: true, sentVia: 'oauth' };
    } catch (error) {
      console.error('Gmail OAuth send failed, falling back:', error);
    }
  }

  if (sender.gmailAddress && sender.gmailAppPassword) {
    try {
      const transport =
        opts?.gmailTransport ??
        nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: sender.gmailAddress,
            pass: decryptSecret(sender.gmailAppPassword),
          },
        });
      await transport.sendMail({
        from: sender.name ? `${sender.name} <${sender.gmailAddress}>` : sender.gmailAddress,
        to: email.to,
        subject: email.subject,
        html: email.html,
      });
      return { ok: true, sentVia: 'gmail-app-password' };
    } catch (error) {
      console.error('Gmail send failed, falling back to Resend:', error);
    }
  }

  const sent = await sendViaResend({
    to: email.to,
    subject: email.subject,
    html: email.html,
    fromName: sender.name || undefined,
    replyTo: sender.email || undefined,
  });
  return { ok: sent, sentVia: sent ? 'resend' : 'failed' };
}

/**
 * Verifies a Gmail app password actually works by logging in, without
 * sending anything — used when a user connects their account in Settings.
 */
export async function verifyGmailCredentials(gmailAddress: string, appPassword: string): Promise<boolean> {
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailAddress, pass: appPassword },
  });
  await transport.verify();
  return true;
}
