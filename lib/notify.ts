import { prisma } from './prisma';
import { resolveSiteUrl } from '@/lib/site-url';
import { escMultiline } from '@/lib/html';
import { sendEmail, studioInbox } from './email';
import { escapeHtml, safeUrl } from './html';

/**
 * Read at call time, not at import. A module-level const freezes whatever the
 * environment held when the bundle first loaded, which silently produces
 * localhost links in a deployed build and is invisible until someone clicks one.
 */
function siteUrl(): string {
  return resolveSiteUrl();
}

/**
 * Where the "someone reached out" alert goes when no User row is marked
 * `sales` — a hardcoded address still beats nobody being told. Override
 * with SALES_EMAIL.
 */
function salesFallbackEmail(): string {
  return process.env.SALES_EMAIL || 'evan@bothmade.studio';
}

/** Every admin/team account's email — the audience for internal alerts. */
export async function getAdminEmails(): Promise<string[]> {
  const users = await prisma.user.findMany({ select: { email: true } });
  return users.map((u) => u.email);
}

export interface SalesRep {
  id: string | null;
  email: string;
  name: string | null;
}

/**
 * Whoever works inbound — the `sales` account (Evan). Returns the fallback
 * address with a null id when there is no such row, so the alert still sends
 * even though there is nobody to assign the lead to.
 */
export async function findSalesRep(): Promise<SalesRep> {
  const user = await prisma.user.findFirst({
    where: { role: 'sales' },
    select: { id: true, email: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  return user ?? { id: null, email: salesFallbackEmail(), name: null };
}

/** Same as getAdminEmails() but respects the per-user weekly-digest opt-out. */
export async function getDigestRecipientEmails(): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { weeklyDigestOptOut: false }, select: { email: true } });
  return users.map((u) => u.email);
}

/**
 * `title` and `ctaLabel` are escaped here and `ctaHref` is protocol-checked,
 * so the shell is safe even if a future call site forgets. `bodyHtml` stays
 * raw — it is markup the caller assembles, and every call site below escapes
 * its own interpolations.
 */
const wrap = (rawTitle: string, bodyHtml: string, rawCtaHref?: string, rawCtaLabel?: string) => {
  const title = escapeHtml(rawTitle);
  const ctaHref = safeUrl(rawCtaHref);
  const ctaLabel = escapeHtml(rawCtaLabel || '');
  return `
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
};

/**
 * `alsoStudioInbox` adds the shared addresses on top of the User table.
 * getAdminEmails() only returns accounts that can log in, so info@ — a shared
 * inbox, not a login — is skipped by default. For routine internal digests
 * that's correct; for money it is not.
 */
async function notifyAdmins(
  subject: string,
  html: string,
  opts: { alsoStudioInbox?: boolean } = {}
): Promise<void> {
  const emails = await getAdminEmails();
  const recipients = opts.alsoStudioInbox
    ? Array.from(new Set([...emails, ...studioInbox()]))
    : emails;
  if (recipients.length === 0) return;
  await sendEmail({ to: recipients, subject, html });
}

/**
 * The dialable form of a stored number, for a `tel:` href — digits only, with
 * the leading `+` kept because that is what says which country to dial.
 *
 * The link text keeps the grouping the visitor typed; a rep reads that back
 * down the line, and a bare run of digits is harder to say. Returns '' for
 * anything without enough digits to be a number, so the alert falls back to
 * naming no phone at all rather than offering a link that dials nothing.
 */
function telHref(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (digits.length < 7) return '';
  return `${trimmed.startsWith('+') ? '+' : ''}${digits}`;
}

/**
 * "This client reached out." Sent to the sales rep alone, separately from the
 * shared studio notification, because the two say different things: the group
 * mail is news, this one is an assignment with the lead's page one click away.
 *
 * Every interpolated value here came from a public form, so all of it is
 * escaped — including the company name, which reaches us via the same input.
 */
export async function notifyRepInboundEnquiry(params: {
  toEmail: string;
  repName?: string | null;
  leadId: string;
  contactName: string;
  company: string;
  email: string;
  /** As stored, dial code included. Blank when they didn't leave one. */
  phone?: string | null;
  serviceLabel: string;
  message: string;
  /** True when this address already existed in the pipeline. */
  returning: boolean;
  /** What brought them in, e.g. "the contact form" or "the pricing calculator". */
  via: string;
}): Promise<boolean> {
  const greeting = params.repName ? `${escapeHtml(params.repName)} — ` : '';
  const who = `<strong>${escapeHtml(params.contactName)}</strong> at <strong>${escapeHtml(params.company)}</strong>`;

  const html = wrap(
    params.returning ? 'A lead just reached out again' : 'A new client just reached out',
    `<p>${greeting}${who} came in through ${escapeHtml(params.via)} and is asking about
      <strong>${escapeHtml(params.serviceLabel)}</strong>.</p>
     <p style="margin:0 0 4px;color:#555;">What they wrote:</p>
     <blockquote style="border-left:3px solid #000;padding-left:12px;color:#555;white-space:pre-wrap;">${escapeHtml(
       params.message
     )}</blockquote>
     <p>Reply to them directly at
       <a href="mailto:${encodeURI(params.email)}">${escapeHtml(params.email)}</a>${
         telHref(params.phone)
           ? `, or call <a href="tel:${telHref(params.phone)}">${escapeHtml(params.phone!.trim())}</a>`
           : ''
       }.</p>
     ${
       params.returning
         ? '<p style="color:#555;">This address was already in the pipeline — the message is on their existing lead rather than a new one.</p>'
         : ''
     }`,
    `${siteUrl()}/admin/leads/${encodeURIComponent(params.leadId)}`,
    'Open the lead'
  );

  return sendEmail({
    to: params.toEmail,
    replyTo: params.email,
    subject: `${params.contactName} at ${params.company} just reached out`,
    html,
  });
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
     <blockquote style="border-left:3px solid #000;padding-left:12px;color:#555;">${escMultiline(params.preview)}</blockquote>`,
    `${siteUrl()}/admin/projects/${params.projectId}`,
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
    `${siteUrl()}/admin/projects/${params.projectId}`,
    'View Project'
  );
  // Money is the one event info@ must never miss.
  await notifyAdmins(`Payment received: ${params.projectName}`, html, { alsoStudioInbox: true });
}

