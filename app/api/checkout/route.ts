import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/stripe';
import {
  isAddOnKey,
  isBaseService,
  isClientType,
  isTimelineKey,
} from '@/lib/pricing';

export async function POST(request: NextRequest) {
  try {
    const {
      baseService,
      addOns = [],
      clientType,
      timeline,
      clientEmail,
      company,
      contactName,
      phone,
    } = await request.json();

    if (!clientEmail || !company) {
      return NextResponse.json(
        { error: 'Email and company are required' },
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
    const successUrl = `${siteUrl}/checkout/success?type=welcome&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${siteUrl}/start`;

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
