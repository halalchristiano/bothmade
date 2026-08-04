import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { amountPaidTowardProject } from '@/lib/billing';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { sendPaymentLinkEmail } from '@/lib/email';
import { formatCents } from '@/lib/pricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

/**
 * One-click "nudge the client" for an overdue balance, straight from the
 * dashboard — creates the same Stripe payment link collect-balance does,
 * but emails it to the client immediately instead of leaving ops to copy
 * a link and send it manually.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    // Client records and project money are ops, not sales — the admin
    // nav already withholds these pages from a sales account.
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;


    const { projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true, payments: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Instalment-scheduled projects bill through their schedule — this
    // lump-balance path running in parallel was a double-collection route:
    // its payments never settled instalment rows, so the client could pay
    // here today and still be invoiced "Payment 2 of 3" tomorrow.
    const scheduled = await prisma.instalment.count({ where: { projectId: project.id } });
    if (scheduled > 0) {
      return NextResponse.json(
        { error: 'This project bills by instalment schedule — send the next payment from the Payment schedule panel instead.' },
        { status: 400 }
      );
    }

    const amountPaid = amountPaidTowardProject(project.payments);
    const balanceDue = project.totalPrice - amountPaid;
    if (balanceDue <= 0) {
      return NextResponse.json({ error: 'No balance remaining on this project' }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const paymentLink = await stripe.paymentLinks.create({
      after_completion: { type: 'redirect', redirect: { url: `${siteUrl}/checkout/success` } },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `${project.name} — Balance Due` },
            unit_amount: balanceDue,
          },
          quantity: 1,
        },
      ],
      metadata: { existingProjectId: project.id, paymentType: 'balance' },
    });

    const sent = await sendPaymentLinkEmail(
      project.client.email,
      project.client.contactName,
      project.client.company,
      paymentLink.url,
      formatCents(balanceDue),
      false
    );

    if (sent) {
      await prisma.project.update({
        where: { id: projectId },
        data: { lastPaymentReminderSentAt: new Date() },
      });
    }

    return NextResponse.json({ success: true, sent, url: paymentLink.url, balanceDue }, { status: 201 });
  } catch (error) {
    console.error('Payment reminder error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
