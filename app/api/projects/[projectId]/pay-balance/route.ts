import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

/**
 * Lets a client pay their own project's outstanding balance from the portal.
 * The balance used to be collectable only by an admin emailing a Stripe link;
 * dangling "Balance Due" with no way to pay it was both a dead end and a
 * revenue leak. Creates a Checkout Session (immediate redirect) for the amount
 * still owed; the webhook's existing existingProjectId + paymentType:'balance'
 * path records it idempotently.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'client') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true, payments: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (project.clientId !== session.clientId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const amountPaid = project.payments.reduce((sum, p) => sum + p.amount, 0);
    const balanceDue = project.totalPrice - amountPaid;
    if (balanceDue <= 0) {
      return NextResponse.json(
        { error: 'No balance remaining on this project' },
        { status: 400 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const checkout = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: project.client.email,
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
      success_url: `${siteUrl}/checkout/success?type=balance`,
      cancel_url: `${siteUrl}/client/${project.id}`,
      metadata: {
        existingProjectId: project.id,
        paymentType: 'balance',
      },
    });

    if (!checkout.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, url: checkout.url, balanceDue },
      { status: 201 }
    );
  } catch (error) {
    console.error('Client pay-balance error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
