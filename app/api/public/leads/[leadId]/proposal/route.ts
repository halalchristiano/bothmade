import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildContractSections } from '@/lib/contract-terms';
import { readShareToken, shareTokenMatches } from '@/lib/share-links';
import { enforce, limiterKey, LIMITS } from '@/lib/rate-limit';
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

/**
 * Public (no login) — the client reads this via the capability token in
 * their sign-and-pay link. The leadId alone is no longer sufficient: it's a
 * cuid that appears in admin URLs, Stripe metadata, and activity records, so
 * treating it as the secret meant anyone who ever saw one could read the
 * proposal (and, on the sibling route, sign it). Returns only what's needed
 * to review and agree; nothing internal (notes, activity history, other
 * leads).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params;

    const limited = await enforce([
      { key: limiterKey('public-proposal', request), options: LIMITS.publicRead },
    ]);
    if (limited) return limited;

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });

    // Same 404 for "no such lead" and "wrong token", so the endpoint can't
    // be used to confirm which lead IDs exist.
    if (!lead || !shareTokenMatches(lead.shareToken, readShareToken(request))) {
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
      return NextResponse.json({ error: 'This proposal is no longer active', closed: true }, { status: 410 });
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

    return NextResponse.json(
      {
        success: true,
        proposal: {
          company: lead.company,
          contactName: lead.contactName,
          serviceLabel,
          addOnLabels,
          timelineLabel,
          totalPrice,
          chargeAmount,
          depositOnly: lead.proposalDepositOnly,
          depositAmount: deposit,
          balanceAmount: totalPrice - deposit,
          alreadySigned: !!lead.agreementSignedAt,
          sections,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Public proposal fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
