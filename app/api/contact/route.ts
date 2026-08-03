import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';
import { renderShell, studioInbox } from '@/lib/email';
import { sendAsUser } from '@/lib/mailer';
import { escapeHtml } from '@/lib/html';
import { COMPANY_EMAIL, COMPANY_NAME, COMPANY_WEBSITE } from '@/lib/company';
import { findSalesRep, notifyRepInboundEnquiry, type SalesRep } from '@/lib/notify';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';
import {
  FIELD_ERRORS,
  FIELD_LIMITS,
  isValidCompany,
  isValidEmail,
  isValidMessage,
  isValidName,
  isValidPhone,
  normalizePhone,
} from '@/lib/validation';

/**
 * Lazy, for the same reason as lib/email.ts: `new Resend(undefined)` throws,
 * so building it at module scope would make a missing RESEND_API_KEY crash
 * this route on import — taking the CRM write down with it and losing the
 * enquiry entirely, which is the exact failure this route exists to prevent.
 */
let client: Resend | null = null;

function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

// The address mail is sent *from*, which has to belong to a domain verified
// in Resend. Where it's sent *to* is studioInbox().
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'info@bothmade.studio';

/**
 * Sent with a display name, never as a bare address.
 *
 * `CONTACT_EMAIL` is a role mailbox — in production it is `notifications@` —
 * and a bare address makes the client derive the sender name from the local
 * part, so the acknowledgement arrived from a person called "notifications".
 * Reads as a phishing attempt to anyone who did not just fill in the form,
 * and an unrecognised sender name is a spam signal in its own right. Matches
 * the `${fromName} <${address}>` shape lib/email.ts already sends with.
 */
const MAIL_FROM = `${COMPANY_NAME} <${CONTACT_EMAIL}>`;

const SERVICES = ['web', 'ios', 'mac', 'visionpro', 'full-stack', 'other'] as const;

type Service = (typeof SERVICES)[number];

/** Array membership, not `in` — a key like 'constructor' is not a service. */
function isService(value: unknown): value is Service {
  return SERVICES.includes(value as Service);
}

/** Matches the option labels on the form, so the CRM reads back what they picked. */
const SERVICE_LABELS: Record<Service, string> = {
  web: 'Web',
  ios: 'iOS & iPad',
  mac: 'macOS',
  visionpro: 'Vision Pro',
  'full-stack': 'Everything',
  other: 'Something else',
};

/**
 * Optional qualifiers. Both whitelisted the same way as service — anything
 * not on the list is treated as unanswered, never echoed back into email.
 */
const BUDGETS = ['under-3k', '3k-10k', '10k-25k', '25k-plus', 'unsure'] as const;
type Budget = (typeof BUDGETS)[number];

function isBudget(value: unknown): value is Budget {
  return BUDGETS.includes(value as Budget);
}

const BUDGET_LABELS: Record<Budget, string> = {
  'under-3k': 'Under $3k',
  '3k-10k': '$3k – $10k',
  '10k-25k': '$10k – $25k',
  '25k-plus': '$25k+',
  unsure: 'Not sure yet',
};

/**
 * A bracket's floor in cents, for Lead.estimatedValue — the honest number:
 * the deal is worth *at least* this. "Under $3k" and "not sure" stay null
 * rather than pretending to a figure nobody gave us.
 */
const BUDGET_FLOOR_CENTS: Record<Budget, number | null> = {
  'under-3k': null,
  '3k-10k': 300000,
  '10k-25k': 1000000,
  '25k-plus': 2500000,
  unsure: null,
};

const TIMELINES = ['asap', '1-3-months', 'flexible', 'exploring'] as const;
type Timeline = (typeof TIMELINES)[number];

function isTimeline(value: unknown): value is Timeline {
  return TIMELINES.includes(value as Timeline);
}

const TIMELINE_LABELS: Record<Timeline, string> = {
  asap: 'As soon as possible',
  '1-3-months': 'Within 1–3 months',
  flexible: 'Flexible',
  exploring: 'Just exploring',
};

/**
 * Field rules live in lib/validation.ts because the form imports them too. A
 * check only the browser does is decoration — this route is reachable
 * without it — and a check only the server does is a rejection the visitor
 * meets after their message has already left the screen.
 */
const LIMITS = FIELD_LIMITS;

interface Enquiry {
  name: string;
  email: string;
  company: string;
  phone: string;
  message: string;
  service: Service;
  budget: Budget | null;
  timeline: Timeline | null;
}

