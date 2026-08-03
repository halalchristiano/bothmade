import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const { projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true, payments: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const amountPaid = project.payments.reduce((sum, p) => sum + p.amount, 0);
    const balanceDue = project.totalPrice - amountPaid;

    if (balanceDue <= 0) {
      return NextResponse.json({ error: 'No balance remaining on this project' }, { status: 400 });
    }

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
              name: `${project.name} — Balance Due`,
            },
            unit_amount: balanceDue,
          },
          quantity: 1,
        },
      ],
      metadata: {
        existingProjectId: project.id,
        paymentType: 'balance',
      },
      // A Payment Link is reusable by default and never expires. Emailed to
      // a client, that is a standing authorisation to charge the balance
      // again — bookmark it, forward it, hit back on the receipt page, and
      // the same link takes a second payment. One completed session is all
      // a balance link should ever be good for.
      restrictions: { completed_sessions: { limit: 1 } },
    });

    // Issuing the balance link is the moment the balance is invoiced, so
    // this is where it acquires a due date and an invoice number. Without a
    // due date "overdue" has nothing to compare against, which is why the
    // dashboard previously had to treat every unpaid balance as late.
    //
    // Net 14 from issue, matching the agreement's "due upon completion of
    // Build and prior to Launch" with a fortnight of grace.
    const NET_DAYS = 14;
    const balanceDueAt =
      project.balanceDueAt ?? new Date(Date.now() + NET_DAYS * 24 * 60 * 60 * 1000);

    // Sequential and human-quotable: BM-2026-0001. Assigned once and kept,
    // so a re-issued link doesn't renumber an invoice the client already has.
    let invoiceNumber = project.invoiceNumber;
    if (!invoiceNumber) {
      const year = new Date().getFullYear();
      const issuedThisYear = await prisma.project.count({
        where: { invoiceNumber: { startsWith: `BM-${year}-` } },
      });
      invoiceNumber = `BM-${year}-${String(issuedThisYear + 1).padStart(4, '0')}`;
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { balanceDueAt, invoiceNumber },
    });

    return NextResponse.json(
      { success: true, url: paymentLink.url, balanceDue, balanceDueAt, invoiceNumber },
      { status: 201 }
    );
  } catch (error) {
    console.error('Collect balance error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
