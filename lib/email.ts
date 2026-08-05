import { Resend } from 'resend';
import { emailLinkUrl } from '@/lib/email-links';
import { resolveSiteUrl } from '@/lib/site-url';
import { openPixelUrl } from '@/lib/invoice-delivery';
import { COMPANY_ADDRESS_INLINE, COMPANY_EMAIL, COMPANY_NAME } from '@/lib/company';
// Leaf module — imports only googleapis and gmail-mime — so pulling it in
// here does not create a cycle with lib/mailer.ts, which imports this file.
import { isDomainDelegationConfigured, sendAsDelegatedUser } from '@/lib/gmail-delegated';
import {
  esc,
  escMultiline,
  htmlToPlainText,
  normalizeUrl,
  safeUrl,
  sanitizeDisplayName,
  sanitizeEmailAddress,
  sanitizeEmailAddresses,
  sanitizeSubject,
} from '@/lib/html';

/**
 * Built on first use, not at import. `new Resend(undefined)` throws, and a
 * module-scope client turns a missing RESEND_API_KEY into an import-time crash
 * for every route that touches this file — including ones whose real work
 * (recording a lead, opening a Stripe checkout) does not involve email at all.
 * Degrade to "mail is off", never to "the page is down".
 */
let client: Resend | null = null;

function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}
/**
 * The address everything is sent from and as.
 *
 * A constant, not `process.env.CONTACT_EMAIL`. That variable is set to
 * `notifications@` in production, which quietly won over the `info@` default
 * and made every message come from a mailbox nobody reads — and worse, it is
 * the account domain-wide delegation impersonates, so if it is an alias
 * rather than a real Workspace user the delegated send fails and everything
 * silently falls back to the provider.
 *
 * The address a client should reply to is not deployment configuration. It
 * lives in lib/company.ts with the one on the invoices and the site footer,
 * so all three cannot drift.
 */
const CONTACT_EMAIL = COMPANY_EMAIL;
const SITE_URL = resolveSiteUrl();

// The studio is bothmade.studio. Everything reachable from the public site
// lands here.
const STUDIO_INBOX_FALLBACK = [
  'info@bothmade.studio',
  'evan@bothmade.studio',
  'kiana@bothmade.studio',
];

/**
 * Who hears about anything a stranger sends us — inbound enquiries, pricing
 * interest, signed agreements. All three, always, and deliberately not
 * `getAdminEmails()`: that reads the User table, and info@ is a shared inbox
 * rather than a login, so it would be silently dropped every time.
 *
 * A function rather than a const so the environment is read at send time —
 * a module-level const freezes whatever was set when the bundle first loaded.
 * Set `STUDIO_INBOX` to a comma-separated list to override.
 */
