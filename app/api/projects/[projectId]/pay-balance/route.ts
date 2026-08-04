import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { forbiddenResponse, requireClient } from '@/lib/middleware';
import { amountPaidTowardProject } from '@/lib/billing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

/**
 * Client-initiated balance payment — the portal only ever showed
 * balanceDue as a number with nowhere to act on it, so paying meant
 * waiting for ops to send a link. Builds the same kind of Checkout
 * Session the admin-side payment-reminder route creates as a Payment
 * Link, just started from the client's own session instead.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { session, response } = await requireClient();
    if (!session) return response;

    const { projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true, payments: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (project.clientId !== session.clientId) {
      return forbiddenResponse();
    }

    const amountPaid = amountPaidTowardProject(project.payments);
    const balanceDue = project.totalPrice - amountPaid;
    if (balanceDue <= 0) {
      return NextResponse.json({ error: 'No balance remaining on this project' }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: project.client.email,
      success_url: `${siteUrl}/client/${project.id}?paid=1`,
      cancel_url: `${siteUrl}/client/${project.id}`,
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

    return NextResponse.json({ success: true, url: checkoutSession.url }, { status: 201 });
  } catch (error) {
    console.error('Client pay-balance error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