interface RecordedEnquiry {
  leadId: string;
  /** True when this address was already in the pipeline. */
  returning: boolean;
}

/**
 * Put the enquiry in the CRM. This is the durable record — the emails below
 * are a notification about it, not the thing itself. An inbox is not a
 * pipeline: before this existed, a submission that arrived while nobody was
 * looking left no trace anywhere, and the daily/weekly digest crons (which
 * read the database) never knew it happened.
 *
 * Someone who writes in twice is one lead with two messages, not two leads,
 * so a repeat from a known address becomes an activity on the existing row.
 */
async function recordEnquiry(
  enquiry: Enquiry,
  assignToId: string | null
): Promise<RecordedEnquiry> {
  const detail = [
    `Service requested: ${SERVICE_LABELS[enquiry.service]}`,
    ...(enquiry.budget ? [`Budget: ${BUDGET_LABELS[enquiry.budget]}`] : []),
    ...(enquiry.timeline ? [`Timeline: ${TIMELINE_LABELS[enquiry.timeline]}`] : []),
    ...(enquiry.phone ? [`Phone: ${enquiry.phone}`] : []),
    '',
    enquiry.message,
  ].join('\n');

  const existing = await prisma.lead.findFirst({
    where: { email: enquiry.email },
    select: { id: true },
  });

  if (existing) {
    await prisma.leadActivity.create({
      data: {
        leadId: existing.id,
        type: 'note',
        content: `Contact form submission from bothmade.studio\n\n${detail}`,
      },
    });
    // They came to us — the strongest buying signal there is, and the sales
    // views sort on it. Touch updatedAt so this lead surfaces to the top.
    // Assignment is left alone: whoever already owns this lead keeps it.
    await prisma.lead.update({
      where: { id: existing.id },
      data: { replyReceivedAt: new Date() },
    });
    return { leadId: existing.id, returning: true };
  }

  const lead = await prisma.lead.create({
    data: {
      // `company` is required on Lead but optional on the form; their name is
      // a better placeholder than an empty string in a list of businesses.
      company: enquiry.company || enquiry.name,
      contactName: enquiry.name,
      email: enquiry.email,
      phone: enquiry.phone || null,
      // The floor of their stated bracket — sorts the pipeline honestly
      // without inventing a number they never gave. (On a repeat enquiry the
      // existing row is sales-owned; the new figures ride in on the activity
      // note instead of overwriting.)
      estimatedValue: enquiry.budget ? BUDGET_FLOOR_CENTS[enquiry.budget] : null,
      status: 'new',
      source: 'inbound',
      notes: detail,
      // Unassigned inbound is invisible where it matters: the call list
      // filters to the rep's own leads, and the follow-up digest is built
      // per-assignee. An alert nobody can action is just more mail.
      assignedToId: assignToId,
    },
    select: { id: true },
  });

  return { leadId: lead.id, returning: false };
}

