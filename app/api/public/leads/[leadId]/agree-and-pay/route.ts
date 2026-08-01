import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { buildContractSections } from '@/lib/contract-terms';
import { isFurtherAlong } from '@/lib/leads';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  DEPOSIT_PERCENT,
  TIMELINES,
  calculatePrice,
  depositAmount,
  formatCents,
  isAddOnKey,
  isBaseService,
  isClientType,
  isTimelineKey,
  type AddOnKey,
} from '@/lib/pricing';


/**
 * The client's single click after reading the proposal and ticking
 * "I agree": logs the clickwrap agreement (IP, timestamp, hash of the exact
 * contract text they saw) and immediately opens a Stripe Checkout Session
 * for the same amount — one link, sign then pay, no separate steps.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params;
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });

    if (!lead) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (
      !lead.proposalBaseService ||
      !isBaseService(lead.proposalBaseService) ||
      !lead.proposalClientType ||
      !isClientType(lead.proposalClientType) ||
      !lead.proposalTimeline ||
      !isTimelineKey(lead.proposalTimeline)
    ) {
      return NextResponse.json({ error: 'No proposal has been prepared for this link yet' }, { status: 404 });
    }
    if (lead.status === 'won' || lead.status === 'lost') {
      return NextResponse.json({ error: 'This proposal is no longer active' }, { status: 410 });
    }
    if (!lead.email) {
      return NextResponse.json({ error: 'This lead has no email on file — contact us directly to proceed' }, { status: 400 });
    }

    const baseService = lead.proposalBaseService;
    const clientType = lead.proposalClientType;
    const timeline = lead.proposalTimeline;
    const addOnKeys: AddOnKey[] = lead.proposalAddOns.split(',').filter((a): a is AddOnKey => isAddOnKey(a));

    const breakdown = calculatePrice({ baseService, addOns: addOnKeys, clientType, timeline });
    const totalPrice = lead.proposalTotalPrice && lead.proposalTotalPrice > 0 ? lead.proposalTotalPrice : breakdown.totalPrice;
    const deposit = depositAmount(totalPrice);
    const chargeAmount = lead.proposalDepositOnly ? deposit : totalPrice;

    const serviceLabel = BASE_SERVICES[baseService].label;
    const addOnLabels = addOnKeys.map((k) => ADD_ONS[k].label);
    const timelineLabel = `${TIMELINES[timeline].label} (${TIMELINES[timeline].weeks})`;

    const sections = buildContractSections({
      company: lead.company,
      contactName: lead.contactName,
      serviceLabel,
      serviceDescription: BASE_SERVICES[baseService].description,
      addOnLabels,
      addOnKeys,
      baseServiceKey: baseService,
      clientTypeKey: clientType,
      timelineKey: timeline,
      timelineLabel,
      clientTypeLabel: CLIENT_TYPES[clientType].label,
      basePrice: formatCents(breakdown.basePrice),
      addOnsPrice: formatCents(breakdown.addOnsPrice),
      totalPrice: formatCents(totalPrice),
      depositAmount: formatCents(deposit),
      balanceAmount: formatCents(totalPrice - deposit),
      depositPercent: DEPOSIT_PERCENT,
      effectiveDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    });

    const contractHash = crypto.createHash('sha256').update(JSON.stringify(sections)).digest('hex');
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const wasFurtherAlong = isFurtherAlong(lead.status, 'contract_signed');
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        agreementSignedAt: new Date(),
        agreementIp: ip,
        agreementHash: contractHash,
        contractStatus: 'signed',
        status: wasFurtherAlong ? 'contract_signed' : undefined,
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        type: 'proposal',
        content: `Contract agreed to online (IP ${ip}) — proceeding to payment for ${formatCents(chargeAmount)}.`,
      },
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      success_url: `${siteUrl}/checkout/success`,
      cancel_url: `${siteUrl}/sign/${leadId}`,
      customer_email: lead.email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Bothmade ${serviceLabel} — ${lead.company}${lead.proposalDepositOnly ? ' (Deposit)' : ''}`,
              description: addOnLabels.length > 0 ? addOnLabels.join(', ') : undefined,
            },
            unit_amount: chargeAmount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        leadId: lead.id,
        clientEmail: lead.email,
        company: lead.company,
        contactName: lead.contactName || '',
        phone: lead.phone || '',
        baseService,
        addOns: addOnKeys.join(','),
        clientType,
        timeline,
        basePrice: String(breakdown.basePrice),
        totalPrice: String(totalPrice),
        paymentType: lead.proposalDepositOnly ? 'deposit' : 'full',
      },
    });

    return NextResponse.json({ success: true, url: session.url }, { status: 200 });
  } catch (error) {
    console.error('Agree-and-pay error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
