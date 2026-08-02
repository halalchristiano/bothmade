import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { forbiddenResponse, unauthorizedResponse } from '@/lib/middleware';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

/**
 * Lets the client pay their own outstanding balance straight from the
 * portal, instead of the only path being ops manually sending a reminder
 * link — same Stripe payment link collect-balance builds, just reachable
 * by the person who actually owes the money.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session) return unauthorizedResponse();

    const { projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { payments: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (session.type === 'client' && project.clientId !== session.clientId) {
      return forbiddenResponse();
    }

    const amountPaid = project.payments.reduce((sum, p) => sum + p.amount, 0);
    const balanceDue = project.totalPrice - amountPaid;
    if (balanceDue <= 0) {
      return NextResponse.json({ error: 'There is no balance remaining on this project' }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: `${siteUrl}/checkout/success`,
      cancel_url: `${siteUrl}/client/${projectId}`,
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
      metadata: {
        existingProjectId: project.id,
        paymentType: 'balance',
      },
    });

    return NextResponse.json({ success: true, url: checkoutSession.url }, { status: 200 });
  } catch (error) {
    console.error('Pay balance error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
