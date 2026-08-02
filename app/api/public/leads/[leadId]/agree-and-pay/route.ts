import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Stripe from 'stripe';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { buildContractSections } from '@/lib/contract-terms';
import { buildContractPdf } from '@/lib/contract-pdf';
import { isFurtherAlong } from '@/lib/leads';
import { getAdminEmails } from '@/lib/notify';
import { sendSignedContractCopyEmail } from '@/lib/email';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  DEPOSIT_PERCENT,
  TIMELINES,
  calculatePrice,
  customItemsTotal,
  feeAdjustmentLines,
  depositAmount,
  formatCents,
  isAddOnKey,
  isBaseService,
  isClientType,
  isTimelineKey,
  sanitizeCustomItems,
  type AddOnKey,
} from '@/lib/pricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

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
    const customItems = sanitizeCustomItems(lead.proposalCustomItems);
    const customTotal = customItemsTotal(customItems);

    const breakdown = calculatePrice({ baseService, addOns: addOnKeys, clientType, timeline });
    const calculatedTotal = breakdown.totalPrice + customTotal;
    const totalPrice = lead.proposalTotalPrice && lead.proposalTotalPrice > 0 ? lead.proposalTotalPrice : calculatedTotal;
    const deposit = depositAmount(totalPrice);
    const chargeAmount = lead.proposalDepositOnly ? deposit : totalPrice;

    const serviceLabel = BASE_SERVICES[baseService].label;
    const addOnLabels = [
      ...addOnKeys.map((k) => ADD_ONS[k].label),
      ...customItems.map((c) => `${c.label} (${formatCents(c.priceCents)})`),
    ];
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
      addOnsPrice: formatCents(breakdown.addOnsPrice + customTotal),
      totalPrice: formatCents(totalPrice),
      depositAmount: formatCents(deposit),
      balanceAmount: formatCents(totalPrice - deposit),
      depositPercent: DEPOSIT_PERCENT,
      feeAdjustments: feeAdjustmentLines({
        breakdown,
        clientTypeLabel: CLIENT_TYPES[clientType].label,
        timelineLabel: TIMELINES[timeline].label,
        customItems,
        finalTotal: totalPrice,
      }),
      effectiveDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    });

    const contractHash = crypto.createHash('sha256').update(JSON.stringify(sections)).digest('hex');
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const signedAt = new Date();

    // Claim the signing atomically before doing any of the expensive,
    // externally-visible work. A double-click (or an impatient second tap on
    // a slow phone) used to run this whole handler twice: two contract PDFs
    // uploaded, two "contract signed" emails to the team, two activity rows,
    // and two live Stripe sessions for the same deal. Only the request that
    // wins this conditional update does the one-time work; the loser still
    // gets a checkout URL, because the person is standing there waiting to
    // pay and the webhook is idempotent per session.
    const claim = await prisma.lead.updateMany({
      where: { id: leadId, agreementSignedAt: null },
      data: {
        agreementSignedAt: signedAt,
        agreementIp: ip,
        agreementHash: contractHash,
        contractStatus: 'signed',
        ...(isFurtherAlong(lead.status, 'contract_signed') ? { status: 'contract_signed' } : {}),
      },
    });
    const isFirstSigning = claim.count === 1;

    // Save a PDF copy of exactly what they agreed to — same sections that
    // were hashed above — so there's a real document backing the clickwrap,
    // not just a hash. Failure here shouldn't block the client from paying.
    let signedContractUrl: string | null = null;
    if (isFirstSigning) try {
      const pdfBytes = await buildContractPdf({
        company: lead.company,
        contactName: lead.contactName,
        serviceLabel,
        addOnLabels,
        timelineLabel,
        basePrice: formatCents(breakdown.basePrice),
        addOnsPrice: formatCents(breakdown.addOnsPrice + customTotal),
        totalPrice: formatCents(totalPrice),
        depositAmount: formatCents(deposit),
        sections,
        signedOnline: { at: signedAt, ip },
      });
      const blob = await put(
        `contracts/${leadId}-${signedAt.getTime()}.pdf`,
        Buffer.from(pdfBytes),
        { access: 'public', contentType: 'application/pdf' }
      );
      signedContractUrl = blob.url;
    } catch (pdfError) {
      console.error('Failed to save signed contract copy:', pdfError);
    }

    if (isFirstSigning) {
      if (signedContractUrl) {
        await prisma.lead.update({
          where: { id: leadId },
          data: { signedContractUrl },
        });
      }

      await prisma.leadActivity.create({
        data: {
          leadId,
          type: 'proposal',
          content: `Contract agreed to online (IP ${ip}) — proceeding to payment for ${formatCents(chargeAmount)}.`,
          url: signedContractUrl || undefined,
        },
      });

      if (signedContractUrl) {
        const teamEmails = await getAdminEmails();
        await sendSignedContractCopyEmail(teamEmails, lead.company, signedContractUrl, formatCents(totalPrice)).catch(
          (e) => console.error('Failed to email signed contract copy:', e)
        );
      }
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create({
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
        customItems: JSON.stringify(customItems),
        paymentType: lead.proposalDepositOnly ? 'deposit' : 'full',
      },
      // Bound the window in which this exact quote can still be charged.
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    });

    return NextResponse.json({ success: true, url: session.url }, { status: 200 });
  } catch (error) {
    console.error('Agree-and-pay error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
