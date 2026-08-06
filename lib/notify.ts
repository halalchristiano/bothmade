import { prisma } from './prisma';
import { resolveSiteUrl } from '@/lib/site-url';
import { escMultiline } from '@/lib/html';
import { messageEmailBody, sendEmail, studioInbox } from './email';
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

/**
 * Where a mockup request goes when no `owner` account exists — the person
 * who actually builds them. Override with DESIGN_EMAIL.
 */
function designFallbackEmail(): string {
  return process.env.DESIGN_EMAIL || 'kiana@bothmade.studio';
}

/**
 * Whoever builds the work — the `owner` account (Kiana).
 *
 * The mirror of findSalesRep. A mockup request is a handoff from the person
 * selling to the person making, and until now it produced only an in-app
 * team message: fine if you have the tab open, invisible if you do not, and
 * the request sat in a queue nobody had been told about.
 */
export async function findDesigner(): Promise<SalesRep> {
  const user = await prisma.user.findFirst({
    where: { role: 'owner' },
    select: { id: true, email: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  return user ?? { id: null, email: designFallbackEmail(), name: null };
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

/**
 * A client wrote to us. The whole message travels, for the same reason it
 * does going the other way: a 100-character taste tells you a client is
 * unhappy or waiting on something without telling you which, so the email
 * can't be triaged from a phone and every one of them becomes a trip to the
 * dashboard. Most need no reply at all once you've read them.
 */
export async function notifyAdminsNewClientMessage(params: {
  projectId: string;
  projectName: string;
  clientCompany: string;
  message: string;
}): Promise<void> {
  const { text, truncated } = messageEmailBody(params.message);
  const html = wrap(
    'New client message',
    `<p><strong>${params.clientCompany}</strong> sent a message on <strong>${params.projectName}</strong>:</p>
     <blockquote style="border-left:3px solid #000;padding-left:12px;color:#555;">${escMultiline(text)}</blockquote>
     ${truncated ? '<p style="color:#777;font-size:13px;">Trimmed here — the full message is in the project.</p>' : ''}`,
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

/**
 * A design review period lapsed without the client responding.
 *
 * Section 4 says that approves the design and makes Payment 2 due. It is the
 * one moment in the whole agreement where money becomes payable because of
 * something a client DIDN'T do — so nothing in the ordinary run of a day
 * would ever surface it, and it goes to the studio inbox as well.
 */
export async function notifyAdminsDesignDeemedApproved(params: {
  projectId: string;
  projectName: string;
  company: string;
  presentedAt: Date;
  paymentLabel: string | null;
  amountLabel: string | null;
}): Promise<void> {
  const html = wrap(
    'Design deemed approved',
    `<p><strong>${escapeHtml(params.company)}</strong> never responded to the design on
      ${escapeHtml(params.projectName)}, presented ${escapeHtml(
        params.presentedAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
      )}.</p>
     <p style="color:#555;">The Section 4 review period has lapsed, so the design is approved and
      Build can start.${
        params.paymentLabel
          ? ` <strong>${escapeHtml(params.paymentLabel)}${
              params.amountLabel ? ` (${escapeHtml(params.amountLabel)})` : ''
            }</strong> is now due and has not been invoiced.`
          : ''
      }</p>`,
    `${siteUrl()}/admin/projects/${params.projectId}`,
    'Open Project'
  );
  await notifyAdmins(`Design deemed approved: ${params.company}`, html, { alsoStudioInbox: true });
}

/**
 * A payment is a week past due. Time to pick up the phone.
 *
 * The single most valuable thing the chase schedule produces. Most late B2B
 * payments are administrative — the invoice reached the wrong person, they
 * need a PO number, whoever signs is away — and a call fixes all three in
 * four minutes where another email fixes none of them.
 */
export async function notifyAdminsPaymentNeedsCall(params: {
  projectId: string;
  company: string;
  contactName: string | null;
  phone: string | null;
  label: string;
  amountLabel: string;
  daysPastDue: number;
  chaseCount: number;
}): Promise<void> {
  const html = wrap(
    'Ring them about this one',
    `<p><strong>${escapeHtml(params.company)}</strong> is
      ${params.daysPastDue} days past due on
      <strong>${escapeHtml(params.label)} (${escapeHtml(params.amountLabel)})</strong>, after
      ${params.chaseCount} email${params.chaseCount === 1 ? '' : 's'}.</p>
     <p style="color:#555;">${
       params.phone
         ? `Call ${escapeHtml(params.contactName || params.company)} on <strong>${escapeHtml(params.phone)}</strong>.`
         : 'No phone number on file for them.'
     } Late payments are usually admin rather than refusal — wrong contact, a PO number, somebody away — and a call sorts all of those far faster than another reminder.</p>`,
    `${siteUrl()}/admin/projects/${params.projectId}`,
    'Open Project'
  );
  await notifyAdmins(`Ring ${params.company} — ${params.amountLabel} overdue`, html, {
    alsoStudioInbox: true,
  });
}

/**
 * The client approved their design themselves.
 *
 * Worth knowing the moment it happens rather than at the next dashboard
 * visit: it is the gate that makes Payment 2 due, and it arrives days earlier
 * than the deemed route would have — which is days of cash flow, and an
 * approval that is worth more if it is ever argued about.
 */
export async function notifyAdminsDesignApprovedByClient(params: {
  projectId: string;
  projectName: string;
  company: string;
}): Promise<void> {
  const html = wrap(
    'Design approved',
    `<p><strong>${escapeHtml(params.company)}</strong> approved the design on
      ${escapeHtml(params.projectName)}.</p>
     <p style="color:#555;">Build can start, and Payment 2 is now due — it has not been invoiced
      yet.</p>`,
    `${siteUrl()}/admin/projects/${params.projectId}`,
    'Invoice it'
  );
  await notifyAdmins(`Design approved: ${params.company}`, html);
}

/**
 * The client came back with notes instead of an approval.
 *
 * Sorted the way the agreement prices it, because those three groups want
 * three different responses from us and reading them as one list is how a
 * studio ends up doing paid work for free — or, worse, billing for its own
 * mistake.
 *
 * The new-scope group is flagged here and nowhere the client can see it. Whether
 * something they have asked for gets absorbed or quoted under Section 9 is a
 * judgement about the relationship, and software should neither make that call
 * nor pre-announce it on the studio's behalf.
 */
export async function notifyAdminsDesignFeedback(params: {
  projectId: string;
  projectName: string;
  company: string;
  round: number;
  liked: string | null;
  note: string | null;
  notAsAgreed: Array<{ area: string; detail: string }>;
  changes: Array<{ area: string; detail: string }>;
  newScope: Array<{ area: string; detail: string }>;
  consumedRound: boolean;
  revisionsUsed: number;
  revisionsIncluded: number;
}): Promise<void> {
  const group = (
    title: string,
    colour: string,
    note: string,
    items: Array<{ area: string; detail: string }>
  ) =>
    items.length === 0
      ? ''
      : `<div style="margin:16px 0;">
           <p style="margin:0 0 4px 0;font-weight:700;color:${colour};">${escapeHtml(title)} (${items.length})</p>
           <p style="margin:0 0 8px 0;font-size:13px;color:#777;">${escapeHtml(note)}</p>
           <ul style="margin:0;padding-left:18px;color:#333;">
             ${items
               .map(
                 (i) =>
                   `<li style="margin-bottom:6px;"><strong>${escapeHtml(i.area)}</strong> — ${escMultiline(i.detail)}</li>`
               )
               .join('')}
           </ul>
         </div>`;

  const remaining = Math.max(0, params.revisionsIncluded - params.revisionsUsed);
  const html = wrap(
    'Design feedback',
    `<p><strong>${escapeHtml(params.company)}</strong> sent notes on round ${params.round} of
       ${escapeHtml(params.projectName)} rather than approving it.</p>
     ${
       params.liked
         ? `<div style="margin:16px 0;">
              <p style="margin:0 0 4px 0;font-weight:700;color:#166534;">What's working</p>
              <blockquote style="margin:0;border-left:3px solid #166534;padding-left:12px;color:#555;">${escMultiline(params.liked)}</blockquote>
            </div>`
         : ''
     }
     ${group(
       'Not as agreed',
       '#b45309',
       'Section 4 non-conformance — fix at no charge, and it does not come out of their allowance.',
       params.notAsAgreed
     )}
     ${group(
       'In-scope changes',
       '#1d4ed8',
       'Within the two included rounds. This is the work you owe them.',
       params.changes
     )}
     ${group(
       'New scope',
       '#b91c1c',
       'Not a revision — Section 9. Your call whether to absorb it or quote it. They have not been told either way.',
       params.newScope
     )}
     ${
       params.note
         ? `<div style="margin:16px 0;">
              <p style="margin:0 0 4px 0;font-weight:700;">Anything else</p>
              <blockquote style="margin:0;border-left:3px solid #ccc;padding-left:12px;color:#555;">${escMultiline(params.note)}</blockquote>
            </div>`
         : ''
     }
     <p style="color:#555;">${
       params.consumedRound
         ? `That spends revision ${params.revisionsUsed} of ${params.revisionsIncluded} — ${remaining} left.`
         : `No revision round spent — nothing here was an in-scope preference.`
     }</p>
     <p style="color:#555;">Their review clock has stopped. It restarts when you present the next version.</p>`,
    `${siteUrl()}/admin/projects/${params.projectId}`,
    'Read it in full'
  );
  await notifyAdmins(`Design feedback: ${params.company}`, html);
}

/**
 * The client signed their design direction.
 *
 * Worth an email because it unblocks the most expensive guess in the project.
 * Until this lands, the first concept is built on whatever was said on a
 * call — and if it misses, Section 4 calls that the client's preference and
 * spends one of their two rounds on our misreading. After it lands, a
 * departure from the brief is a non-conformance we fix free.
 */
export async function notifyAdminsDesignDirectionSigned(params: {
  projectId: string;
  projectName: string;
  company: string;
  adjectives: string[];
  likeCount: number;
  dislikeCount: number;
}): Promise<void> {
  const words = params.adjectives.map((a) => escapeHtml(a)).join(' · ');
  const html = wrap(
    'Design direction agreed',
    `<p><strong>${escapeHtml(params.company)}</strong> signed the design direction for
       ${escapeHtml(params.projectName)}.</p>
     ${words ? `<p style="font-size:18px;font-weight:700;">${words}</p>` : ''}
     <p style="color:#555;">${params.likeCount} reference${params.likeCount === 1 ? '' : 's'} they like${
       params.dislikeCount > 0 ? `, ${params.dislikeCount} they don't` : ''
     } — with their reasons.</p>
     <p style="color:#555;">You can design against this now. Anything you present that departs from it
       is ours to correct free under Section 4; a change of mind about the direction itself is one of
       their two rounds.</p>`,
    `${siteUrl()}/admin/projects/${params.projectId}`,
    'Read the brief'
  );
  await notifyAdmins(`Design direction agreed: ${params.company}`, html);
}
