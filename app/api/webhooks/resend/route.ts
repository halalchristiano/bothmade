import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { suppress } from '@/lib/compliance';

/**
 * Resend delivery events.
 *
 * Bounce and complaint handling was entirely pull-based: a nightly Gmail
 * scan looking for delivery-failure notices in the rep's own inbox. That
 * only ever saw failures for mail sent *from* that mailbox, only found them
 * once a day, and saw nothing at all for the shared Resend sender — which
 * is what every transactional email and every fallback send goes through.
 *
 * Spam complaints were invisible entirely. A complaint is the single most
 * damaging signal a sender can accumulate, and continuing to mail someone
 * who has pressed "report spam" is both the fastest way to wreck a domain's
 * reputation and, once they've asked us to stop, not something to keep
 * doing anyway.
 *
 * Configure at resend.com → Webhooks, pointing at /api/webhooks/resend,
 * with RESEND_WEBHOOK_SECRET set to the signing secret it gives you.
 */

/** Events that mean "never send to this address again". */
const SUPPRESSING_EVENTS: Record<string, 'bounce' | 'complaint'> = {
  'email.bounced': 'bounce',
  'email.complained': 'complaint',
};

/**
 * Svix-style signature check, which is what Resend uses.
 *
 * Verified before the body is trusted for anything: this endpoint takes
 * unauthenticated input and turns it into "stop emailing this person",
 * which is a lovely denial-of-service primitive if anyone can post to it.
 */
function verifySignature(request: NextRequest, rawBody: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  // Fail closed. An unverifiable webhook is not a webhook.
  if (!secret) {
    console.error('RESEND_WEBHOOK_SECRET is not set — rejecting delivery event.');
    return false;
  }

  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signatureHeader = request.headers.get('svix-signature');
  if (!id || !timestamp || !signatureHeader) return false;

  // Bound replay: a captured request can't be re-sent days later.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 5 * 60) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  // The header carries a space-separated list of "v1,<sig>" pairs.
  return signatureHeader
    .split(' ')
    .map((part) => part.split(',')[1])
    .filter(Boolean)
    .some((candidate) => {
      const a = Buffer.from(candidate);
      const b = Buffer.from(expected);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifySignature(request, rawBody)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const event = JSON.parse(rawBody) as {
      type?: string;
      data?: { to?: string | string[]; email?: string; bounce?: { message?: string } };
    };

    const reason = SUPPRESSING_EVENTS[event.type ?? ''];
    if (!reason) {
      // Deliveries, opens, clicks. Acknowledge so Resend stops retrying.
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const recipients = [
      ...(Array.isArray(event.data?.to) ? event.data.to : event.data?.to ? [event.data.to] : []),
      ...(event.data?.email ? [event.data.email] : []),
    ]
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (recipients.length === 0) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const detail =
      reason === 'complaint'
        ? 'Marked as spam by the recipient'
        : event.data?.bounce?.message?.slice(0, 200) || 'Hard bounce reported by Resend';

    for (const email of recipients) {
      await suppress(email, reason, 'resend-webhook');

      // Also flag the CRM row, so the lead surfaces on the "couldn't reach
      // — call instead" list rather than sitting in the ready-to-send count
      // waiting to burn more reputation.
      await prisma.lead
        .updateMany({
          where: { email: { equals: email, mode: 'insensitive' } },
          data: { emailDeliveryFailedAt: new Date(), emailDeliveryFailedReason: detail },
        })
        .catch((error) => console.error('Failed to flag lead after delivery event:', error));
    }

    return NextResponse.json({ received: true, suppressed: recipients.length }, { status: 200 });
  } catch (error) {
    console.error('Resend webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
