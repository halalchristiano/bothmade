import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { forbiddenResponse, unauthorizedResponse } from '@/lib/middleware';
import { buildInvoicePdf } from '@/lib/invoice-pdf';
import {
  ADD_ONS,
  BASE_SERVICES,
  formatCents,
  isAddOnKey,
  isBaseService,
  sanitizeCustomItems,
} from '@/lib/pricing';

/**
 * A downloadable receipt for one payment.
 *
 * The portal listed payments as a date and an amount and nothing else, so a
 * client with an accountant had nothing to give them — Stripe's own
 * confirmation email has no line items, and the invoice PDF this codebase
 * can already generate was only ever produced at sign-and-pay time and
 * never stored. Anyone needing a receipt had to email and wait.
 *
 * Generated on demand from the project and payment rows rather than stored,
 * so it can never disagree with what the database says was paid.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; paymentId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session) return unauthorizedResponse();

    const { projectId, paymentId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true, payments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (session.type === 'client' && project.clientId !== session.clientId) {
      return forbiddenResponse();
    }

    // Scoped to the project in the path, so a payment id from someone
    // else's project can't be pulled through this route.
    const payment = project.payments.find((p) => p.id === paymentId);
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found on this project' }, { status: 404 });
    }

    const addOnKeys = project.addOns.split(',').map((a) => a.trim()).filter(isAddOnKey);
    const customItems = sanitizeCustomItems(project.customItems);
    const baseLabel = isBaseService(project.baseService)
      ? BASE_SERVICES[project.baseService].label
      : project.baseService;

    const paidBefore = project.payments
      .filter((p) => p.createdAt < payment.createdAt)
      .reduce((sum, p) => sum + p.amount, 0);
    const remaining = project.totalPrice - paidBefore - payment.amount;

    // Numbered by position, so the second payment on a project is always
    // receipt -02 regardless of when it is downloaded.
    const index = project.payments.findIndex((p) => p.id === paymentId) + 1;
    const receiptNumber = `${project.invoiceNumber ?? `BM-${project.id.slice(-6).toUpperCase()}`}-R${String(index).padStart(2, '0')}`;

    const pdf = await buildInvoicePdf({
      invoiceNumber: receiptNumber,
      date: payment.createdAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      company: project.client.company,
      contactName: project.client.contactName,
      lineItems: [
        { label: baseLabel, amount: formatCents(project.basePrice) },
        ...addOnKeys.map((key) => ({
          label: ADD_ONS[key].label,
          amount: formatCents(ADD_ONS[key].price),
        })),
        ...customItems.map((item) => ({
          label: item.label,
          amount: formatCents(item.priceCents),
        })),
      ],
      adjustments: [],
      subtotal: formatCents(project.totalPrice),
      total: formatCents(project.totalPrice),
      amountDue: formatCents(payment.amount),
      isDeposit: payment.type === 'deposit',
      balanceRemaining: remaining > 0 ? formatCents(remaining) : undefined,
    });

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${receiptNumber}.pdf"`,
        // A receipt for a payment that already happened never changes.
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Generate receipt error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
