import { NextRequest, NextResponse } from 'next/server';
import { isFurtherAlong } from '@/lib/leads';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { canOverridePricing, requireStaff, unauthorizedResponse } from '@/lib/middleware';
import {
  calculatePrice,
  customItemsMissingScope,
  customItemsTotal,
  depositAmount,
  formatCents,
  isAddOnKey,
  isBaseService,
  isClientType,
  isTimelineKey,
  minAllowedPrice,
  missingScopeMessage,
  sanitizeCustomItems,
  type AddOnKey,
} from '@/lib/pricing';
import { sendSignAndPayEmail } from '@/lib/email';
import { buildSignUrl } from '@/lib/share-links';
import { buildProposalDocuments, documentFilename } from '@/lib/proposal-documents';

/**
 * Saves the proposal Evan just built (service/add-ons/client type/timeline,
 * plus any custom items he added by hand) onto the lead so the public
 * sign-and-pay page can reconstruct the exact same pricing and contract
 * without him re-entering anything, and returns the link to send the client.
 */
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
    const {
      baseService,
      addOns = [],
      clientType,
      timeline,
      depositOnly = false,
      isConsumer,
      totalPriceOverride,
      sendEmail = false,
      customItems: rawCustomItems = [],
    } = await request.json();

    if (!isBaseService(baseService) || !isClientType(clientType) || !isTimelineKey(timeline)) {
      return NextResponse.json({ error: 'Invalid selection' }, { status: 400 });
    }
    const addOnKeys: AddOnKey[] = Array.isArray(addOns) ? addOns.filter(isAddOnKey) : [];
    const customItems = sanitizeCustomItems(rawCustomItems);

    // This link is what the client agrees to, and the agreement PDF rides
    // along with it — so the same scope requirement that gates the contract
    // download gates the send. Blocking here rather than at the download is
    // the point: by the time a rep notices the gap, the client has usually
    // already been told what "custom" meant, and only one of them remembers.
    const undescribed = customItemsMissingScope(customItems);
    if (undescribed.length > 0) {
      return NextResponse.json({ error: missingScopeMessage(undescribed), needsCustomScope: true }, { status: 400 });
    }

    const customTotal = customItemsTotal(customItems);

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const breakdown = calculatePrice({ baseService, addOns: addOnKeys, clientType, timeline });
    const calculatedTotal = breakdown.totalPrice + customTotal;

    if (
      typeof totalPriceOverride === 'number' &&
      totalPriceOverride > 0 &&
      !canOverridePricing(session) &&
      Math.round(totalPriceOverride) < minAllowedPrice(calculatedTotal)
    ) {
      return NextResponse.json(
        {
          error: `That's below what you're authorized to quote for this scope. Minimum is ${formatCents(
            minAllowedPrice(calculatedTotal)
          )} (calculated: ${formatCents(calculatedTotal)}). Ask Kiana if this deal needs a deeper discount.`,
        },
        { status: 403 }
      );
    }

    const totalPrice =
      typeof totalPriceOverride === 'number' && totalPriceOverride > 0
        ? Math.round(totalPriceOverride)
        : calculatedTotal;

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        proposalBaseService: baseService,
        proposalAddOns: addOnKeys.join(','),
        proposalClientType: clientType,
        proposalTimeline: timeline,
        proposalTotalPrice: totalPrice,
        proposalDepositOnly: Boolean(depositOnly),
        // Only written when the caller took a position — an omitted field
        // must not silently reset a consumer lead back to the B2B form,
        // whose terms are void against them.
        ...(typeof isConsumer === 'boolean' ? { isConsumer } : {}),
        proposalCustomItems: customItems as unknown as Prisma.InputJsonValue,
        // A new proposal supersedes any prior agreement — the client needs
        // to re-agree if Evan changes the scope or price after they signed.
        agreementSignedAt: null,
        agreementIp: null,
        agreementHash: null,
        agreementSignerName: null,
        agreementUserAgent: null,
        agreementStatement: null,
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        type: 'proposal',
        content: `Sign-and-pay link prepared: ${baseService}${addOnKeys.length ? ` + ${addOnKeys.join(', ')}` : ''}${customItems.length ? ` + ${customItems.map((c) => c.label).join(', ')}` : ''} — $${(totalPrice / 100).toLocaleString()}${depositOnly ? ' (deposit)' : ''}`,
        createdById: session.userId,
      },
    });

    // The link carries the lead's capability token — the ID alone no longer
    // opens the sign-and-pay page.
    const signUrl = buildSignUrl(leadId, lead.shareToken);

    let emailSent = false;
    let emailError: string | null = null;
    if (sendEmail && lead.email) {
      const chargeAmount = depositOnly ? depositAmount(totalPrice) : totalPrice;

      // Both documents, not just the invoice. The client is being asked to
      // agree and pay in the same click, and the thing they are agreeing to
      // should arrive with the bill rather than living only behind a link.
      const { invoice, contract, failures } = await buildProposalDocuments({
        leadId,
        company: lead.company,
        contactName: lead.contactName,
        baseService,
        addOnKeys,
        clientType,
        timeline,
        customItems,
        totalPrice,
        depositOnly: Boolean(depositOnly),
        isConsumer: Boolean(isConsumer),
      });

      const attachments = [
        ...(contract
          ? [{ filename: documentFilename(lead.company, 'agreement'), content: contract }]
          : []),
        ...(invoice
          ? [{ filename: documentFilename(lead.company, 'invoice'), content: invoice }]
          : []),
      ];

      const result = await sendSignAndPayEmail(
        lead.email,
        lead.contactName,
        lead.company,
        signUrl,
        formatCents(chargeAmount),
        Boolean(depositOnly),
        attachments
      );
      emailSent = result.sent;
      if (!result.sent) emailError = result.reason;
      // A send that went out short of a document is still a send, but the rep
      // needs to know before the client asks where the agreement is.
      else if (failures.length > 0) {
        emailError = `Sent, but the ${failures.join(' and ')} could not be generated and was left off.`;
      }
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

        // The send is the moment the deal state actually changed, and this
        // route is the send path Evan actually uses — yet only the manual
        // contract-download route used to advance anything, so after his
        // most common action the pipeline still read 'Qualified' and the
        // next-step banner told him to do the thing he had just done.
        // The agreement travels with this email, so contract_sent is the
        // truthful stage, and isFurtherAlong keeps a lead that is already
        // past it from being dragged backwards.
        const stateData: { contractStatus?: string; status?: string } = {};
        if (lead.contractStatus === 'not_sent') stateData.contractStatus = 'sent';
        if (isFurtherAlong(lead.status, 'contract_sent')) stateData.status = 'contract_sent';
        if (Object.keys(stateData).length > 0) {
          await prisma.lead.update({ where: { id: leadId }, data: stateData });
        }
      }
    }

    return NextResponse.json(
      { success: true, signUrl, emailSent, emailError, hasEmail: Boolean(lead.email) },
      { status: 200 }
    );
  } catch (error) {
    console.error('Prepare proposal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