/**
 * A care plan just started. Worth the studio inbox for the same reason a
 * project payment is: it's revenue, and it's the one event that turns an
 * offer someone sent into money arriving every month.
 */
export async function notifyAdminsCarePlanStarted(params: {
  projectId: string;
  projectName: string;
  clientCompany: string;
  planLabel: string;
  monthlyLabel: string;
  standardLabel: string;
  freeMonths: number;
}): Promise<void> {
  const html = wrap(
    'Care plan signed',
    `<p><strong>${escapeHtml(params.clientCompany)}</strong> signed up for
      <strong>${escapeHtml(params.planLabel)}</strong> at
      <strong>${escapeHtml(params.monthlyLabel)}/month</strong>.</p>
     <p style="color:#555;">${
       params.freeMonths > 0
         ? `First ${params.freeMonths} month${params.freeMonths === 1 ? '' : 's'} at no charge, then the introductory rate, then `
         : 'Introductory rate for the first year, then '
     }${escapeHtml(params.standardLabel)}/month.</p>`,
    `${siteUrl()}/admin/projects/${params.projectId}`,
    'View Project'
  );
  await notifyAdmins(`Care plan signed: ${params.clientCompany}`, html, { alsoStudioInbox: true });
}

/**
 * A monthly charge was declined. Stripe retries on its own, so this is a
 * heads-up rather than a task — but a silently lapsing plan is revenue nobody
 * notices leaving.
 */
export async function notifyAdminsCarePlanPaymentFailed(params: {
  projectId: string;
  clientCompany: string;
  planLabel: string;
  amountLabel: string;
}): Promise<void> {
  const html = wrap(
    'Care plan payment failed',
    `<p><strong>${escapeHtml(params.clientCompany)}</strong>'s ${escapeHtml(params.amountLabel)} payment for
      <strong>${escapeHtml(params.planLabel)}</strong> was declined. Stripe will retry automatically; the
      client has been emailed a link to update their card.</p>`,
    `${siteUrl()}/admin/projects/${params.projectId}`,
    'View Project'
  );
  await notifyAdmins(`Payment failed: ${params.clientCompany}`, html, { alsoStudioInbox: true });
}

export async function notifyAdminsStaleLeads(
  leads: Array<{ id: string; company: string; daysSinceActivity: number }>
): Promise<void> {
  if (leads.length === 0) return;
  const rows = leads
    .map(
      (l) =>
        `<li><a href="${siteUrl()}/admin/leads/${l.id}">${l.company}</a> — ${l.daysSinceActivity} days since last activity</li>`
    )
    .join('');
  const html = wrap(
    'Leads going cold',
    `<p>These leads haven't had any activity in 5+ days:</p><ul>${rows}</ul>`,
    `${siteUrl()}/admin/sales?view=list`,
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
        `<li><a href="${siteUrl()}/admin/leads/${l.id}">${l.company}</a> — ${
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
    `${siteUrl()}/admin/sales?view=queue`,
    'Open Call List'
  );
  return sendEmail({
    to: toEmail,
    subject: `${leads.length} follow-up${leads.length === 1 ? '' : 's'} due today${overdueCount > 0 ? ` (${overdueCount} overdue)` : ''}`,
    html,
  });
}

/**
 * A client agreed to a Change Order.
 *
 * Worth a notification rather than a dashboard row because signing is the
 * moment the project's price, scope and payment schedule all move at once —
 * and unlike everything else that changes those, nobody on the team did it.
 */
export async function notifyAdminsChangeOrderSigned(params: {
  number: string;
  company: string;
  projectName: string;
  signerName: string;
  deltaCents: number;
  newTotalCents: number;
  projectId: string;
}): Promise<void> {
  const money = (cents: number) =>
    (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const up = params.deltaCents > 0;

  const html = wrap(
    `${params.number} signed`,
    `<p><strong>${escapeHtml(params.signerName)}</strong> at
      <strong>${escapeHtml(params.company)}</strong> signed
      <strong>${escapeHtml(params.number)}</strong> on ${escapeHtml(params.projectName)}.</p>
     <p style="color:#555;">The fee ${up ? 'goes up' : 'comes down'} by
       <strong>${money(Math.abs(params.deltaCents))}</strong>, to
       <strong>${money(params.newTotalCents)}</strong>. Remaining instalments have
       been recalculated.</p>`,
    `${siteUrl()}/admin/projects/${params.projectId}`,
    'View Project'
  );
  await notifyAdmins(`${params.number} signed: ${params.company}`, html, { alsoStudioInbox: true });
}