export function studioInbox(): string[] {
  const configured = (process.env.STUDIO_INBOX ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);

  return configured.length > 0 ? configured : STUDIO_INBOX_FALLBACK;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface EmailData {
  to: string | string[];
  subject: string;
  html: string;
  fromName?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

/**
 * Send email using Resend.
 *
 * Every header value is sanitized on the way out. A newline inside a
 * recipient address, a sender name, or a subject ends that header and starts
 * a new one, which is how "email this client" turns into "Bcc: everyone" —
 * and several of these values originate as a company name or a contact name
 * someone typed into the CRM, or a lead's own email address imported from a
 * CSV. Anything that isn't a well-formed address is dropped rather than sent.
 */
/**
 * Why a send didn't happen, in words a rep can act on.
 *
 * `sendEmail` returning a bare false is fine for the sends nobody is
 * watching, but it is the wrong answer for one a person just clicked a
 * button for: "the email failed to send" tells them nothing about whether
 * to retry, fix a setting, or call the client instead. The reason travels
 * to the UI so the answer is on screen rather than in a server log nobody
 * can reach.
 */
export type SendResult = { sent: true } | { sent: false; reason: string };

export async function sendEmailDetailed(data: EmailData): Promise<SendResult> {
  const recipients = sanitizeEmailAddresses(Array.isArray(data.to) ? data.to : [data.to]);
  if (recipients.length === 0) {
    console.error('Email send skipped: no valid recipient address', {
      attempted: Array.isArray(data.to) ? data.to.length : 1,
    });
    return { sent: false, reason: 'That address is not one we can send to — check it for typos.' };
  }

  const fromName = sanitizeDisplayName(data.fromName) || 'Bothmade';
  const replyTo = data.replyTo ? sanitizeEmailAddress(data.replyTo) : null;

  /**
   * Gmail first, Resend as the fallback.
   *
   * Sent through domain-wide delegation the message leaves from the real
   * mailbox: it lands in that account's Sent folder, a reply threads onto
   * something that exists, and it carries the sending domain's own Gmail
   * reputation rather than a shared provider's. Observed in practice — the
   * mail that reached the Sent folder landed in Primary, while the same
   * content through the provider was filed as spam even with SPF, DKIM and
   * DMARC all passing.
   *
   * Two things keep a message on the Resend path. Attachments, because the
   * MIME builder here composes multipart/alternative only and silently
   * dropping an invoice PDF is far worse than sending from the provider.
   * And delegation not being configured at all, which is the local and
   * preview case.
   *
   * Per recipient rather than one message to many, matching how the contact
   * route already addresses the studio: the Gmail API takes a single
   * message, and one To: header listing everyone is what put every internal
   * address one Reply-all away from a customer.
   */
  // Attachments used to force the fallback path because the MIME builder
  // couldn't carry them; it can now (multipart/mixed), so the sign-and-pay
  // email — agreement and invoice attached — rides the same delegated path
  // as everything else that needs to land in Primary.
  const canDelegate = isDomainDelegationConfigured();
  if (canDelegate) {
    const results = await Promise.all(
      recipients.map((recipient) =>
        sendAsDelegatedUser(CONTACT_EMAIL, {
          fromName,
          to: recipient,
          subject: sanitizeSubject(data.subject),
          html: data.html,
          replyTo,
          attachments: data.attachments,
        })
      )
    );
    if (results.every(Boolean)) return { sent: true };
    // A partial or total failure falls through to Resend rather than
    // reporting a send that didn't happen. A duplicate to whoever did get
    // the delegated copy is the acceptable cost of not losing the message.
    console.error(
      `Delegated send failed for ${results.filter((ok) => !ok).length}/${results.length} recipients; falling back to Resend`
    );
  }

  try {
    const resend = resendClient();
    if (!resend) {
      console.error('RESEND_API_KEY not configured; skipping send');
      return {
        sent: false,
        reason:
          'Email is not configured on this deployment (RESEND_API_KEY is not set), so nothing was sent. Copy the link below and send it yourself.',
      };
    }

    const result = await resend.emails.send({
      from: `${fromName} <${CONTACT_EMAIL}>`,
      to: recipients,
      subject: sanitizeSubject(data.subject),
      html: data.html,
      // Sent alongside the HTML so the message is multipart/alternative
      // rather than HTML-only, which is a scored spam signal on its own.
      // Same reasoning as the Gmail path in lib/gmail-mime.ts.
      text: htmlToPlainText(data.html),
      ...(replyTo ? { replyTo } : {}),
      ...(data.attachments ? { attachments: data.attachments } : {}),
    });

    if (result.error) {
      console.error('Resend error:', result.error);
      // Resend's own wording is the useful part — "domain is not verified"
      // names the fix, where "failed to send" sends someone hunting.
      const detail = result.error.message || String(result.error);
      return { sent: false, reason: `The mail provider refused it: ${detail}` };
    }

    return { sent: true };
  } catch (error) {
    console.error('Email send failed:', error);
    const detail = error instanceof Error ? error.message : String(error);
    return { sent: false, reason: `The send threw an error: ${detail}` };
  }
}

export async function sendEmail(data: EmailData): Promise<boolean> {
  return (await sendEmailDetailed(data)).sent;
}

/**
 * Shared branded shell for every transactional email — dark gradient header,
 * glass-style content card, gradient CTA button, matching the app's visual
 * language instead of the generic black-header boilerplate.
 *
 * Everything here is escaped except `bodyHtml`, which is markup the caller
 * assembled and is responsible for escaping. `ctaUrl` and `footerAvatarUrl`
 * go through safeUrl(), so a `javascript:` value renders as no link at all
 * rather than as a live one.
 *
 * No `target="_blank"` on any link in here, deliberately. There is no tab to
 * preserve inside an email, and a mail app renders the message in a webview
 * with no concept of opening a second window — a `_blank` navigation there
 * can be swallowed, which looks exactly like a button that does nothing when
 * tapped. Webmail rewrites every link and adds its own target anyway, so
 * leaving it off costs nothing and removes a failure mode.
 */
function renderShell(opts: {
  eyebrow?: string;
  title: string;
  bodyHtml: string;
  /** Attachment cards, rendered between the body and the button. */
  attachmentsHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /**
   * The "Best, <name>" block, kept out of `bodyHtml` so it can sit where it
   * belongs — under the attachments and the button, not above them. An email
   * that signs off and then keeps going reads like it was assembled by a
   * machine, which is exactly what happened.
   */
  signOffHtml?: string;
  footerNote?: string;
  footerAvatarUrl?: string | null;
  /**
   * A 1x1 open pixel, on the invoice emails only. See app/e/[instalmentId]
   * for what it is for and lib/invoice-delivery.ts for what an open may
   * honestly be claimed to mean.
   */
  trackingPixelUrl?: string | null;
}): string {
  const { bodyHtml } = opts;
  const eyebrow = esc(opts.eyebrow);
  const title = esc(opts.title);
  const attachmentsHtml = opts.attachmentsHtml || '';
  const ctaLabel = esc(opts.ctaLabel);
  // Routed through us when it's a Drive link, so a tap on a phone reaches a
  // browser rather than an app that silently declines to open it.
  const ctaHref = emailLinkUrl(opts.ctaUrl);
  const ctaUrl = safeUrl(ctaHref);
  // The same link as plain text, for the line under the button — the wrapped
  // one, so what it says and where it goes are the same address. Escaped for
  // display, not for an href.
  const ctaUrlText = esc(ctaHref);
  const footerNote = esc(opts.footerNote);
  const footerAvatarUrl = safeUrl(opts.footerAvatarUrl);
  // Last thing in the body, so a client that stops rendering early still
  // shows the whole email — the pixel is the only part nobody misses.
  const pixelUrl = safeUrl(opts.trackingPixelUrl);
  const trackingPixel = pixelUrl
    ? `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block; width:1px; height:1px; border:0; opacity:0;" />`
    : '';
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
  </head>
  <body style="margin:0; padding:0; background:#05030a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05030a; padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:28px; text-align:center;">
                <span style="font-size:22px; font-weight:800; letter-spacing:-0.02em;">
                  <span style="color:#7dd3fc;">both</span><span style="color:#ffffff;">made</span>
                </span>
              </td>
            </tr>
            <tr>
              <td style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:20px; overflow:hidden;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:linear-gradient(120deg, rgba(56,189,248,0.18), rgba(168,85,247,0.18)); padding:32px 32px 24px 32px; border-bottom:1px solid rgba(255,255,255,0.08);">
                      ${eyebrow ? `<p style="margin:0 0 8px 0; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#7dd3fc;">${eyebrow}</p>` : ''}
                      <h1 style="margin:0; font-size:22px; line-height:1.3; color:#ffffff; font-weight:700;">${title}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:28px 32px 32px 32px; color:rgba(255,255,255,0.75); font-size:15px; line-height:1.65;">
                      ${bodyHtml}
                      ${attachmentsHtml}
                      ${
                        ctaLabel && ctaUrl
                          ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0 0;"><tr>
                              <td align="center" bgcolor="#6f7ef0" style="border-radius:12px; background-color:#6f7ef0; background-image:linear-gradient(90deg,#38bdf8,#a855f7); mso-padding-alt:14px 30px;">
                                <a href="${ctaUrl}" style="display:inline-block; padding:14px 30px; border-radius:12px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; font-size:15px; font-weight:700; line-height:1; color:#05030a; text-decoration:none;">${ctaLabel}</a>
                              </td>
                            </tr></table>
                            <p style="margin:10px 0 0 0; font-size:11px; line-height:1.5; color:rgba(255,255,255,0.28);">Button not working? <a href="${ctaUrl}" style="color:rgba(125,211,252,0.7); text-decoration:underline; word-break:break-all;">${ctaUrlText}</a></p>`
                          : ''
                      }
                      ${opts.signOffHtml || ''}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 12px 0 12px; text-align:center;">
                ${footerAvatarUrl ? `<img src="${footerAvatarUrl}" width="28" height="28" alt="" style="display:inline-block; vertical-align:middle; border-radius:50%; margin-right:8px; object-fit:cover;" />` : ''}
                <span style="font-size:12px; color:rgba(255,255,255,0.3); vertical-align:middle;">
                  ${footerNote || 'Bothmade — bothmade.studio'}
                </span>
                <p style="margin:10px 0 0 0; font-size:11px; line-height:1.5; color:rgba(255,255,255,0.25);">
                  ${COMPANY_NAME}, ${COMPANY_ADDRESS_INLINE}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${trackingPixel}
  </body>
</html>
  `;
}

/**
 * Send welcome email to new client
 */
export async function sendWelcomeEmail(
  clientEmail: string,
  clientName: string,
  password: string,
  projectName: string,
  serviceType?: string,
  timeline?: string
): Promise<boolean> {
  const loginUrl = `${SITE_URL}/client/login`;
  const projectDetails = [
    serviceType ? `<li style="margin-bottom:4px;"><strong style="color:#fff;">Service:</strong> ${esc(serviceType)}</li>` : '',
    timeline ? `<li style="margin-bottom:4px;"><strong style="color:#fff;">Timeline:</strong> ${esc(timeline)}</li>` : '',
  ]
    .filter(Boolean)
    .join('');

  const bodyHtml = `
    <p>Hi ${esc(clientName)},</p>
    <p>Your project <strong style="color:#fff;">${esc(projectName)}</strong> has been created and we're ready to get started.</p>
    ${projectDetails ? `<ul style="padding-left:18px; margin:16px 0;">${projectDetails}</ul>` : ''}
    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:18px 20px; margin:20px 0; font-family:monospace; font-size:14px;">
      <p style="margin:0 0 6px 0;"><span style="color:rgba(255,255,255,0.4);">Email:</span> <span style="color:#fff;">${esc(clientEmail)}</span></p>
      <p style="margin:0;"><span style="color:rgba(255,255,255,0.4);">Temporary password:</span> <span style="color:#fff;">${esc(password)}</span></p>
    </div>
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">You'll be asked to set your own password the first time you log in.</p>
  `;

  return sendEmail({
    to: clientEmail,
    subject: `Welcome to Bothmade — your project is ready`,
    html: renderShell({
      eyebrow: 'Project created',
      title: 'Welcome to Bothmade',
      bodyHtml,
      ctaLabel: 'Access your dashboard',
      ctaUrl: loginUrl,
    }),
  });
}

/**
 * Send status update email to client
 */
export async function sendStatusUpdateEmail(
  clientEmail: string,
  clientName: string,
  projectName: string,
  updateTitle: string,
  updateDescription: string,
  projectId: string
): Promise<boolean> {
  const dashboardUrl = `${SITE_URL}/client/${projectId}`;

  const bodyHtml = `
    <p>Hi ${esc(clientName)},</p>
    <p>There's a new update on <strong style="color:#fff;">${esc(projectName)}</strong>.</p>
    <div style="background:rgba(255,255,255,0.05); border-left:3px solid #38bdf8; border-radius:8px; padding:16px 18px; margin:20px 0;">
      <p style="margin:0 0 6px 0; font-weight:700; color:#fff;">${esc(updateTitle)}</p>
      <p style="margin:0; color:rgba(255,255,255,0.7);">${escMultiline(updateDescription)}</p>
    </div>
  `;

  return sendEmail({
    to: clientEmail,
    subject: `${projectName}: ${updateTitle}`,
    html: renderShell({
      eyebrow: 'Project update',
      title: projectName,
      bodyHtml,
      ctaLabel: 'View in dashboard',
      ctaUrl: dashboardUrl,
    }),
  });
}

/**
 * The message itself, not a taste of it.
 *
 * Every caller used to cut the body at 100 characters and add an ellipsis,
 * which is about a sentence and a half — long enough to say a decision is
 * needed and never long enough to say what it is. A client reading that on a
 * phone learns only that they have to go and log in somewhere to find out,
 * and a good number of them simply don't, which turns a message we sent into
 * a message nobody read.
 *
 * So the whole thing goes in the email. The dashboard link stays, because
 * replying still happens there and because attachments don't travel — but it
 * is now something to act on rather than the only way to find out what was
 * said. The cap below is a safety valve, not an editorial choice: Gmail clips
 * a message past roughly 102KB and hides the rest behind "View entire
 * message", which would put our footer and the reply button in the hidden
 * part. Nothing typed into a chat box comes close.
 */
export const MESSAGE_EMAIL_MAX_CHARS = 8000;

export function messageEmailBody(content: string): { text: string; truncated: boolean } {
  if (content.length <= MESSAGE_EMAIL_MAX_CHARS) return { text: content, truncated: false };
  return { text: content.slice(0, MESSAGE_EMAIL_MAX_CHARS).trimEnd(), truncated: true };
}

export async function sendMessageNotificationEmail(
  clientEmail: string,
  clientName: string,
  projectName: string,
  messageContent: string,
  projectId: string
): Promise<boolean> {
  const dashboardUrl = `${SITE_URL}/client/${projectId}`;
  const { text, truncated } = messageEmailBody(messageContent);

  const bodyHtml = `
    <p>Hi ${esc(clientName)},</p>
    <p>You have a new message from the Bothmade team on <strong style="color:#fff;">${esc(projectName)}</strong>.</p>
    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:16px 18px; margin:20px 0; color:rgba(255,255,255,0.75);">
      ${escMultiline(text)}
    </div>
    ${
      truncated
        ? '<p style="font-size:13px; color:rgba(255,255,255,0.5);">This message was too long to show in full here — open the conversation to read the rest.</p>'
        : ''
    }
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">Reply in your dashboard and we&rsquo;ll see it straight away. If anything was attached, it&rsquo;s waiting there too.</p>
  `;

  return sendEmail({
    to: clientEmail,
    subject: `New message on ${projectName}`,
    html: renderShell({
      eyebrow: 'New message',
      title: projectName,
      bodyHtml,
      ctaLabel: 'Reply in your dashboard',
      ctaUrl: dashboardUrl,
    }),
  });
}

/**
 * Send a payment link directly to a lead/client — used from the admin
 * "Onboard This Customer" panel's "Email Payment Link" action.
 */
export async function sendPaymentLinkEmail(
  toEmail: string,
  contactName: string | null,
  company: string,
  paymentUrl: string,
  amountLabel: string
): Promise<boolean> {
  const bodyHtml = `
    <p>Hi ${esc(contactName) || 'there'},</p>
    <p>Thanks for choosing Bothmade for ${esc(company)}'s project. Here's a secure link to complete your payment of <strong style="color:#fff;">${esc(
      amountLabel
    )}</strong>.</p>
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">This link is hosted securely by Stripe — we never see or store your card details.</p>
  `;

  return sendEmail({
    to: toEmail,
    subject: 'Your Bothmade payment link',
    html: renderShell({
      eyebrow: 'Payment due',
      title: `${company} — Payment Link`,
      bodyHtml,
      ctaLabel: 'Pay securely',
      ctaUrl: paymentUrl,
    }),
  });
}

/**
 * Send the combined sign-and-pay link — review the proposal, agree to the
 * contract, and pay, all in one page, instead of a separate PDF + payment
 * link the client has to piece together themselves.
 */
export interface SignAndPayScheduleRow {
  label: string;
  amount: string;
  triggerLabel: string;
}

/**
 * The one email that opens every deal: agreement, invoice, and the link that
 * takes the money — and, on the normal instalment sale, the whole payment
 * schedule laid out with **Payment 1 of 3** named as such.
 *
 * That naming is not decoration. This email used to call the first payment a
 * "deposit" and say nothing about the two behind it, while the invoices for
 * payments 2 and 3 announced their position in 26-point type. A client's
 * first impression of how they were going to be billed therefore came from
 * the one document that declined to explain it.
 */
export async function sendSignAndPayEmail(opts: {
  toEmail: string;
  contactName: string | null;
  company: string;
  signUrl: string;
  /** The full schedule, or null when the client is paying the fee in one go. */
  schedule: SignAndPayScheduleRow[] | null;
  /** What is charged on this click. */
  amountLabel: string;
  totalLabel: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<SendResult> {
  const { toEmail, contactName, company, signUrl, schedule, amountLabel, totalLabel } = opts;
  const attachments = opts.attachments ?? [];

  // Named so the sentence matches what is actually attached — promising an
  // agreement that failed to build would be worse than not mentioning it.
  const names = attachments.map((a) => (/agreement/i.test(a.filename) ? 'agreement' : 'itemized invoice'));
  const attachmentLine =
    names.length === 0
      ? ''
      : `<p style="font-size:13px; color:rgba(255,255,255,0.5);">The ${
          names.length === 2 ? `${names[0]} and the ${names[1]} are` : `${names[0]} is`
        } attached to this email as ${names.length === 2 ? 'PDFs' : 'a PDF'}.</p>`;

  const first = schedule?.[0];
  const positionLabel = first?.label ?? 'the full fee';

  // A three-row table beats a paragraph here: the client's whole question is
  // "what am I committing to pay, and when," and a table answers it at a
  // glance in every mail client that ever existed.
  const scheduleTable = schedule
    ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:22px 0; border-collapse:collapse;">
      <tr>
        <td colspan="3" style="padding:0 0 8px; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:rgba(255,255,255,0.4);">
          Payment schedule — ${esc(totalLabel)} total
        </td>
      </tr>
      ${schedule
        .map(
          (row, i) => `
      <tr>
        <td style="padding:10px 12px; border-top:1px solid rgba(255,255,255,0.08); ${
          i === 0 ? 'background:rgba(56,189,248,0.08);' : ''
        } font-size:14px; color:#fff; font-weight:${i === 0 ? '700' : '400'};">${esc(row.label)}</td>
        <td style="padding:10px 12px; border-top:1px solid rgba(255,255,255,0.08); ${
          i === 0 ? 'background:rgba(56,189,248,0.08);' : ''
        } font-size:13px; color:rgba(255,255,255,0.55);">${esc(row.triggerLabel)}</td>
        <td style="padding:10px 12px; border-top:1px solid rgba(255,255,255,0.08); ${
          i === 0 ? 'background:rgba(56,189,248,0.08);' : ''
        } font-size:14px; color:${i === 0 ? '#7dd3fc' : 'rgba(255,255,255,0.75)'}; text-align:right; font-weight:${
            i === 0 ? '700' : '400'
          }; white-space:nowrap;">${esc(row.amount)}</td>
      </tr>`
        )
        .join('')}
    </table>`
    : '';

  const bodyHtml = schedule
    ? `
    <p>Hi ${esc(contactName) || 'there'},</p>
    <p>Here's everything to get ${esc(company)}'s project moving — the agreement to review and a secure place to pay, on one page.</p>
    <p>Your fee of <strong style="color:#fff;">${esc(totalLabel)}</strong> is split across ${
        schedule.length
      } payments. This link takes <strong style="color:#fff;">${esc(positionLabel)} — ${esc(
        amountLabel
      )}</strong>. Nothing else is charged automatically; each later payment is invoiced only when you reach the milestone beside it.</p>
    ${scheduleTable}
    ${attachmentLine}
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">Payment is handled securely by Stripe — we never see or store your card details.</p>
  `
    : `
    <p>Hi ${esc(contactName) || 'there'},</p>
    <p>Here's everything to get ${esc(company)}'s project moving — the agreement to review and a secure place to pay <strong style="color:#fff;">${esc(
        amountLabel
      )}</strong> in full, all on one page.</p>
    ${attachmentLine}
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">Payment is handled securely by Stripe — we never see or store your card details.</p>
  `;

  return sendEmailDetailed({
    to: toEmail,
    subject: schedule
      ? `${positionLabel} — review & confirm your Bothmade project (${company})`
      : `Review & confirm your Bothmade project — ${company}`,
    html: renderShell({
      eyebrow: schedule ? positionLabel : 'Ready to start',
      title: `${company} — Review & Pay`,
      bodyHtml,
      ctaLabel: schedule ? `Review & Pay ${positionLabel}` : 'Review & Pay',
      ctaUrl: signUrl,
    }),
    ...(attachments.length > 0 ? { attachments } : {}),
  });
}

/**
 * Sends just the itemized invoice PDF on its own — for re-sending a copy to
 * the client after the fact, or for Evan to email a copy to himself to
 * check it over, independent of the full sign-and-pay send.
 */
export async function sendInvoiceOnlyEmail(
  toEmail: string,
  contactName: string | null,
  company: string,
  invoicePdf: Buffer,
  isSelfCopy: boolean
): Promise<boolean> {
  const bodyHtml = isSelfCopy
    ? `<p>Here's a copy of the current invoice for ${esc(company)}, attached as a PDF.</p>`
    : `
      <p>Hi ${esc(contactName) || 'there'},</p>
      <p>Here's a copy of your invoice for ${esc(company)}'s project, attached as a PDF.</p>
    `;

  return sendEmail({
    to: toEmail,
    subject: isSelfCopy ? `Invoice copy — ${company}` : `Your invoice — ${company}`,
    html: renderShell({
      eyebrow: 'Invoice',
      title: `${company} — Invoice`,
      bodyHtml,
    }),
    attachments: [{ filename: `${company.replace(/[^a-z0-9]/gi, '-')}-invoice.pdf`, content: invoicePdf }],
  });
}

/** One phase of a care plan's pricing, as shown to the client. */
export interface CarePlanScheduleLine {
  period: string;
  detail: string;
}

/**
 * The schedule table shared by the offer and the confirmation, so what a
 * client was invited onto and what they're told they joined are rendered from
 * the same rows rather than written twice.
 */
function renderScheduleTable(lines: CarePlanScheduleLine[]): string {
  const rows = lines
    .map(
      (line) => `
      <tr>
        <td style="padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.08); color:#ffffff; font-size:14px; font-weight:700; white-space:nowrap; vertical-align:top;">${esc(line.period)}</td>
        <td style="padding:10px 0 10px 16px; border-bottom:1px solid rgba(255,255,255,0.08); color:rgba(255,255,255,0.7); font-size:14px;">${esc(line.detail)}</td>
      </tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;">${rows}</table>`;
}

/**
 * The upsell itself: an invitation to put an existing client onto a monthly
 * care plan, with the introductory rate spelled out phase by phase.
 *
 * The schedule is in the email rather than only behind the link because the
 * thing a client is being asked to accept is a charge that changes twice — a
 * plan whose price silently goes up in a year is the complaint this is written
 * to avoid, so it says so before they click anything.
 */
export async function sendCarePlanOfferEmail(params: {
  toEmail: string;
  contactName: string | null;
  company: string;
  planLabel: string;
  offerUrl: string;
  scheduleLines: CarePlanScheduleLine[];
  /** What the introductory year saves them, already formatted. */
  savingsLabel: string | null;
  /** Whoever is selling it, in their own words. */
  note?: string | null;
  /** True when they took these services in the original scope. */
  alreadyInScope: boolean;
}): Promise<SendResult> {
  const opener = params.alreadyInScope
    ? `The months of ${esc(params.planLabel)} included with ${esc(params.company)}'s project are nearly up. Here's what it looks like to keep it running.`
    : `Now that ${esc(params.company)}'s project is nearly done, here's what it takes to keep it looked after — at a rate we're only offering while we're still working together.`;

  const bodyHtml = `
    <p>Hi ${esc(params.contactName) || 'there'},</p>
    <p>${opener}</p>
    ${params.note ? `<p style="border-left:3px solid #38bdf8; padding-left:14px; color:rgba(255,255,255,0.75);">${escMultiline(params.note)}</p>` : ''}
    <p style="margin-bottom:0;"><strong style="color:#fff;">${esc(params.planLabel)}</strong></p>
    ${renderScheduleTable(params.scheduleLines)}
    ${
      params.savingsLabel
        ? `<p style="color:#7dd3fc; font-weight:700; margin:0 0 16px 0;">That's ${esc(params.savingsLabel)} saved over the first year.</p>`
        : ''
    }
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">Monthly, cancel any time — reply to this email and we'll stop it at the end of whatever month you've paid for. Billing is handled securely by Stripe; we never see or store your card details.</p>
  `;

  return sendEmailDetailed({
    to: params.toEmail,
    subject: `Keep ${params.company} looked after — ${params.planLabel}`,
    html: renderShell({
      eyebrow: 'Ongoing care',
      title: `${params.company} — ${params.planLabel}`,
      bodyHtml,
      ctaLabel: 'See the plan',
      ctaUrl: params.offerUrl,
    }),
  });
}

/**
 * Sent the moment a care plan starts, so the first thing they have in writing
 * is when the free months end and when the standard rate begins — not a
 * surprise line on a statement three months later.
 */
export async function sendCarePlanStartedEmail(params: {
  toEmail: string;
  contactName: string | null;
  company: string;
  planLabel: string;
  scheduleLines: CarePlanScheduleLine[];
  firstChargeLabel: string;
}): Promise<boolean> {
  const bodyHtml = `
    <p>Hi ${esc(params.contactName) || 'there'},</p>
    <p><strong style="color:#fff;">${esc(params.planLabel)}</strong> is now running for ${esc(params.company)}. Here's the schedule you signed up to, for your records.</p>
    ${renderScheduleTable(params.scheduleLines)}
    <p>${esc(params.firstChargeLabel)}</p>
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">You'll get an itemized invoice by email every month. Cancel any time by replying to this email — you keep the month you've already paid for.</p>
  `;

  return sendEmail({
    to: params.toEmail,
    subject: `Your care plan is active — ${params.company}`,
    html: renderShell({
      eyebrow: 'Care plan active',
      title: `${params.company} — ${params.planLabel}`,
      bodyHtml,
    }),
  });
}

/**
 * The monthly invoice, with the itemized PDF attached.
 *
 * The card statement says our name and a number and nothing else, so this is
 * the only document that says which months it covered and that the
 * introductory rate is still being applied. It goes out automatically on the
 * payment succeeding rather than being something anyone has to remember.
 */
export async function sendCarePlanInvoiceEmail(params: {
  toEmail: string;
  contactName: string | null;
  company: string;
  planLabel: string;
  amountLabel: string;
  periodLabel: string | null;
  /** Set while the introductory rate is running, e.g. "First-year rate (15% off)". */
  discountLabel: string | null;
  savedLabel: string | null;
  invoicePdf: Buffer;
  fileName: string;
}): Promise<boolean> {
  const bodyHtml = `
    <p>Hi ${esc(params.contactName) || 'there'},</p>
    <p>We've taken this month's payment of <strong style="color:#fff;">${esc(params.amountLabel)}</strong> for ${esc(params.planLabel)}${
      params.periodLabel ? `, covering ${esc(params.periodLabel)}` : ''
    }. The itemized invoice is attached as a PDF.</p>
    ${
      params.discountLabel && params.savedLabel
        ? `<p style="color:#7dd3fc;">${esc(params.discountLabel)} is still applied — ${esc(params.savedLabel)} off this month.</p>`
        : ''
    }
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">Nothing to do — this is a receipt, not a request for payment.</p>
  `;

  return sendEmail({
    to: params.toEmail,
    subject: `${params.company} — ${params.planLabel} invoice`,
    html: renderShell({
      eyebrow: 'Monthly invoice',
      title: `${params.company} — ${params.planLabel}`,
      bodyHtml,
    }),
    attachments: [{ filename: params.fileName, content: params.invoicePdf }],
  });
}

/**
 * A declined monthly charge. Stripe retries on its own schedule, so this says
 * what will happen rather than demanding anything — the useful action is
 * updating the card, and Stripe's own hosted invoice page is where that
 * happens.
 */
export async function sendCarePlanPaymentFailedEmail(params: {
  toEmail: string;
  contactName: string | null;
  company: string;
  planLabel: string;
  amountLabel: string;
  hostedInvoiceUrl: string | null;
}): Promise<boolean> {
  const bodyHtml = `
    <p>Hi ${esc(params.contactName) || 'there'},</p>
    <p>This month's payment of <strong style="color:#fff;">${esc(params.amountLabel)}</strong> for ${esc(params.planLabel)} didn't go through — usually an expired card rather than anything wrong on your end.</p>
    <p>We'll try again automatically over the next few days. ${
      params.hostedInvoiceUrl ? 'Updating the card below will settle it straight away.' : 'Reply to this email and we\'ll send you a new payment link.'
    }</p>
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">Your plan stays active in the meantime.</p>
  `;

  return sendEmail({
    to: params.toEmail,
    subject: `Payment didn't go through — ${params.company}`,
    html: renderShell({
      eyebrow: 'Payment issue',
      title: `${params.company} — ${params.planLabel}`,
      bodyHtml,
      ...(params.hostedInvoiceUrl
        ? { ctaLabel: 'Update payment details', ctaUrl: params.hostedInvoiceUrl }
        : {}),
    }),
  });
}

/**
 * The client's copy of a one-off charge: what it's for, what it costs, the
 * invoice as a PDF, and a link that pays it.
 *
 * The PDF is attached rather than linked. An invoice is a document a client's
 * bookkeeper files, and a link into our blob storage is not something anyone
 * can forward to an accountant with confidence — it also stops working the
 * day we move buckets. The pay link is the CTA; the invoice is the artefact.
 */
export async function sendCustomChargeEmail(input: {
  toEmail: string;
  contactName: string | null;
  company: string;
  projectName: string;
  invoiceNumber: string;
  description: string;
  amountLabel: string;
  paymentUrl: string | null;
  /** Null when the render failed — the charge still gets sent, without the claim that something is attached. */
  invoicePdf: Buffer | null;
  filename: string;
}): Promise<SendResult> {
  // Naming the project matters more here than anywhere else: this arrives
  // out of the blue, for an amount the client hasn't seen in a proposal, and
  // "which of the things we're paying you for is this?" is the first
  // question. Answer it before they have to ask.
  const bodyHtml = `
    <p>Hi ${esc(input.contactName) || 'there'},</p>
    <p>Here's an invoice for <strong style="color:#fff;">${esc(input.description)}</strong> on ${esc(input.projectName)}.</p>
    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:18px 20px; margin:20px 0;">
      <p style="margin:0 0 6px 0;"><span style="color:rgba(255,255,255,0.4);">Invoice</span> <span style="color:#fff;">${esc(input.invoiceNumber)}</span></p>
      <p style="margin:0; font-size:20px; font-weight:700; color:#fff;">${esc(input.amountLabel)}</p>
    </div>
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">${
      input.invoicePdf
        ? "The full invoice is attached as a PDF, and it's on your project dashboard alongside everything else."
        : "The full invoice is on your project dashboard alongside everything else."
    }</p>
    ${
      input.paymentUrl
        ? `<p style="font-size:13px; color:rgba(255,255,255,0.5);">Payment is handled securely by Stripe — we never see or store your card details.</p>`
        : `<p style="font-size:13px; color:rgba(255,255,255,0.5);">We'll follow up with a payment link shortly. Reply to this email if you'd rather pay another way.</p>`
    }
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">Questions about this invoice? Just reply — it comes straight to us.</p>
  `;

  return sendEmailDetailed({
    to: input.toEmail,
    subject: `Invoice ${input.invoiceNumber} — ${input.description}`,
    html: renderShell({
      eyebrow: 'Invoice',
      title: `${input.amountLabel} — ${input.description}`,
      bodyHtml,
      ...(input.paymentUrl ? { ctaLabel: 'Pay this invoice', ctaUrl: input.paymentUrl } : {}),
    }),
    ...(input.invoicePdf ? { attachments: [{ filename: input.filename, content: input.invoicePdf }] } : {}),
  });
}

/**
 * The studio's own copy of an invoice, sent to info@ the moment it's raised.
 *
 * Belt and braces on top of the database row, and deliberately so: the
 * mailbox is where the accountant looks and where a paper trail survives us
 * changing anything about this app. Same PDF, same number, attached the same
 * way — so the copy in the inbox and the copy the client has are provably
 * the same document.
 */
export async function sendInvoiceRecordEmail(input: {
  invoiceNumber: string;
  company: string;
  projectName: string;
  description: string;
  amountLabel: string;
  issuedByName: string | null;
  sentToEmail: string | null;
  clientDelivered: boolean;
  adminUrl: string;
  paymentUrl: string | null;
  invoicePdf: Buffer | null;
  filename: string;
}): Promise<boolean> {
  const delivery = input.sentToEmail
    ? input.clientDelivered
      ? `Emailed to ${esc(input.sentToEmail)}.`
      : `<span style="color:#fca5a5;">Not delivered to ${esc(input.sentToEmail)} — the client copy failed to send, so this one needs chasing by hand.</span>`
    : 'Not sent to the client — raised for the record only.';

  const bodyHtml = `
    <p><strong style="color:#fff;">${esc(input.invoiceNumber)}</strong> raised against ${esc(input.company)} — ${esc(input.projectName)}.</p>
    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:18px 20px; margin:20px 0;">
      <p style="margin:0 0 6px 0;"><span style="color:rgba(255,255,255,0.4);">For</span> <span style="color:#fff;">${esc(input.description)}</span></p>
      <p style="margin:0 0 6px 0; font-size:20px; font-weight:700; color:#fff;">${esc(input.amountLabel)}</p>
      <p style="margin:0; font-size:13px; color:rgba(255,255,255,0.5);">Raised by ${esc(input.issuedByName) || 'the team'}. ${delivery}</p>
    </div>
    ${
      input.paymentUrl
        ? `<p style="font-size:13px; color:rgba(255,255,255,0.5);">Pay link: <a href="${safeUrl(input.paymentUrl)}" style="color:#7dd3fc;">${esc(input.paymentUrl)}</a></p>`
        : `<p style="font-size:13px; color:#fca5a5;">No Stripe link was created for this one — the client has an invoice they can't pay online yet.</p>`
    }
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">${
      input.invoicePdf
        ? "The PDF is attached. It's the same file the client received."
        : '<span style="color:#fca5a5;">The PDF failed to render, so there is nothing attached and the client got none either — this invoice needs re-issuing.</span>'
    }</p>
  `;

  return sendEmail({
    to: studioInbox(),
    subject: `Invoice ${input.invoiceNumber} — ${input.company} — ${input.amountLabel}`,
    html: renderShell({
      eyebrow: 'Invoice raised',
      title: `${input.company} — ${input.amountLabel}`,
      bodyHtml,
      ctaLabel: 'Open in admin',
      ctaUrl: input.adminUrl,
    }),
    ...(input.invoicePdf ? { attachments: [{ filename: input.filename, content: input.invoicePdf }] } : {}),
  });
}

/**
 * Notify the internal team the moment a client agrees online — a copy of
 * exactly what they signed, ready for the books.
 */
export async function sendSignedContractCopyEmail(
  toEmails: string[],
  company: string,
  contractUrl: string,
  totalPriceLabel: string,
  signerName?: string
): Promise<boolean> {
  // A signed agreement is the one document every one of the three needs a
  // copy of no matter who else is on the thread.
  const recipients = Array.from(new Set([...toEmails, ...studioInbox()]));
  const who = signerName ? `<strong style="color:#fff;">${esc(signerName)}</strong> at ` : '';
  const bodyHtml = `
    <p>${who}<strong style="color:#fff;">${esc(company)}</strong> just signed their project agreement online (total: ${esc(totalPriceLabel)}).</p>
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">A copy is saved below and will also show up on the project once payment clears.</p>
  `;

  return sendEmail({
    to: recipients,
    subject: `Signed: ${company}'s project agreement`,
    html: renderShell({
      eyebrow: 'Contract signed',
      title: `${company} signed online`,
      bodyHtml,
      ctaLabel: 'View signed copy',
      ctaUrl: contractUrl,
    }),
  });
}

