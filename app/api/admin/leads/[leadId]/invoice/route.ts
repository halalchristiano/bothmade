import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import {
  calculatePrice,
  customItemsTotal,
  isAddOnKey,
  isBaseService,
  isClientType,
  isTimelineKey,
  sanitizeCustomItems,
  type AddOnKey,
} from '@/lib/pricing';
import { sendInvoiceOnlyEmail } from '@/lib/email';
import { buildInvoiceForProposal } from '@/lib/invoice-pdf';

/**
 * Emails a standalone copy of the invoice for the pricing builder's current
 * selection — either to the client (a re-send, independent of the full
 * sign-and-pay send) or to the requesting rep themselves, to check it over
 * before it goes out.
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
      customItems: rawCustomItems = [],
      recipient,
    } = await request.json();

    if (!isBaseService(baseService) || !isClientType(clientType) || !isTimelineKey(timeline)) {
      return NextResponse.json({ error: 'Invalid selection' }, { status: 400 });
    }
    if (recipient !== 'client' && recipient !== 'self') {
      return NextResponse.json({ error: 'Invalid recipient' }, { status: 400 });
    }
    const addOnKeys: AddOnKey[] = Array.isArray(addOns) ? addOns.filter(isAddOnKey) : [];
    const customItems = sanitizeCustomItems(rawCustomItems);

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    let toEmail: string;
    let contactName: string | null;
    if (recipient === 'client') {
      if (!lead.email) {
        return NextResponse.json({ error: 'This lead has no email on file' }, { status: 400 });
      }
      toEmail = lead.email;
      contactName = lead.contactName;
    } else {
      const self = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true, name: true } });
      if (!self?.email) {
        return NextResponse.json({ error: 'No email on file for your account' }, { status: 400 });
      }
      toEmail = self.email;
      contactName = self.name;
    }

    // Uses whatever total is already on the lead (respecting a prior
    // negotiated override) rather than recalculating, so the invoice matches
    // what was actually agreed rather than drifting if the catalogue's
    // prices change later.
    const breakdown = calculatePrice({ baseService, addOns: addOnKeys, clientType, timeline });
    const calculatedTotal = breakdown.totalPrice + customItemsTotal(customItems);
    const totalPrice =
      lead.proposalTotalPrice && lead.proposalTotalPrice > 0 ? lead.proposalTotalPrice : calculatedTotal;

    const invoicePdfBytes = await buildInvoiceForProposal({
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
    });

    const sent = await sendInvoiceOnlyEmail(
      toEmail,
      contactName,
      lead.company,
      Buffer.from(invoicePdfBytes),
      recipient === 'self'
    );

    if (sent) {
      await prisma.leadActivity.create({
        data: {
          leadId,
          type: 'email',
          content:
            recipient === 'client'
              ? `Invoice re-emailed to ${toEmail}`
              : `Invoice emailed to ${toEmail} (self copy)`,
          createdById: session.userId,
        },
      });
    }

    return NextResponse.json({ success: true, sent, toEmail }, { status: 200 });
  } catch (error) {
    console.error('Send invoice error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
