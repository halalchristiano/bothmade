import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { buildContractSections } from '@/lib/contract-terms';
import { buildContractPdf } from '@/lib/contract-pdf';
import { isFurtherAlong } from '@/lib/leads';
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }

    const { leadId } = await params;
    const { baseService, addOns = [], clientType, timeline, customItems: rawCustomItems = [] } = await request.json();

    if (!isBaseService(baseService) || !isClientType(clientType) || !isTimelineKey(timeline)) {
      return NextResponse.json({ error: 'Invalid selection' }, { status: 400 });
    }
    const addOnKeys: AddOnKey[] = Array.isArray(addOns) ? addOns.filter(isAddOnKey) : [];
    const customItems = sanitizeCustomItems(rawCustomItems);
    const customTotal = customItemsTotal(customItems);

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const breakdown = calculatePrice({ baseService, addOns: addOnKeys, clientType, timeline });
    const totalWithCustom = breakdown.totalPrice + customTotal;
    const serviceLabel = BASE_SERVICES[baseService].label;
    const addOnLabels = [
      ...addOnKeys.map((k) => ADD_ONS[k].label),
      ...customItems.map((c) => `${c.label} (${formatCents(c.priceCents)})`),
    ];
    const deposit = depositAmount(totalWithCustom);

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
      timelineLabel: `${TIMELINES[timeline].label} (${TIMELINES[timeline].weeks})`,
      clientTypeLabel: CLIENT_TYPES[clientType].label,
      basePrice: formatCents(breakdown.basePrice),
      addOnsPrice: formatCents(breakdown.addOnsPrice + customTotal),
      totalPrice: formatCents(totalWithCustom),
      depositAmount: formatCents(deposit),
      balanceAmount: formatCents(totalWithCustom - deposit),
      depositPercent: DEPOSIT_PERCENT,
      effectiveDate: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    });

    const pdfBytes = await buildContractPdf({
      company: lead.company,
      contactName: lead.contactName,
      serviceLabel,
      addOnLabels,
      timelineLabel: `${TIMELINES[timeline].label} (${TIMELINES[timeline].weeks})`,
      basePrice: formatCents(breakdown.basePrice),
      addOnsPrice: formatCents(breakdown.addOnsPrice + customTotal),
      totalPrice: formatCents(totalWithCustom),
      depositAmount: formatCents(deposit),
      sections,
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        type: 'proposal',
        content: `Contract generated: ${serviceLabel}${addOnLabels.length ? ` + ${addOnLabels.join(', ')}` : ''} — ${formatCents(totalWithCustom)}`,
        createdById: session.userId,
      },
    });

    const data: { contractStatus?: string; status?: string } = {};
    if (lead.contractStatus === 'not_sent') data.contractStatus = 'sent';
    if (isFurtherAlong(lead.status, 'contract_sent')) data.status = 'contract_sent';
    if (Object.keys(data).length > 0) {
      await prisma.lead.update({ where: { id: leadId }, data });
    }

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${lead.company.replace(/[^a-z0-9]/gi, '-')}-contract.pdf"`,
      },
    });
  } catch (error) {
    console.error('Generate contract error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