/**
 * The client's own copy of what they just signed, sent at the moment of
 * signing rather than after payment.
 *
 * Two reasons it can't wait for the Stripe webhook. It's the courtesy half
 * of a clickwrap — the signer is meant to leave with the document, not with
 * a promise of one. And the signature is recorded before checkout, so
 * somebody who agrees and then abandons payment is bound by an agreement
 * they'd otherwise have no copy of.
 */
export async function sendClientSignedContractEmail(input: {
  toEmail: string;
  contactName: string | null;
  company: string;
  contractUrl: string;
  totalPriceLabel: string;
  signedAt: Date;
}): Promise<boolean> {
  const when = input.signedAt.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const bodyHtml = `
    <p>Hi ${esc(input.contactName) || 'there'},</p>
    <p>Here's your copy of the project agreement for <strong style="color:#fff;">${esc(input.company)}</strong>, signed on ${esc(when)}. Nothing further to sign — this is for your records.</p>
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">Project total: ${esc(input.totalPriceLabel)}. Keep this email, or download the PDF below and save it somewhere you'll find it later.</p>
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">If you didn't sign this, reply to this email straight away and we'll void it.</p>
  `;

  return sendEmail({
    to: input.toEmail,
    subject: `Your signed agreement — ${input.company}`,
    html: renderShell({
      eyebrow: 'Signed agreement',
      title: 'Your copy, for the record',
      bodyHtml,
      ctaLabel: 'Download signed agreement',
      ctaUrl: input.contractUrl,
    }),
  });
}

