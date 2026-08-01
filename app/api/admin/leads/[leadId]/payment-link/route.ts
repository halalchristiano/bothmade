import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import {
  ADD_ONS,
  BASE_SERVICES,
  calculatePrice,
  depositAmount,
  isAddOnKey,
  isBaseService,
  isClientType,
  isTimelineKey,
  type AddOnKey,
} from '@/lib/pricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const { leadId } = await params;
    const { baseService, addOns = [], clientType, timeline, depositOnly = false } = await request.json();

    if (!isBaseService(baseService) || !isClientType(clientType) || !isTimelineKey(timeline)) {
      return NextResponse.json({ error: 'Invalid selection' }, { status: 400 });
    }
    const addOnKeys: AddOnKey[] = Array.isArray(addOns) ? addOns.filter(isAddOnKey) : [];

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const breakdown = calculatePrice({ baseService, addOns: addOnKeys, clientType, timeline });
    const addOnLabels = addOnKeys.map((k) => ADD_ONS[k].label);
    const serviceLabel = BASE_SERVICES[baseService].label;
    const chargeAmount = depositOnly ? depositAmount(breakdown.totalPrice) : breakdown.totalPrice;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const paymentLink = await stripe.paymentLinks.create({
      after_completion: {
        type: 'redirect',
        redirect: { url: `${siteUrl}/checkout/success` },
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Bothmade ${serviceLabel} — ${lead.company}${depositOnly ? ' (Deposit)' : ''}`,
              description: addOnLabels.length > 0 ? addOnLabels.join(', ') : undefined,
            },
            unit_amount: chargeAmount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        leadId: lead.id,
        clientEmail: lead.email || '',
        company: lead.company,
        contactName: lead.contactName || '',
        phone: lead.phone || '',
        baseService,
        addOns: addOnKeys.join(','),
        clientType,
        timeline,
        basePrice: String(breakdown.basePrice),
        totalPrice: String(breakdown.totalPrice),
        paymentType: depositOnly ? 'deposit' : 'full',
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        type: 'proposal',
        content: `Payment link created (${depositOnly ? 'deposit' : 'full amount'}): ${serviceLabel}${addOnLabels.length ? ` + ${addOnLabels.join(', ')}` : ''} — $${(chargeAmount / 100).toLocaleString()}`,
        url: paymentLink.url,
        createdById: session.userId,
      },
    });

    if (lead.status === 'new' || lead.status === 'contacted' || lead.status === 'qualified') {
      await prisma.lead.update({ where: { id: leadId }, data: { status: 'proposal' } });
    }

    return NextResponse.json({ success: true, url: paymentLink.url }, { status: 201 });
  } catch (error) {
    console.error('Create payment link error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
