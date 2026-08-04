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

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    // Projects on the instalment schedule pay the next instalment that has
    // actually been invoiced — a client can't leapfrog a gate and pay for
    // work whose invoice hasn't been raised. If a live checkout link already
    // exists for it, reuse it rather than minting a second session that
    // races the first.
    const instalments = await prisma.instalment.findMany({
      where: { projectId: project.id },
      orderBy: { index: 'asc' },
    });
    if (instalments.length > 0) {
      const due = instalments.find((i) => i.status === 'due');
      if (!due) {
        const upcoming = instalments.find((i) => i.status === 'scheduled');
        return NextResponse.json(
          {
            error: upcoming
              ? `${upcoming.label} hasn't been invoiced yet — it falls due at its milestone, and we'll email it to you then.`
              : 'Nothing is currently owed on this project.',
          },
          { status: 400 }
        );
      }
      // Reuse the emailed link only while Stripe still honours it. Checkout
      // Sessions die after 24 hours; the invoice promises 14 days — so a
      // client paying on day 3 must get a FRESH session, not the corpse of
      // the emailed one, and pay-balance is exactly where they land when
      // the emailed button stops working.
      if (due.paymentUrl && due.stripeSessionId) {
        const stored = await stripe.checkout.sessions
          .retrieve(due.stripeSessionId)
          .catch(() => null);
        if (stored?.status === 'open') {
          return NextResponse.json({ success: true, url: due.paymentUrl }, { status: 200 });
        }
      }

      // Carry the ledger invoice into the fresh session's metadata, so the
      // webhook settles the same invoice the emailed link would have.
      const dueInvoice = due.invoiceNumber
        ? await prisma.invoice.findUnique({ where: { number: due.invoiceNumber } })
        : null;
      const instalmentCheckout = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: project.client.email,
        success_url: `${siteUrl}/client/${project.id}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/client/${project.id}`,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: `${project.name} — ${due.label}` },
              unit_amount: due.amountCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          existingProjectId: project.id,
          instalmentId: due.id,
          ...(dueInvoice ? { invoiceId: dueInvoice.id, invoiceNumber: dueInvoice.number } : {}),
          paymentType: due.index === 1 ? 'deposit' : 'balance',
        },
      });
      await prisma.instalment.update({
        where: { id: due.id },
        data: { paymentUrl: instalmentCheckout.url, stripeSessionId: instalmentCheckout.id },
      });
      return NextResponse.json({ success: true, url: instalmentCheckout.url }, { status: 201 });
    }

    // Legacy projects (no instalment rows) keep the lump-balance flow.
    const amountPaid = amountPaidTowardProject(project.payments);
    const balanceDue = project.totalPrice - amountPaid;
    if (balanceDue <= 0) {
      return NextResponse.json({ error: 'No balance remaining on this project' }, { status: 400 });
    }

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