/**
 * Send a password reset link — used by the "Forgot password?" flow for both
 * admin/team accounts and clients.
 */
export async function sendPasswordResetEmail(toEmail: string, resetUrl: string): Promise<boolean> {
  const bodyHtml = `
    <p>We got a request to reset the password on this account. Click below to choose a new one.</p>
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">This link expires in 24 hours. If you didn't request this, you can safely ignore this email — your password won't change.</p>
  `;

  return sendEmail({
    to: toEmail,
    subject: 'Reset your Bothmade password',
    html: renderShell({
      eyebrow: 'Security',
      title: 'Reset your password',
      bodyHtml,
      ctaLabel: 'Reset Password',
      ctaUrl: resetUrl,
    }),
  });
}

/**
 * Friday recap sent to every admin/team account — pipeline movement,
 * revenue, and what's overdue, so neither of you needs to be staring at
 * the dashboard all week to stay oriented.
 */
export async function sendWeeklyDigestEmail(
  toEmails: string[],
  stats: {
    newLeadsThisWeek: number;
    wonThisWeek: number;
    wonValueThisWeek: number;
    revenueThisMonth: number;
    overdueFollowUps: number;
    overdueBalances: number;
    atRiskProjects: number;
  }
): Promise<boolean> {
  if (toEmails.length === 0) return false;

  const formatCents = (cents: number) => `$${(cents / 100).toLocaleString()}`;

  const row = (label: string, value: string, warn = false) => `
    <tr>
      <td style="padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.08); color:rgba(255,255,255,0.55); font-size:14px;">${label}</td>
      <td style="padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.08); text-align:right; font-weight:700; font-size:14px; color:${warn ? '#f87171' : '#ffffff'};">${value}</td>
    </tr>`;

  const bodyHtml = `
    <p style="margin-top:0;">Here's how the week shook out.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      ${row('New leads this week', String(stats.newLeadsThisWeek))}
      ${row('Deals won this week', `${stats.wonThisWeek} (${formatCents(stats.wonValueThisWeek)})`)}
      ${row('Revenue this month', formatCents(stats.revenueThisMonth))}
      ${row('Overdue follow-ups', String(stats.overdueFollowUps), stats.overdueFollowUps > 0)}
      ${row('Overdue balances', String(stats.overdueBalances), stats.overdueBalances > 0)}
      ${row('At-risk projects (7+ days idle)', String(stats.atRiskProjects), stats.atRiskProjects > 0)}
    </table>
  `;

  return sendEmail({
    to: toEmails,
    subject: 'Your week at Bothmade',
    html: renderShell({
      eyebrow: 'Weekly digest',
      title: 'Your week at Bothmade',
      bodyHtml,
      // Aggregate counts alone aren't actionable — point at the ranked list
      // of exactly which leads/projects they refer to when there's anything
      // to act on, the dashboard otherwise.
      ctaLabel: stats.overdueBalances + stats.atRiskProjects > 0 ? 'See what needs attention' : 'Open Dashboard',
      ctaUrl:
        stats.overdueBalances + stats.atRiskProjects > 0
          ? `${SITE_URL}/admin/priorities`
          : `${SITE_URL}/admin/dashboard`,
    }),
  });
}

