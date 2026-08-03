import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';
import { studioInbox } from '@/lib/email';
import { escapeHtml } from '@/lib/html';
import {
  COMPANY_ADDRESS_INLINE,
  COMPANY_EMAIL,
  COMPANY_NAME,
  COMPANY_WEBSITE,
} from '@/lib/company';
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

    /**
     * The footer is not decoration. A transactional email with no postal
     * address, no domain and no route to a human is the exact shape of a
     * phishing attempt — recipients read it that way, and so do spam
     * filters, which treat a verifiable sender identity as a positive
     * signal. All of it comes from lib/company.ts, so the address here can
     * never drift from the one on the invoices and the site footer.
     */
    const shell = (inner: string) =>
      `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;color:#111;">
         ${inner}
         <hr style="border:none;border-top:1px solid #eee;margin:30px 0;">
         <p style="color:#111;font-size:13px;font-weight:600;margin:0 0 6px;">${COMPANY_NAME}</p>
         <p style="color:#999;font-size:12px;line-height:1.6;margin:0;">
           ${escapeHtml(COMPANY_ADDRESS_INLINE)}<br>
           <a href="mailto:${COMPANY_EMAIL}" style="color:#666;">${COMPANY_EMAIL}</a>
           &nbsp;·&nbsp;
           <a href="https://${COMPANY_WEBSITE}" style="color:#666;">${COMPANY_WEBSITE}</a>
         </p>
         <p style="color:#bbb;font-size:11px;margin:14px 0 0;">
           You're receiving this because you sent us a message at ${COMPANY_WEBSITE}.
         </p>
       </div>`;

    // Notification to the studio — info@, evan@ and kiana@. Replying goes
    // straight back to whoever wrote in.
    const adminEmail = await resend.emails.send({
      from: MAIL_FROM,
      to: studioInbox(),
      replyTo: cleanEmail,
      subject: `New enquiry — ${cleanName} (${SERVICE_LABELS[cleanService]})`,
      html: shell(
        `<h2 style="color:#000;">New contact form submission</h2>
         <p><strong>Name:</strong> ${safe.name}</p>
         <p><strong>Email:</strong> ${safe.email}</p>
         <p><strong>Phone:</strong> ${safe.phone}</p>
         <p><strong>Company:</strong> ${safe.company}</p>
         <p><strong>Service:</strong> ${safe.service}</p>
         <p><strong>Budget:</strong> ${safe.budget}</p>
         <p><strong>Timeline:</strong> ${safe.timeline}</p>
         <h3 style="color:#000;margin-top:20px;">Message</h3>
         <p style="color:#666;white-space:pre-wrap;line-height:1.6;">${safe.message}</p>`
      ),
    });

    if (adminEmail.error) {
      console.error('Admin notification failed:', adminEmail.error);
      // Only a dead end if the CRM write failed too.
      if (!recorded) {
        return NextResponse.json({ error: 'Failed to send message.' }, { status: 502 });
      }
    }

    // Evan specifically: this client reached out, the lead is yours, here it
    // is. Separate from the group mail above, which is only news — this one
    // links straight to the lead and matches the assignment just made.
    // Needs the lead id, so it can only go out if the CRM write succeeded.
    if (recorded && rep) {
      const sent = await notifyRepInboundEnquiry({
        toEmail: rep.email,
        repName: rep.name,
        leadId: recorded.leadId,
        contactName: cleanName,
        company: cleanCompany || cleanName,
        email: cleanEmail,
        serviceLabel: SERVICE_LABELS[cleanService],
        message: cleanMessage,
        returning: recorded.returning,
        via: 'the contact form',
      });
      if (!sent) {
        console.error(`Sales alert to ${rep.email} failed for lead ${recorded.leadId}`);
      }
    }

    // Acknowledgement to the sender. Best-effort: if it bounces, the enquiry
    // still reached the studio, so don't fail the request over it.
    const ackEmail = await resend.emails.send({
      from: MAIL_FROM,
      to: cleanEmail,
      // The body invites a reply. Without this it goes to CONTACT_EMAIL —
      // `notifications@` in production, which nobody reads — so the
      // invitation was a dead end. Send replies where the studio is looking.
      replyTo: COMPANY_EMAIL,
      subject: 'We received your message',
      html: shell(
        `<h2 style="color:#000;">Thanks for reaching out</h2>
         <p style="color:#666;line-height:1.6;">
           Hi ${safe.name},<br/><br/>
           We've received your message and will get back to you within 24 hours.
           You can reply directly to this email if you'd like to add anything.
         </p>`
      ),
    });

    if (ackEmail.error) {
      console.error('Acknowledgement email failed:', ackEmail.error);
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
