import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';
import { studioInbox } from '@/lib/email';
import { escapeHtml } from '@/lib/html';
import { findSalesRep, notifyRepInboundEnquiry, type SalesRep } from '@/lib/notify';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';

const resend = new Resend(process.env.RESEND_API_KEY);

// The address mail is sent *from*, which has to belong to a domain verified
// in Resend. Where it's sent *to* is studioInbox().
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'info@bothmade.studio';

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

const LIMITS = {
  name: 100,
  email: 254,
  company: 120,
  message: 4000,
} as const;

function isValidEmail(value: string): boolean {
  // Deliberately conservative: no display names, no comments, no newlines.
  return /^[^\s@<>"']+@[^\s@<>"'.]+\.[^\s@<>"']{2,}$/.test(value);
}

interface Enquiry {
  name: string;
  email: string;
  company: string;
  message: string;
  service: Service;
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
    const { name, email, company, message, service, website } = body ?? {};

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
    const cleanMessage = message.trim().slice(0, LIMITS.message);
    const cleanService: Service = isService(service) ? service : 'other';

    if (!isValidEmail(cleanEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

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
          message: cleanMessage,
          service: cleanService,
        },
        rep.id
      );
    } catch (error) {
      console.error('Failed to record contact enquiry as a lead:', error);
    }

    if (!process.env.RESEND_API_KEY) {
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
      message: escapeHtml(cleanMessage),
      service: escapeHtml(SERVICE_LABELS[cleanService]),
    };

    const shell = (inner: string) =>
      `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;">${inner}<hr style="border:none;border-top:1px solid #eee;margin:30px 0;"><p style="color:#999;font-size:12px;">© 2026 Bothmade</p></div>`;

    // Notification to the studio — info@, evan@ and kiana@. Replying goes
    // straight back to whoever wrote in.
    const adminEmail = await resend.emails.send({
      from: CONTACT_EMAIL,
      to: studioInbox(),
      replyTo: cleanEmail,
      subject: `New enquiry — ${cleanName} (${SERVICE_LABELS[cleanService]})`,
      html: shell(
        `<h2 style="color:#000;">New contact form submission</h2>
         <p><strong>Name:</strong> ${safe.name}</p>
         <p><strong>Email:</strong> ${safe.email}</p>
         <p><strong>Company:</strong> ${safe.company}</p>
         <p><strong>Service:</strong> ${safe.service}</p>
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
      from: CONTACT_EMAIL,
      to: cleanEmail,
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