export { renderShell };


/**
 * One instalment's email — the personalised send behind "Payment 2 of 3".
 *
 * The copy comes from lib/instalments so the subject line, the invoice PDF,
 * and the dashboard all describe the same moment in the same words. The
 * invoice rides as an attachment and the CTA is the live Stripe checkout.
 */
export async function sendInstalmentEmail(params: {
  toEmail: string;
  copy: { subject: string; title: string; eyebrow: string; bodyHtml: string; ctaLabel: string };
  paymentUrl: string;
  invoicePdf: Buffer | null;
  invoiceFilename: string;
  /** Carries the open pixel, so "never landed" stops looking like "hasn't paid". */
  instalmentId?: string;
}): Promise<SendResult> {
  return sendEmailDetailed({
    to: params.toEmail,
    subject: params.copy.subject,
    html: renderShell({
      eyebrow: params.copy.eyebrow,
      title: params.copy.title,
      bodyHtml: params.copy.bodyHtml,
      ctaLabel: params.copy.ctaLabel,
      ctaUrl: params.paymentUrl,
      footerNote: 'Payments are processed securely by Stripe. The invoice is attached for your records.',
      trackingPixelUrl: params.instalmentId ? openPixelUrl(SITE_URL, params.instalmentId) : null,
    }),
    ...(params.invoicePdf
      ? { attachments: [{ filename: params.invoiceFilename, content: params.invoicePdf }] }
      : {}),
  });
}

