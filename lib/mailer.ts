import nodemailer from 'nodemailer';
import { decryptSecret } from '@/lib/crypto';
import { sendEmail as sendViaResend } from '@/lib/email';

export interface SenderIdentity {
  name: string | null;
  gmailAddress: string | null;
  gmailAppPassword: string | null; // encrypted
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends a client-facing email as a specific team member. If they've connected
 * their own Gmail (app password), it goes out through smtp.gmail.com under
 * their real address — Gmail saves a copy to that account's own Sent folder,
 * and the client sees it as a normal email from a real person. Otherwise it
 * falls back to the shared Resend sender with a reply-to of their address.
 */
export async function sendAsUser(sender: SenderIdentity, email: OutgoingEmail): Promise<boolean> {
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
      return true;
    } catch (error) {
      console.error('Gmail send failed, falling back to Resend:', error);
    }
  }

  return sendViaResend({ to: email.to, subject: email.subject, html: email.html });
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
