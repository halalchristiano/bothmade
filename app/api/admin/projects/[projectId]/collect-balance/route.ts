import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { amountPaidTowardProject } from '@/lib/billing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }
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

    const amountPaid = amountPaidTowardProject(project.payments);
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
    });

    return NextResponse.json({ success: true, url: paymentLink.url, balanceDue }, { status: 201 });
  } catch (error) {
    console.error('Collect balance error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