/**
 * The mockup, sent on a link the studio can see through.
 *
 * Short on purpose. This email has exactly one job — get them to click — and
 * every extra sentence in it is a sentence between the prospect and the work
 * that sells the deal.
 */
export async function sendMockupEmail(opts: {
  toEmail: string;
  contactName: string | null;
  company: string;
  viewUrl: string;
  /** The rep's own note on this version, if it says something worth saying. */
  note?: string | null;
}): Promise<SendResult> {
  const { toEmail, contactName, company, viewUrl } = opts;
  const note = opts.note?.trim();

  const bodyHtml = `
    <p>Hi ${esc(contactName) || 'there'},</p>
    <p>We've built something for ${esc(company)} — a working preview, not a picture of one. Have a click around.</p>
    ${note ? `<p style="color:rgba(255,255,255,0.65);">${esc(note)}</p>` : ''}
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">When you've had a look there are two buttons at the bottom of the page: one if it works for you, one if you'd like changes. Either is useful — tell us which.</p>
  `;

  return sendEmailDetailed({
    to: toEmail,
    subject: `We built something for ${company} — have a look`,
    html: renderShell({
      eyebrow: 'Your mockup',
      title: `${company} — a first look`,
      bodyHtml,
      ctaLabel: 'Open the mockup',
      ctaUrl: viewUrl,
    }),
  });
}

