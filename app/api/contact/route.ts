import { NextRequest, NextResponse } from 'next/server';
import {
  clientKey,
  getResend,
  createRateLimiter,
  emailShell,
  escapeHtml,
  isValidEmail,
  mailFrom,
  studioInbox,
} from '@/lib/server';

const SERVICES = ['web', 'ios', 'mac', 'visionpro', 'full-stack', 'other'] as const;

const LIMITS = {
  name: 100,
  email: 254,
  company: 120,
  message: 4000,
} as const;

const isRateLimited = createRateLimiter({ max: 3, windowMs: 10 * 60 * 1000 });

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(clientKey(request))) {
      return NextResponse.json(
        { error: 'Too many messages. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { name, email, company, message, service, website } = body ?? {};

    // Honeypot: a real person never fills a field they cannot see. Respond 200
    // so bots get no signal that they were caught.
    if (typeof website === 'string' && website.trim() !== '') {
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
    const cleanService = SERVICES.includes(service) ? service : 'other';

    if (!isValidEmail(cleanEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    const safe = {
      name: escapeHtml(cleanName),
      email: escapeHtml(cleanEmail),
      company: escapeHtml(cleanCompany || 'Not provided'),
      message: escapeHtml(cleanMessage),
      service: escapeHtml(cleanService),
    };

    // Notification to the studio. This one always matters most, so it is sent
    // first and its failure is what determines the response.
    const adminEmail = await getResend().emails.send({
      from: mailFrom(),
      to: studioInbox(),
      replyTo: cleanEmail,
      subject: `New enquiry — ${cleanName} (${cleanService})`,
      html: emailShell(
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
      return NextResponse.json({ error: 'Failed to send message.' }, { status: 502 });
    }

    // Acknowledgement to the sender. Best-effort: if it bounces, the enquiry
    // still reached the studio, so don't fail the request over it.
    const ackEmail = await getResend().emails.send({
      from: mailFrom(),
      to: cleanEmail,
      replyTo: studioInbox(),
      subject: 'We received your message',
      html: emailShell(
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
