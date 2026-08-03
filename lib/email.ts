import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'info@bothmade.studio';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

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
 * Send email using Resend
 */
export async function sendEmail(data: EmailData): Promise<boolean> {
  try {
    const result = await resend.emails.send({
      from: `${data.fromName || 'Bothmade'} <${CONTACT_EMAIL}>`,
      to: data.to,
      subject: data.subject,
      html: data.html,
      ...(data.replyTo ? { replyTo: data.replyTo } : {}),
      ...(data.attachments ? { attachments: data.attachments } : {}),
    });

    if (result.error) {
      console.error('Resend error:', result.error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Email send failed:', error);
    return false;
  }
}

/**
 * Shared branded shell for every transactional email — dark gradient header,
 * glass-style content card, gradient CTA button, matching the app's visual
 * language instead of the generic black-header boilerplate.
 */
function renderShell(opts: {
  eyebrow?: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  footerAvatarUrl?: string | null;
}): string {
  const { eyebrow, title, bodyHtml, ctaLabel, ctaUrl, footerNote, footerAvatarUrl } = opts;
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
                      ${
                        ctaLabel && ctaUrl
                          ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr><td style="border-radius:10px; background:linear-gradient(90deg,#38bdf8,#a855f7);">
                              <a href="${ctaUrl}" style="display:inline-block; padding:13px 28px; font-size:14px; font-weight:700; color:#05030a; text-decoration:none;">${ctaLabel}</a>
                            </td></tr></table>`
                          : ''
                      }
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
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
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
    serviceType ? `<li style="margin-bottom:4px;"><strong style="color:#fff;">Service:</strong> ${serviceType}</li>` : '',
    timeline ? `<li style="margin-bottom:4px;"><strong style="color:#fff;">Timeline:</strong> ${timeline}</li>` : '',
  ]
    .filter(Boolean)
    .join('');

  const bodyHtml = `
    <p>Hi ${clientName},</p>
    <p>Your project <strong style="color:#fff;">${projectName}</strong> has been created and we're ready to get started.</p>
    ${projectDetails ? `<ul style="padding-left:18px; margin:16px 0;">${projectDetails}</ul>` : ''}
    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:18px 20px; margin:20px 0; font-family:monospace; font-size:14px;">
      <p style="margin:0 0 6px 0;"><span style="color:rgba(255,255,255,0.4);">Email:</span> <span style="color:#fff;">${clientEmail}</span></p>
      <p style="margin:0;"><span style="color:rgba(255,255,255,0.4);">Temporary password:</span> <span style="color:#fff;">${password}</span></p>
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
    <p>Hi ${clientName},</p>
    <p>There's a new update on <strong style="color:#fff;">${projectName}</strong>.</p>
    <div style="background:rgba(255,255,255,0.05); border-left:3px solid #38bdf8; border-radius:8px; padding:16px 18px; margin:20px 0;">
      <p style="margin:0 0 6px 0; font-weight:700; color:#fff;">${updateTitle}</p>
      <p style="margin:0; color:rgba(255,255,255,0.7);">${updateDescription}</p>
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
 * Send new message notification email
 */
export async function sendMessageNotificationEmail(
  clientEmail: string,
  clientName: string,
  projectName: string,
  messagePreview: string,
  projectId: string
): Promise<boolean> {
  const dashboardUrl = `${SITE_URL}/client/${projectId}`;

  const bodyHtml = `
    <p>Hi ${clientName},</p>
    <p>You have a new message from the Bothmade team on <strong style="color:#fff;">${projectName}</strong>.</p>
    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:16px 18px; margin:20px 0; color:rgba(255,255,255,0.75);">
      ${messagePreview}
    </div>
  `;

  return sendEmail({
    to: clientEmail,
    subject: `New message on ${projectName}`,
    html: renderShell({
      eyebrow: 'New message',
      title: projectName,
      bodyHtml,
      ctaLabel: 'View full conversation',
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
  amountLabel: string,
  isDeposit: boolean
): Promise<boolean> {
  const bodyHtml = `
    <p>Hi ${contactName || 'there'},</p>
    <p>Thanks for choosing Bothmade for ${company}'s project. ${
      isDeposit
        ? `Here's a secure link to pay your deposit of <strong style="color:#fff;">${amountLabel}</strong> and get started.`
        : `Here's a secure link to complete your payment of <strong style="color:#fff;">${amountLabel}</strong>.`
    }</p>
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">This link is hosted securely by Stripe — we never see or store your card details.</p>
  `;

  return sendEmail({
    to: toEmail,
    subject: `Your Bothmade payment link${isDeposit ? ' — deposit to get started' : ''}`,
    html: renderShell({
      eyebrow: isDeposit ? 'Deposit due' : 'Payment due',
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
export async function sendSignAndPayEmail(
  toEmail: string,
  contactName: string | null,
  company: string,
  signUrl: string,
  amountLabel: string,
  isDeposit: boolean,
  invoicePdf?: Buffer
): Promise<boolean> {
  const bodyHtml = `
    <p>Hi ${contactName || 'there'},</p>
    <p>Here's everything to get ${company}'s project moving — the agreement to review and a secure place to pay ${
      isDeposit ? `your deposit of <strong style="color:#fff;">${amountLabel}</strong>` : `<strong style="color:#fff;">${amountLabel}</strong>`
    }, all on one page.</p>
    ${invoicePdf ? '<p style="font-size:13px; color:rgba(255,255,255,0.5);">The itemized invoice is attached to this email as a PDF.</p>' : ''}
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">Payment is handled securely by Stripe — we never see or store your card details.</p>
  `;

  return sendEmail({
    to: toEmail,
    subject: `Review & confirm your Bothmade project — ${company}`,
    html: renderShell({
      eyebrow: 'Ready to start',
      title: `${company} — Review & Pay`,
      bodyHtml,
      ctaLabel: 'Review & Pay',
      ctaUrl: signUrl,
    }),
    ...(invoicePdf
      ? { attachments: [{ filename: `${company.replace(/[^a-z0-9]/gi, '-')}-invoice.pdf`, content: invoicePdf }] }
      : {}),
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
    ? `<p>Here's a copy of the current invoice for ${company}, attached as a PDF.</p>`
    : `
      <p>Hi ${contactName || 'there'},</p>
      <p>Here's a copy of your invoice for ${company}'s project, attached as a PDF.</p>
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

/**
 * Notify the internal team the moment a client agrees online — a copy of
 * exactly what they signed, ready for the books.
 */
export async function sendSignedContractCopyEmail(
  toEmails: string[],
  company: string,
  contractUrl: string,
  totalPriceLabel: string
): Promise<boolean> {
  // A signed agreement is the one document every one of the three needs a
  // copy of no matter who else is on the thread.
  const recipients = Array.from(new Set([...toEmails, ...studioInbox()]));
  const bodyHtml = `
    <p><strong style="color:#fff;">${company}</strong> just agreed to their project agreement online (total: ${totalPriceLabel}).</p>
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">A copy is saved below and will also show up on the project once payment clears.</p>
  `;

  return sendEmail({
    to: recipients,
    subject: `Signed: ${company}'s project agreement`,
    html: renderShell({
      eyebrow: 'Contract signed',
      title: `${company} agreed online`,
      bodyHtml,
      ctaLabel: 'View signed copy',
      ctaUrl: contractUrl,
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
