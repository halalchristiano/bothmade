import { NextRequest, NextResponse } from 'next/server';
import { resolveSiteUrl } from '@/lib/site-url';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { forbiddenResponse, requireClient } from '@/lib/middleware';
import { amountPaidTowardProject } from '@/lib/billing';
import { liveCheckoutUrl } from '@/lib/instalment-checkout';
import { receivedCents } from '@/lib/invoice-settlement';

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

    const siteUrl = resolveSiteUrl();

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
      /*
       * Reuse the emailed link only while Stripe still honours it. Checkout
       * Sessions die after 24 hours; the invoice promises 14 days — so a
       * client paying on day 3 must get a FRESH session, not the corpse of
       * the emailed one.
       *
       * This rule used to be written out here and again, differently, in
       * /pay/[instalmentId]. Two copies of "when may a stored Stripe URL be
       * handed to a client" is one copy too many for a question whose wrong
       * answer is either a dead button or two live checkouts for one payment.
       * liveCheckoutUrl is the single answer now.
       */
      const dueInvoice = due.invoiceNumber
        ? await prisma.invoice.findUnique({
            where: { number: due.invoiceNumber },
            // What has already arrived against it. An invoice can hold money
            // without being settled, and the instalment row does not know.
            include: { payments: { select: { amount: true } } },
          })
        : null;

      /*
       * The ledger decides the amount, not the schedule.
       *
       * A client who has transferred half of this instalment is looking at a
       * button on their own dashboard. Charging them the face value takes the
       * half they already sent a second time — and unlike the chase email,
       * nobody else is in the loop to notice.
       */
      const paidAlreadyCents = receivedCents(dueInvoice?.payments);
      const outstandingCents = due.amountCents - paidAlreadyCents;
      if (outstandingCents <= 0) {
        return NextResponse.json(
          { error: "That payment is already covered — thank you. Nothing more is owed on it." },
          { status: 400 }
        );
      }

      const live = await liveCheckoutUrl(
        stripe,
        due,
        { id: project.id, name: project.name, clientEmail: project.client.email },
        siteUrl,
        dueInvoice?.id,
        outstandingCents
      );
      if (!live) {
        return NextResponse.json(
          { error: "Couldn't reach Stripe to open a payment. Please try again in a moment." },
          { status: 502 }
        );
      }
      if (!live.minted) {
        return NextResponse.json({ success: true, url: live.url }, { status: 200 });
      }

      await prisma.instalment.update({
        where: { id: due.id },
        data: { paymentUrl: live.url, stripeSessionId: live.sessionId },
      });
      return NextResponse.json({ success: true, url: live.url }, { status: 201 });
    }

    // Legacy projects (no instalment rows) keep the lump-balance flow.
    const amountPaid = amountPaidTowardProject(project.payments);
    const balanceDue = project.totalPrice - amountPaid;
    if (balanceDue <= 0) {
      return NextResponse.json({ error: 'No balance remaining on this project' }, { status: 400 });
    }

    const checkoutSession = await stripe.checkout.sessions.create(
      {
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
      },
      /*
       * Nothing on this path remembers the session it minted, so nothing can
       * expire it — every POST was a brand-new live checkout for the whole
       * balance, and a client double-tapping their own Pay button ended up
       * with two of them. This is the largest single amount anybody sends us
       * and it is the one mint site in the app with no guard at all. The
       * instalment path closes the window by storing and reusing the session;
       * with nothing to store, Stripe's own replay is the guard, keyed on the
       * project and the amount so a genuinely changed balance still mints.
       */
      { idempotencyKey: `paybalance-${project.id}-${balanceDue}` }
    );

    /*
     * Stripe can answer without a URL — an already-finished session, or an
     * embedded ui_mode — which is not the same as throwing. Returning it as a
     * success sends the browser to `undefined` on the one button whose entire
     * job is reaching a checkout. Same guard /pay/[instalmentId] already has.
     */
    if (!checkoutSession.url) {
      return NextResponse.json(
        { error: "Couldn't open a payment page just now. Please try again in a moment." },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, url: checkoutSession.url }, { status: 201 });
  } catch (error) {
    console.error('Client pay-balance error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
