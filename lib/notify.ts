import { prisma } from './prisma';
import { sendEmail } from './email';
import { escapeHtml } from './html';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

/**
 * A money-path email that did not send.
 *
 * `sendEmail` returns false rather than throwing, which is the right call
 * for a newsletter and the wrong one for a welcome email carrying the only
 * copy of a client's temporary password. Those failures were being
 * discarded at the call site — the client never got their login, and
 * nobody found out until they emailed asking why. This escalates to the
 * team instead, with enough detail to send it again by hand.
 *
 * Deliberately best-effort and never throwing: it is called from inside
 * webhook handlers, where an exception means Stripe retries a delivery
 * that already succeeded.
 */
export async function alertEmailDeliveryFailure(params: {
  /** What failed to send, in plain words: "welcome email", "payment receipt". */
  kind: string;
  recipient: string;
  /** Anything needed to resend it — project name, amount, company. */
  context: Record<string, string | number | null | undefined>;
}): Promise<void> {
  try {
    console.error(
      `[email-failure] ${params.kind} → ${params.recipient}`,
      JSON.stringify(params.context)
    );

    const admins = await getAdminEmails();
    if (admins.length === 0) return;

    const rows = Object.entries(params.context)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 12px 4px 0; color:#666;">${escapeHtml(k)}</td><td style="padding:4px 0;"><strong>${escapeHtml(v)}</strong></td></tr>`
      )
      .join('');

    await sendEmail({
      to: admins,
      subject: `⚠️ Failed to send ${params.kind} to ${params.recipient}`,
      html: wrap(
        'An email on the money path did not send',
        `<p>A <strong>${escapeHtml(params.kind)}</strong> to <strong>${escapeHtml(params.recipient)}</strong> failed to deliver. The underlying action (payment, project creation) still went through — only the email did not.</p>
         <p><strong>Send this one by hand.</strong> Details:</p>
         <table cellpadding="0" cellspacing="0">${rows}</table>`
      ),
    });
  } catch (error) {
    // If the alert itself can't send, the console line above is the record.
    console.error('Failed to raise email-delivery alert:', error);
  }
}

/** Every admin/team account's email — the audience for internal alerts. */
export async function getAdminEmails(): Promise<string[]> {
  const users = await prisma.user.findMany({ select: { email: true } });
  return users.map((u) => u.email);
}

/** Same as getAdminEmails() but respects the per-user weekly-digest opt-out. */
export async function getDigestRecipientEmails(): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { weeklyDigestOptOut: false }, select: { email: true } });
  return users.map((u) => u.email);
}

const wrap = (title: string, bodyHtml: string, ctaHref?: string, ctaLabel?: string) => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: #000; color: #fff; padding: 20px; border-radius: 8px 8px 0 0; }
      .content { background: #f9f9f9; padding: 30px 20px; border-radius: 0 0 8px 8px; }
      .button { display: inline-block; background: #000; color: #fff; padding: 10px 24px; text-decoration: none; border-radius: 4px; margin: 16px 0; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header"><h2 style="margin:0;">${title}</h2></div>
      <div class="content">
        ${bodyHtml}
        ${ctaHref ? `<p><a href="${ctaHref}" class="button">${ctaLabel || 'View in Dashboard'}</a></p>` : ''}
      </div>
    </div>
  </body>
</html>`;

async function notifyAdmins(subject: string, html: string): Promise<void> {
  const emails = await getAdminEmails();
  if (emails.length === 0) return;
  await sendEmail({ to: emails, subject, html });
}

export async function notifyAdminsNewClientMessage(params: {
  projectId: string;
  projectName: string;
  clientCompany: string;
  preview: string;
}): Promise<void> {
  const html = wrap(
    'New client message',
    `<p><strong>${params.clientCompany}</strong> sent a message on <strong>${params.projectName}</strong>:</p>
     <blockquote style="border-left:3px solid #000;padding-left:12px;color:#555;">${params.preview}</blockquote>`,
    `${SITE_URL}/admin/projects/${params.projectId}`,
    'Reply'
  );
  await notifyAdmins(`New message: ${params.projectName}`, html);
}

export async function notifyAdminsPaymentReceived(params: {
  projectId: string;
  projectName: string;
  clientCompany: string;
  amountLabel: string;
}): Promise<void> {
  const html = wrap(
    'Payment received',
    `<p><strong>${params.clientCompany}</strong> paid <strong>${params.amountLabel}</strong> for <strong>${params.projectName}</strong>.</p>`,
    `${SITE_URL}/admin/projects/${params.projectId}`,
    'View Project'
  );
  await notifyAdmins(`Payment received: ${params.projectName}`, html);
}

/**
 * @param recipients Who to send to. Defaults to the whole team, which is
 *   only right for unassigned leads — an assigned lead's digest goes to the
 *   person who owns it, so the mail is all their work rather than mostly
 *   somebody else's.
 */
export async function notifyAdminsStaleLeads(
  leads: Array<{ id: string; company: string; daysSinceActivity: number }>,
  recipients?: string[]
): Promise<void> {
  if (leads.length === 0) return;
  const rows = leads
    .map(
      (l) =>
        `<li><a href="${SITE_URL}/admin/leads/${l.id}">${escapeHtml(l.company)}</a> — ${l.daysSinceActivity} days since last activity</li>`
    )
    .join('');
  const html = wrap(
    'Leads going cold',
    `<p>These leads haven't had any activity in 5+ days:</p><ul>${rows}</ul>`,
    `${SITE_URL}/admin/leads`,
    'View Leads'
  );
  const subject = `${leads.length} lead${leads.length === 1 ? '' : 's'} going cold`;

  if (recipients && recipients.length > 0) {
    await sendEmail({ to: recipients, subject, html });
    return;
  }
  await notifyAdmins(subject, html);
}

/**
 * One personalized email per rep, listing just their own overdue/due-today
 * follow-ups — sent daily so a slipped follow-up shows up somewhere besides
 * a dashboard widget nobody's looking at that morning.
 */
export async function notifyUserFollowUpDigest(
  toEmail: string,
  leads: Array<{ id: string; company: string; nextFollowUpAt: Date; overdue: boolean }>
): Promise<boolean> {
  if (leads.length === 0) return false;
  const rows = leads
    .map(
      (l) =>
        `<li><a href="${SITE_URL}/admin/leads/${l.id}">${l.company}</a> — ${
          l.overdue ? `overdue since ${l.nextFollowUpAt.toLocaleDateString()}` : 'due today'
        }</li>`
    )
    .join('');
  const overdueCount = leads.filter((l) => l.overdue).length;
  const html = wrap(
    "Today's follow-ups",
    `<p>You have ${leads.length} follow-up${leads.length === 1 ? '' : 's'} due${
      overdueCount > 0 ? `, ${overdueCount} of them overdue` : ''
    }:</p><ul>${rows}</ul>`,
    `${SITE_URL}/admin/call-list`,
    'Open Call List'
  );
  return sendEmail({
    to: toEmail,
    subject: `${leads.length} follow-up${leads.length === 1 ? '' : 's'} due today${overdueCount > 0 ? ` (${overdueCount} overdue)` : ''}`,
    html,
  });
}
