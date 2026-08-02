import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
  depositAmount,
  formatCents,
  isAddOnKey,
  isBaseService,
  isClientType,
  isIncludedInBase,
  isTimelineKey,
  minAllowedPrice,
  type AddOnKey,
} from '@/lib/pricing';
import { sendSignAndPayEmail } from '@/lib/email';
import { buildInvoicePdf } from '@/lib/invoice-pdf';

/**
 * Saves the proposal Evan just built (service/add-ons/client type/timeline)
 * onto the lead so the public sign-and-pay page can reconstruct the exact
 * same pricing and contract without him re-entering anything, and returns
 * the link to send the client.
 */
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
    const {
      baseService,
      addOns = [],
      clientType,
      timeline,
      depositOnly = false,
      totalPriceOverride,
      sendEmail = false,
    } = await request.json();

    if (!isBaseService(baseService) || !isClientType(clientType) || !isTimelineKey(timeline)) {
      return NextResponse.json({ error: 'Invalid selection' }, { status: 400 });
    }
    const addOnKeys: AddOnKey[] = Array.isArray(addOns) ? addOns.filter(isAddOnKey) : [];

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const breakdown = calculatePrice({ baseService, addOns: addOnKeys, clientType, timeline });

    if (
      typeof totalPriceOverride === 'number' &&
      totalPriceOverride > 0 &&
      session.role === 'sales' &&
      Math.round(totalPriceOverride) < minAllowedPrice(breakdown.totalPrice)
    ) {
      return NextResponse.json(
        {
          error: `That's below what you're authorized to quote for this scope. Minimum is ${formatCents(
            minAllowedPrice(breakdown.totalPrice)
          )} (calculated: ${formatCents(breakdown.totalPrice)}). Ask Kiana if this deal needs a deeper discount.`,
        },
        { status: 403 }
      );
    }

    const totalPrice =
      typeof totalPriceOverride === 'number' && totalPriceOverride > 0
        ? Math.round(totalPriceOverride)
        : breakdown.totalPrice;

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        proposalBaseService: baseService,
        proposalAddOns: addOnKeys.join(','),
        proposalClientType: clientType,
        proposalTimeline: timeline,
        proposalTotalPrice: totalPrice,
        proposalDepositOnly: Boolean(depositOnly),
        // A new proposal supersedes any prior agreement — the client needs
        // to re-agree if Evan changes the scope or price after they signed.
        agreementSignedAt: null,
        agreementIp: null,
        agreementHash: null,
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        type: 'proposal',
        content: `Sign-and-pay link prepared: ${baseService}${addOnKeys.length ? ` + ${addOnKeys.join(', ')}` : ''} — $${(totalPrice / 100).toLocaleString()}${depositOnly ? ' (deposit)' : ''}`,
        createdById: session.userId,
      },
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const signUrl = `${siteUrl}/sign/${leadId}`;

    let emailSent = false;
    if (sendEmail && lead.email) {
      const chargeAmount = depositOnly ? depositAmount(totalPrice) : totalPrice;

      const lineItems = [
        { label: BASE_SERVICES[baseService].label, amount: formatCents(breakdown.basePrice) },
        ...addOnKeys.map((key) => ({
          label: ADD_ONS[key].label,
          amount: isIncludedInBase(baseService, key) ? 'Included' : formatCents(ADD_ONS[key].price),
        })),
      ];
      const adjustments: { label: string; amount: string }[] = [];
      if (breakdown.clientTypeMultiplier !== 1) {
        adjustments.push({
          label: `${CLIENT_TYPES[clientType].label} adjustment (${Math.round((breakdown.clientTypeMultiplier - 1) * 100)}%)`,
          amount: formatCents(Math.round(breakdown.subtotal * breakdown.clientTypeMultiplier) - breakdown.subtotal),
        });
      }
      if (breakdown.timelineMultiplier !== 1) {
        adjustments.push({
          label: `${TIMELINES[timeline].label} timeline (${Math.round((breakdown.timelineMultiplier - 1) * 100)}%)`,
          amount: formatCents(breakdown.totalPrice - Math.round(breakdown.subtotal * breakdown.clientTypeMultiplier)),
        });
      }
      if (totalPrice !== breakdown.totalPrice) {
        adjustments.push({
          label: 'Negotiated adjustment',
          amount: formatCents(totalPrice - breakdown.totalPrice),
        });
      }

      const invoicePdfBytes = await buildInvoicePdf({
        invoiceNumber: `${leadId.slice(0, 8).toUpperCase()}`,
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        company: lead.company,
        contactName: lead.contactName,
        lineItems,
        adjustments,
        subtotal: formatCents(breakdown.subtotal),
        total: formatCents(totalPrice),
        amountDue: formatCents(chargeAmount),
        isDeposit: Boolean(depositOnly),
        balanceRemaining: depositOnly ? formatCents(totalPrice - chargeAmount) : undefined,
      });

      emailSent = await sendSignAndPayEmail(
        lead.email,
        lead.contactName,
        lead.company,
        signUrl,
        formatCents(chargeAmount),
        Boolean(depositOnly),
        Buffer.from(invoicePdfBytes)
      );
      if (emailSent) {
        await prisma.leadActivity.create({
          data: {
            leadId,
            type: 'email',
            content: `Sign-and-pay link emailed to ${lead.email} (${depositOnly ? 'deposit' : 'full amount'} — ${formatCents(chargeAmount)})`,
            url: signUrl,
            createdById: session.userId,
          },
        });
      }
    }

    return NextResponse.json(
      { success: true, signUrl, emailSent, hasEmail: Boolean(lead.email) },
      { status: 200 }
    );
  } catch (error) {
    console.error('Prepare proposal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
