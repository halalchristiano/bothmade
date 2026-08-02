import { prisma } from './prisma';
import { sendEmail } from './email';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

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

export async function notifyAdminsStaleLeads(
  leads: Array<{ id: string; company: string; daysSinceActivity: number }>
): Promise<void> {
  if (leads.length === 0) return;
  const rows = leads
    .map(
      (l) =>
        `<li><a href="${SITE_URL}/admin/leads/${l.id}">${l.company}</a> — ${l.daysSinceActivity} days since last activity</li>`
    )
    .join('');
  const html = wrap(
    'Leads going cold',
    `<p>These leads haven't had any activity in 5+ days:</p><ul>${rows}</ul>`,
    `${SITE_URL}/admin/leads`,
    'View Leads'
  );
  await notifyAdmins(`${leads.length} lead${leads.length === 1 ? '' : 's'} going cold`, html);
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