/**
 * "That invoice is cancelled — there's nothing to pay."
 *
 * Sent only when the client was told about the invoice in the first place; an
 * invoice raised and voided before anyone saw it needs no apology. The tone is
 * deliberately not apologetic beyond the facts: a client who receives a
 * grovelling email about a billing error starts wondering what else is wrong.
 * State it, give the reason, and get out of their inbox.
 */
export async function sendInvoiceVoidedEmail(input: {
  to: string;
  contactName: string | null;
  company: string;
  invoiceNumber: string;
  description: string;
  amountLabel: string;
  reason: string;
}): Promise<SendResult> {
  const bodyHtml = `
    <p>Hi ${esc(input.contactName) || 'there'},</p>
    <p>We've cancelled invoice <strong style="color:#fff;">${esc(input.invoiceNumber)}</strong> — there's nothing to pay, and any payment link we sent you no longer works.</p>
    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:18px 20px; margin:20px 0;">
      <p style="margin:0 0 6px 0;"><span style="color:rgba(255,255,255,0.4);">Cancelled</span> <span style="color:#fff;">${esc(input.invoiceNumber)}</span></p>
      <p style="margin:0 0 10px 0; font-size:20px; font-weight:700; color:rgba(255,255,255,0.55); text-decoration:line-through;">${esc(input.amountLabel)}</p>
      <p style="margin:0; font-size:13px; color:rgba(255,255,255,0.6);">${esc(input.description)}</p>
    </div>
    <p><span style="color:rgba(255,255,255,0.4);">Why:</span> ${esc(input.reason)}</p>
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">If you'd already paid this one, tell us and we'll put it right the same day. Otherwise there's nothing you need to do.</p>
  `;

  return sendEmailDetailed({
    to: input.to,
    subject: `Cancelled — invoice ${input.invoiceNumber}`,
    html: renderShell({
      eyebrow: 'Invoice cancelled',
      title: `Invoice ${input.invoiceNumber} has been cancelled`,
      bodyHtml,
    }),
  });
}

/**
 * A refund, stated the way Section 8(l) of the contract requires it to be.
 *
 * "Every settlement under this Section is stated as two lines — amount due
 * from the Client, and amount returned to the Client — at least one of which
 * is always zero." Both lines are printed even when one is zero, because the
 * point of the clause is that the client can see there is no third number
 * hiding somewhere. Deductions are itemised above them, which Section 8(f)
 * separately requires in writing.
 */
