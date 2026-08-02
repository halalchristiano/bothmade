import nodemailer from 'nodemailer';
import { decryptSecret } from '@/lib/crypto';
import { sendEmail as sendViaResend } from '@/lib/email';
import { sendAsDelegatedUser, isDomainDelegationConfigured } from '@/lib/gmail-delegated';

export interface SenderIdentity {
  name: string | null;
  email?: string | null; // the sender's real login email, used for reply-to on the Resend fallback
  gmailAddress: string | null;
  gmailAppPassword: string | null; // encrypted
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
}

export interface SendAsUserResult {
  ok: boolean;
  /** Which path actually sent it — only 'delegated' and 'gmail-app-password' land in the sender's real Gmail Sent folder. */
  sentVia: 'delegated' | 'gmail-app-password' | 'resend' | 'failed';
}

/**
 * Sends a client-facing email as a specific team member, trying the best
 * available method in order:
 *   1. Domain-wide delegation (Google Cloud service account impersonating
 *      the user's real Workspace address) — no per-user setup, lands in
 *      their actual Gmail Sent folder. Used automatically once configured.
 *   2. Their own connected Gmail app password (per-user opt-in, same effect).
 *   3. The shared Resend sender, with their name and reply-to — always works,
 *      but doesn't land in their personal Sent folder, so callers should
 *      surface sentVia to explain that instead of leaving it a silent gap.
 */
export async function sendAsUser(sender: SenderIdentity, email: OutgoingEmail): Promise<SendAsUserResult> {
  if (sender.email && isDomainDelegationConfigured()) {
    const sent = await sendAsDelegatedUser(sender.email, {
      fromName: sender.name,
      to: email.to,
      subject: email.subject,
      html: email.html,
    });
    if (sent) return { ok: true, sentVia: 'delegated' };
  }

  if (sender.gmailAddress && sender.gmailAppPassword) {
    try {
      const transport = nodemailer.createTransport({
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
