import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Stripe from 'stripe';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { buildContractSections } from '@/lib/contract-terms';
import { buildContractPdf } from '@/lib/contract-pdf';
import { buildInvoiceForProposal } from '@/lib/invoice-pdf';
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
      effectiveDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    });

    const contractHash = crypto.createHash('sha256').update(JSON.stringify(sections)).digest('hex');
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    // Save a PDF copy of exactly what they agreed to — same sections that
    // were hashed above — so there's a real document backing the clickwrap,
    // not just a hash. Failure here shouldn't block the client from paying.
    const signedAt = new Date();
    let signedContractUrl: string | null = null;
    try {
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

    // The invoice for the same agreed figures, stored rather than only
    // emailed. Until now it was generated on demand and sent — which meant
    // that once the email was buried, the only way back to it was to
    // reconstruct the proposal and regenerate it. Keeping a copy is what
    // turns it into a button on the lead instead of a search through a
    // mailbox. Like the contract above, a failure here must never stop
    // somebody paying us.
    let invoicePdfUrl: string | null = null;
    try {
      const invoiceBytes = await buildInvoiceForProposal({
        leadId,
        company: lead.company,
        contactName: lead.contactName,
        baseService,
        addOnKeys,
        clientType,
        timeline,
        customItems,
        totalPrice,
        depositOnly: lead.proposalDepositOnly,
      });
      const blob = await put(
        `invoices/${leadId}-${signedAt.getTime()}.pdf`,
        Buffer.from(invoiceBytes),
        { access: 'public', contentType: 'application/pdf' }
      );
      invoicePdfUrl = blob.url;
    } catch (invoiceError) {
      console.error('Failed to save invoice copy:', invoiceError);
    }

    const wasFurtherAlong = isFurtherAlong(lead.status, 'contract_signed');
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        agreementSignedAt: signedAt,
        agreementIp: ip,
        agreementHash: contractHash,
        contractStatus: 'signed',
        status: wasFurtherAlong ? 'contract_signed' : undefined,
        signedContractUrl: signedContractUrl || undefined,
        invoicePdfUrl: invoicePdfUrl || undefined,
        invoicePdfUploadedAt: invoicePdfUrl ? signedAt : undefined,
      },
    });

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
    });

    return NextResponse.json({ success: true, url: session.url }, { status: 200 });
  } catch (error) {
    console.error('Agree-and-pay error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