export async function sendInvoiceRefundedEmail(input: {
  to: string;
  contactName: string | null;
  company: string;
  invoiceNumber: string;
  description: string;
  method: 'stripe' | 'manual' | 'credit';
  reason: string;
  refundLabel: string;
  deductions: Array<{ label: string; amountLabel: string }>;
  dueFromClientLabel: string;
  returnedToClientLabel: string;
}): Promise<SendResult> {
  const isCredit = input.method === 'credit';

  const settlementRow = (label: string, value: string, strong: boolean) => `
    <tr>
      <td style="padding:7px 0; color:rgba(255,255,255,${strong ? '0.75' : '0.45'}); font-size:14px;">${esc(label)}</td>
      <td style="padding:7px 0; text-align:right; color:${strong ? '#fff' : 'rgba(255,255,255,0.45)'}; font-size:14px; font-weight:${strong ? '700' : '400'};">${esc(value)}</td>
    </tr>`;

  const bodyHtml = `
    <p>Hi ${esc(input.contactName) || 'there'},</p>
    <p>${
      isCredit
        ? `We've applied a credit of <strong style="color:#fff;">${esc(input.refundLabel)}</strong> against invoice ${esc(input.invoiceNumber)}. It comes off your next invoice rather than going back to your card.`
        : `We've refunded <strong style="color:#fff;">${esc(input.returnedToClientLabel)}</strong> against invoice ${esc(input.invoiceNumber)}.`
    }</p>
    <p><span style="color:rgba(255,255,255,0.4);">Why:</span> ${esc(input.reason)}</p>
    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:18px 20px; margin:20px 0;">
      <p style="margin:0 0 12px 0; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:rgba(255,255,255,0.35);">Settlement</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${settlementRow(`Invoice ${input.invoiceNumber} — ${input.description}`, input.refundLabel, false)}
        ${input.deductions
          .map((d) => settlementRow(`Less: ${d.label}`, `−${d.amountLabel}`, false))
          .join('')}
        <tr><td colspan="2" style="border-top:1px solid rgba(255,255,255,0.12); padding-top:4px;"></td></tr>
        ${settlementRow('Amount due from you', input.dueFromClientLabel, input.dueFromClientLabel !== '$0')}
        ${settlementRow(
          isCredit ? 'Amount credited to you' : 'Amount returned to you',
          input.returnedToClientLabel,
          input.returnedToClientLabel !== '$0'
        )}
      </table>
    </div>
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">${
      input.method === 'stripe'
        ? 'This goes back to the card you paid with. Stripe usually takes 5–10 days to show it, depending on your bank.'
        : isCredit
          ? "Nothing has left our account and nothing needs to leave yours — the credit is held against your next invoice."
          : "We're sending this back outside Stripe. If it hasn't reached you within a few days, reply and we'll chase it."
    }</p>
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">Questions about any of this? Just reply — it comes straight to us.</p>
  `;

  return sendEmailDetailed({
    to: input.to,
    subject: isCredit
      ? `Credit applied — invoice ${input.invoiceNumber}`
      : `Refunded ${input.returnedToClientLabel} — invoice ${input.invoiceNumber}`,
    html: renderShell({
      eyebrow: isCredit ? 'Credit applied' : 'Refund issued',
      title: isCredit
        ? `${input.refundLabel} credited to your account`
        : `${input.returnedToClientLabel} on its way back to you`,
      bodyHtml,
    }),
  });
}

/**
 * A Change Order, out for signature.
 *
 * The three numbers are the whole email: what it was, what it becomes, and
 * the difference. A client reading "your project is now $23,000" without
 * being shown the $20,000 it was and the $3,000 that moved has to go and find
 * the old figure themselves, and the version of this that made them do that
 * is the version that got replies asking what changed.
 *
 * Section 9 requires approval "in writing" before work begins, so the only
 * call to action is the link — there is deliberately nothing here to pay.
 */
export async function sendChangeOrderEmail(input: {
  to: string;
  contactName: string | null;
  company: string;
  projectName: string;
  number: string;
  summary: string;
  deltaLabel: string;
  previousTotalLabel: string;
  newTotalLabel: string;
  timelineExtensionDays: number;
  signUrl: string;
}): Promise<SendResult> {
  const row = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:7px 0; color:rgba(255,255,255,${strong ? '0.75' : '0.45'}); font-size:14px;">${esc(label)}</td>
      <td style="padding:7px 0; text-align:right; color:${strong ? '#fff' : 'rgba(255,255,255,0.55)'}; font-size:14px; font-weight:${strong ? '700' : '400'};">${esc(value)}</td>
    </tr>`;

  const bodyHtml = `
    <p>Hi ${esc(input.contactName) || 'there'},</p>
    <p>Here's a change to <strong style="color:#fff;">${esc(input.projectName)}</strong> for you to look over. Nothing changes and no new work starts until you've agreed to it.</p>
    <p style="border-left:2px solid rgba(125,211,252,0.6); padding-left:16px; color:rgba(255,255,255,0.75);">${esc(input.summary)}</p>
    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:18px 20px; margin:20px 0;">
      <p style="margin:0 0 12px 0; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:rgba(255,255,255,0.35);">${esc(input.number)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${row('Project total was', input.previousTotalLabel)}
        ${row('This change', input.deltaLabel)}
        <tr><td colspan="2" style="border-top:1px solid rgba(255,255,255,0.12); padding-top:4px;"></td></tr>
        ${row('New project total', input.newTotalLabel, true)}
      </table>
    </div>
    ${
      input.timelineExtensionDays > 0
        ? `<p style="font-size:13px; color:rgba(255,255,255,0.5);">This adds ${input.timelineExtensionDays} day${input.timelineExtensionDays === 1 ? '' : 's'} to the timeline.</p>`
        : ''
    }
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">The full breakdown, and how your remaining payments change, are on the page below. If it doesn't look right, decline it there and tell us why — it comes straight to us.</p>
  `;

  return sendEmailDetailed({
    to: input.to,
    subject: `${input.number} — a change to ${input.projectName}`,
    html: renderShell({
      eyebrow: 'Change order',
      title: `${input.projectName} — ${input.newTotalLabel}`,
      bodyHtml,
      ctaLabel: 'Read it and decide',
      ctaUrl: input.signUrl,
    }),
  });
}

/**
 * A chase for a payment that has been invoiced and not paid.
 *
 * The link is always freshly minted, and the previous one is dead by the time
 * this arrives — a Stripe Checkout Session expires after 24 hours, so a
 * client returning to an older email would otherwise find a button that does
 * nothing, which is a payment lost to friction rather than to unwillingness.
 *
 * Nothing in this shape is sent before the due date: the contract gives a
 * client fourteen days, and a supplier who starts reminding on day two has
 * not given them fourteen days.
 */
export async function sendPaymentChaseEmail(input: {
  to: string;
  contactName: string | null;
  projectName: string;
  label: string;
  invoiceNumber: string | null;
  amountLabel: string;
  subject: string;
  line: string;
  dueLabel: string;
  paymentUrl: string;
  seriouslyLate: boolean;
  /** Carries the open pixel. A chase nobody ever receives is worth knowing about. */
  instalmentId?: string;
}): Promise<SendResult> {
  const bodyHtml = `
    <p>Hi ${esc(input.contactName) || 'there'},</p>
    <p>${esc(input.line)}</p>
    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:18px 20px; margin:20px 0;">
      <p style="margin:0 0 6px 0;"><span style="color:rgba(255,255,255,0.4);">${esc(input.label)}</span>${
        input.invoiceNumber ? ` <span style="color:rgba(255,255,255,0.35);">· ${esc(input.invoiceNumber)}</span>` : ''
      }</p>
      <p style="margin:0 0 6px 0; font-size:22px; font-weight:700; color:#fff;">${esc(input.amountLabel)}</p>
      <p style="margin:0; font-size:13px; color:rgba(255,255,255,0.45);">${esc(input.projectName)} · due ${esc(input.dueLabel)}</p>
    </div>
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">The button below is a fresh payment link — any earlier link we sent has expired, so please use this one. Payment is handled securely by Stripe and we never see or store your card details.</p>
    ${
      input.seriouslyLate
        ? `<p style="font-size:13px; color:rgba(255,255,255,0.5);">If there's a problem with the work or with this invoice, tell us — we'd far rather fix it than keep sending reminders.</p>`
        : `<p style="font-size:13px; color:rgba(255,255,255,0.5);">Already paid? Ignore this — it stops on its own once the payment clears.</p>`
    }
  `;

  return sendEmailDetailed({
    to: input.to,
    subject: input.subject,
    html: renderShell({
      eyebrow: input.seriouslyLate ? 'Overdue' : 'Payment due',
      title: `${input.amountLabel} — ${input.label}`,
      bodyHtml,
      ctaLabel: `Pay ${input.amountLabel}`,
      ctaUrl: input.paymentUrl,
      trackingPixelUrl: input.instalmentId ? openPixelUrl(SITE_URL, input.instalmentId) : null,
    }),
  });
}

/**
 * "Here's the design — tell us by Friday, or we'll take it as a yes."
 *
 * The deadline is stated up front rather than buried, because deemed approval
 * under Section 4 is only fair if the client knew the terms before their
 * silence started counting against them. A client told the date has been
 * treated properly; one who discovers the rule in an invoice has not.
 */
export async function sendDesignPresentedEmail(input: {
  to: string;
  contactName: string | null;
  projectName: string;
  noticeLine: string;
  reviewEndsLabel: string;
  dashboardUrl: string;
  note: string | null;
}): Promise<SendResult> {
  const bodyHtml = `
    <p>Hi ${esc(input.contactName) || 'there'},</p>
    <p>The design for <strong style="color:#fff;">${esc(input.projectName)}</strong> is ready for you to look at.</p>
    ${input.note ? `<p style="border-left:2px solid rgba(125,211,252,0.6); padding-left:16px; color:rgba(255,255,255,0.75);">${esc(input.note)}</p>` : ''}
    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:18px 20px; margin:20px 0;">
      <p style="margin:0 0 4px 0; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:rgba(255,255,255,0.35);">Please review by</p>
      <p style="margin:0; font-size:18px; font-weight:700; color:#fff;">${esc(input.reviewEndsLabel)}</p>
    </div>
    <p style="font-size:13px; color:rgba(255,255,255,0.6);">${esc(input.noticeLine)}</p>
  `;

  return sendEmailDetailed({
    to: input.to,
    subject: `Your design is ready — please review by ${input.reviewEndsLabel}`,
    html: renderShell({
      eyebrow: 'Design review',
      title: `${input.projectName} — ready for your review`,
      bodyHtml,
      ctaLabel: 'See the design',
      ctaUrl: input.dashboardUrl,
    }),
  });
}
