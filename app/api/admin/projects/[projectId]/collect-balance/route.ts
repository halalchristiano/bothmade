import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { requireRole, OPS } from '@/lib/authz';
import { unauthorizedResponse } from '@/lib/middleware';


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }
    const denied = requireRole(session, OPS);
    if (denied) return denied;

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

    const paymentLink = await getStripe().paymentLinks.create({
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
