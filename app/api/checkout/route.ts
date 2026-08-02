import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/stripe';
import { recordInboundLead } from '@/lib/inbound-leads';
import {
  isAddOnKey,
  isBaseService,
  isClientType,
  isTimelineKey,
} from '@/lib/pricing';

const LIMITS = { name: 100, email: 254, company: 120, phone: 40 } as const;

/** Trims and bounds a free-text field; anything non-string becomes ''. */
function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Same conservative shape /api/contact accepts — no display names, no newlines. */
function isValidEmail(value: string): boolean {
  return /^[^\s@<>"']+@[^\s@<>"'.]+\.[^\s@<>"']{2,}$/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { baseService, addOns = [], clientType, timeline } = body ?? {};

    // Now persisted as a CRM lead as well as sent to Stripe, so the contact
    // fields get bounded and format-checked rather than forwarded on trust.
    const clientEmail = str(body?.clientEmail, LIMITS.email);
    const company = str(body?.company, LIMITS.company);
    const contactName = str(body?.contactName, LIMITS.name);
    const phone = str(body?.phone, LIMITS.phone);

    if (!clientEmail || !company) {
      return NextResponse.json(
        { error: 'Email and company are required' },
        { status: 400 }
      );
    }

    if (!isValidEmail(clientEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    if (typeof baseService !== 'string' || !isBaseService(baseService)) {
      return NextResponse.json(
        { error: 'Invalid base service' },
        { status: 400 }
      );
    }

    if (typeof clientType !== 'string' || !isClientType(clientType)) {
      return NextResponse.json(
        { error: 'Invalid client type' },
        { status: 400 }
      );
    }

    if (typeof timeline !== 'string' || !isTimelineKey(timeline)) {
      return NextResponse.json(
        { error: 'Invalid timeline' },
        { status: 400 }
      );
    }

    if (!Array.isArray(addOns) || !addOns.every((a) => typeof a === 'string' && isAddOnKey(a))) {
      return NextResponse.json(
        { error: 'Invalid add-ons' },
        { status: 400 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const successUrl = `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${siteUrl}/start`;

    // Record the lead BEFORE handing off to Stripe. Everything past this line
    // happens on Stripe's domain, so this is genuinely the last moment we
    // hear from someone who then abandons the card form — and abandoned
    // checkouts were previously leaving no trace at all, which meant the
    // people closest to buying were the only ones nobody could follow up
    // with. Deliberately non-blocking: a CRM write must never be the reason
    // a paying customer can't reach checkout.
    const leadId = await recordInboundLead({
      contact: { email: clientEmail, company, contactName, phone },
      config: { baseService, addOns, clientType, timeline },
      status: 'deposit_pending',
      source: 'inbound-checkout',
      note: 'Reached Stripe checkout from the public /start calculator. Marked won automatically if the payment lands — if it stays here, the checkout was abandoned and is worth a call.',
    });

    const session = await createCheckoutSession(
      {
        baseService,
        addOns,
        clientType,
        timeline,
        clientEmail,
        company,
        contactName,
        phone,
        ...(leadId ? { leadId } : {}),
      },
      successUrl,
      cancelUrl
    );

    if (!session) {
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        sessionId: session.sessionId,
        redirectUrl: session.url,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