export async function POST(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(
      request,
      'contact',
      RATE_LIMITS.contact,
      'Too many messages. Please try again later.'
    );
    if (limited) return limited;

    const body = await request.json();
    const { name, email, company, phone, message, service, budget, timeline, website } =
      body ?? {};

    // Honeypot: a real person never fills a field they cannot see. Respond 200
    // so bots get no signal that they were caught.
    //
    // Logged because this path is indistinguishable from success on the client
    // — green confirmation, no mail, no record. If a browser's autofill ever
    // starts populating the hidden field, real enquiries would vanish here in
    // total silence and this line is the only way anyone would find out.
    if (typeof website === 'string' && website.trim() !== '') {
      console.warn('Contact form honeypot tripped; discarding submission');
      return NextResponse.json({ message: 'Message received.' }, { status: 200 });
    }

    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof message !== 'string' ||
      !name.trim() ||
      !email.trim() ||
      !message.trim()
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const cleanName = name.trim().slice(0, LIMITS.name);
    const cleanEmail = email.trim().slice(0, LIMITS.email);
    const cleanCompany =
      typeof company === 'string' ? company.trim().slice(0, LIMITS.company) : '';
    const rawPhone = typeof phone === 'string' ? phone.trim().slice(0, LIMITS.phone) : '';
    const cleanMessage = message.trim().slice(0, LIMITS.message);
    const cleanService: Service = isService(service) ? service : 'other';
    // Optional qualifiers: unrecognized values mean "unanswered", not an error.
    const cleanBudget: Budget | null = isBudget(budget) ? budget : null;
    const cleanTimeline: Timeline | null = isTimeline(timeline) ? timeline : null;

    // The same predicates the form runs, so a submission the browser would
    // have stopped is stopped here too. Each answer names the field it came
    // from; "invalid input" tells a visitor whose form state was lost
    // nothing about what to change.
    //
    // Phone and company may be blank — an enquiry without a number is still
    // an enquiry — but a number that *is* given has to be dialable, or a rep
    // only discovers otherwise on the call that fails.
    const invalid = (
      [
        [!isValidName(cleanName), FIELD_ERRORS.name],
        [!isValidEmail(cleanEmail), FIELD_ERRORS.email],
        [Boolean(rawPhone) && !isValidPhone(rawPhone), FIELD_ERRORS.phone],
        [!isValidCompany(cleanCompany), FIELD_ERRORS.company],
        [!isValidMessage(cleanMessage), FIELD_ERRORS.message],
      ] as [boolean, string][]
    ).find(([failed]) => failed);

    if (invalid) {
      return NextResponse.json({ error: invalid[1] }, { status: 400 });
    }

    const cleanPhone = rawPhone ? normalizePhone(rawPhone) : '';

    // Capture before notifying. If the mail leg fails the enquiry is still
    // in the pipeline; if this leg fails we can still fall back to email.
    // Losing both is the only outcome the visitor needs to hear about.
    let recorded: RecordedEnquiry | null = null;
    let rep: SalesRep | null = null;
    try {
      rep = await findSalesRep();
      recorded = await recordEnquiry(
        {
          name: cleanName,
          email: cleanEmail,
          company: cleanCompany,
          phone: cleanPhone,
          message: cleanMessage,
          service: cleanService,
          budget: cleanBudget,
          timeline: cleanTimeline,
        },
        rep.id
      );
    } catch (error) {
      console.error('Failed to record contact enquiry as a lead:', error);
    }

    const resend = resendClient();
    if (!resend) {
      console.error('RESEND_API_KEY not configured');
      if (recorded) {
        return NextResponse.json(
          { message: "Message received! We'll get back to you soon." },
          { status: 200 }
        );
      }
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    const safe = {
      name: escapeHtml(cleanName),
      email: escapeHtml(cleanEmail),
      company: escapeHtml(cleanCompany || 'Not provided'),
      phone: escapeHtml(cleanPhone || 'Not provided'),
      message: escapeHtml(cleanMessage),
      service: escapeHtml(SERVICE_LABELS[cleanService]),
      budget: escapeHtml(cleanBudget ? BUDGET_LABELS[cleanBudget] : 'Not provided'),
      timeline: escapeHtml(cleanTimeline ? TIMELINE_LABELS[cleanTimeline] : 'Not provided'),
    };

    // These two used to render through a bespoke inline wrapper — a bare
    // white div with "© 2026 Bothmade" under a rule — which is why the
    // acknowledgement read as a phishing attempt. renderShell() is the
    // wrapper every other email on the site already uses, including all of
    // EMAIL_TEMPLATES: the wordmark, the gradient header, the card, and a
    // footer carrying the company name and postal address from
    // lib/company.ts. There was never a reason for this route to have its
    // own.

    // Notification to the studio — info@, evan@ and kiana@. Replying goes
    // straight back to whoever wrote in.
    /**
     * One message per recipient, not one message addressed to all of them.
     *
     * This mail carries `replyTo: <the customer>`, and it used to put the
     * whole studio in a single `To:` header — so one Reply-all from any of
     * us sent the customer a message with every internal address visible in
     * it. Nobody has to be dropped from the list to close that: addressed
     * individually, each copy names only its own recipient, and Reply-all
     * can't reveal an address it was never given.
     */
    const notifications = await Promise.all(
      studioInbox().map((recipient) =>
        resend.emails.send({
          from: MAIL_FROM,
          to: recipient,
          replyTo: cleanEmail,
          subject: `New enquiry — ${cleanName} (${SERVICE_LABELS[cleanService]})`,
      html: renderShell({
        eyebrow: 'New enquiry',
        title: `${cleanName}${cleanCompany ? ` — ${cleanCompany}` : ''}`,
        bodyHtml:
          `<p style="margin:0 0 4px;"><strong style="color:#fff;">Email:</strong> ${safe.email}</p>
           <p style="margin:0 0 4px;"><strong style="color:#fff;">Phone:</strong> ${safe.phone}</p>
           <p style="margin:0 0 4px;"><strong style="color:#fff;">Company:</strong> ${safe.company}</p>
           <p style="margin:0 0 4px;"><strong style="color:#fff;">Service:</strong> ${safe.service}</p>
           <p style="margin:0 0 4px;"><strong style="color:#fff;">Budget:</strong> ${safe.budget}</p>
           <p style="margin:0 0 20px;"><strong style="color:#fff;">Timeline:</strong> ${safe.timeline}</p>
           <p style="margin:0 0 6px; color:#fff; font-weight:700;">Message</p>
           <p style="margin:0; white-space:pre-wrap;">${safe.message}</p>`,
          }),
        })
      )
    );

    // One address bouncing is not the same as nobody being told, so this
    // only counts as a failure when every copy failed.
    const notificationFailures = notifications.filter((result) => result.error);
    if (notificationFailures.length > 0) {
      console.error(
        `Admin notification failed for ${notificationFailures.length}/${notifications.length} recipients:`,
        notificationFailures[0].error
      );
      // Only a dead end if nobody heard and the CRM write failed too.
      if (!recorded && notificationFailures.length === notifications.length) {
        return NextResponse.json({ error: 'Failed to send message.' }, { status: 502 });
      }
    }

    // Evan specifically: this client reached out, the lead is yours, here it
    // is. Separate from the group mail above, which is only news — this one
    // links straight to the lead and matches the assignment just made.
    // Needs the lead id, so it can only go out if the CRM write succeeded.
    if (recorded && rep) {
      const alert = {
        repName: rep.name,
        leadId: recorded.leadId,
        contactName: cleanName,
        company: cleanCompany || cleanName,
        email: cleanEmail,
        serviceLabel: SERVICE_LABELS[cleanService],
        message: cleanMessage,
        returning: recorded.returning,
        via: 'the contact form',
      };

      // The rep gets it, and the shared inbox gets its own copy — this is
      // the version worth having, since it links to the lead rather than
      // merely restating the form. Two separate sends rather than one mail
      // addressed to both: this alert also replies to the customer, so a
      // shared To: would put the other internal address in front of them
      // the first time anyone hit Reply-all.
      const [sent, copied] = await Promise.all([
        notifyRepInboundEnquiry({ ...alert, toEmail: rep.email }),
        notifyRepInboundEnquiry({ ...alert, toEmail: COMPANY_EMAIL }),
      ]);
      if (!sent) {
        console.error(`Sales alert to ${rep.email} failed for lead ${recorded.leadId}`);
      }
      if (!copied) {
        console.error(`Sales alert copy to ${COMPANY_EMAIL} failed for lead ${recorded.leadId}`);
      }
    }

    // Acknowledgement to the sender. Best-effort: if it bounces, the enquiry
    // still reached the studio, so don't fail the request over it.
    /**
     * Sent *as* info@, not merely with info@ in the From line.
     *
     * sendAsUser prefers domain-wide delegation, which hands the message to
     * Gmail as the real Workspace user — so it lands in info@'s own Sent
     * folder and the thread is there when the customer replies, exactly as
     * if someone had typed it. A Resend send would be invisible to that
     * mailbox: the reply arrives with no outgoing message to attach to.
     *
     * Falls back to Resend when delegation isn't configured, which still
     * gets the acknowledgement out — it just won't be in Sent.
     */
    const ack = await sendAsUser(
      {
        name: COMPANY_NAME,
        email: COMPANY_EMAIL,
        gmailAddress: null,
        gmailAppPassword: null,
      },
      {
        to: cleanEmail,
        subject: 'We received your message',
        html: renderShell({
          eyebrow: 'Message received',
          title: 'Thanks for reaching out',
          bodyHtml:
            `<p style="margin:0 0 14px;">Hi ${safe.name},</p>
             <p style="margin:0;">
               We've received your message and will get back to you within 24 hours.
               You can reply directly to this email if you'd like to add anything.
             </p>`,
          footerNote: `${COMPANY_NAME} — ${COMPANY_WEBSITE}`,
        }),
      }
    );

    if (!ack.ok) {
      console.error('Acknowledgement email failed');
    } else if (ack.sentVia === 'resend') {
      // Worth knowing: the customer got the mail, but info@ has no record of
      // having sent it, so a reply will look like it came out of nowhere.
      console.warn('Acknowledgement sent via Resend — not in the info@ Sent folder');
    }

    return NextResponse.json(
      { message: "Message received! We'll get back to you soon." },
      { status: 200 }
    );
  } catch (error) {
    console.error('Contact form error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
