import { NextRequest, NextResponse } from 'next/server';
import { resolveSiteUrl } from '@/lib/site-url';
import { createCheckoutSession } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { findSalesRep } from '@/lib/notify';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
  formatCents,
  isAddOnKey,
  isBaseService,
  isClientType,
  isTimelineKey,
  type AddOnKey,
  type BaseService,
  type ClientType,
  type TimelineKey,
} from '@/lib/pricing';

/**
 * Record the attempt before handing off to Stripe.
 *
 * Someone who configured a project and reached for their card is the highest
 * intent the site ever sees, and until this existed the ones who hesitated on
 * the Stripe page left nothing at all behind — no row, no mail, no name. The
 * ones who paid were fine; the ones who nearly did were invisible.
 *
 * Status stays `new` deliberately. `deposit_pending` describes this better in
 * English, but it carries a 0.95 weight in the sales forecast, so an idle
 * click would book itself as near-certain revenue. The intent lives in
 * `source` and `notes`, where it informs a human without moving a number.
 *
 * Returns the lead id to thread through Stripe metadata, or null if the write
 * failed — checkout must not be blocked by the CRM being unavailable.
 */
async function recordCheckoutAttempt(params: {
  email: string;
  company: string;
  contactName?: string;
  phone?: string;
  baseService: BaseService;
  addOns: AddOnKey[];
  clientType: ClientType;
  timeline: TimelineKey;
  totalPrice: number;
}): Promise<string | null> {
  try {
    const summary = [
      `Reached Stripe checkout for ${formatCents(params.totalPrice)}.`,
      `Service: ${BASE_SERVICES[params.baseService].label}`,
      `Add-ons: ${params.addOns.map((key) => ADD_ONS[key].label).join(', ') || 'None'}`,
      `Client type: ${CLIENT_TYPES[params.clientType].label}`,
      `Timeline: ${TIMELINES[params.timeline].label} (${TIMELINES[params.timeline].weeks})`,
    ].join('\n');

    const existing = await prisma.lead.findFirst({
      where: { email: params.email },
      select: { id: true },
    });

    if (existing) {
      // Leave status and owner alone — this lead is already someone's, and a
      // second checkout attempt must not walk a won deal backwards.
      await prisma.leadActivity.create({
        data: { leadId: existing.id, type: 'note', content: summary },
      });
      await prisma.lead.update({
        where: { id: existing.id },
        data: { estimatedValue: params.totalPrice },
      });
      return existing.id;
    }

    const rep = await findSalesRep();
    const lead = await prisma.lead.create({
      data: {
        company: params.company,
        contactName: params.contactName || null,
        email: params.email,
        phone: params.phone || null,
        status: 'new',
        source: 'checkout-started',
        estimatedValue: params.totalPrice,
        notes: summary,
        assignedToId: rep.id,
      },
      select: { id: true },
    });
    return lead.id;
  } catch (error) {
    console.error('Failed to record checkout attempt as a lead:', error);
    return null;
  }
}

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

    const siteUrl = resolveSiteUrl();
    const successUrl = `${siteUrl}/checkout/success?type=welcome&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${siteUrl}/start`;

    const { totalPrice } = calculatePrice({ baseService, addOns, clientType, timeline });

    const leadId = await recordCheckoutAttempt({
      email: clientEmail,
      company,
      contactName,
      phone,
      baseService,
      addOns,
      clientType,
      timeline,
      totalPrice,
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
