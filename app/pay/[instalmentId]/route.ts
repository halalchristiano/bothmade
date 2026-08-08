import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { resolveSiteUrl } from '@/lib/site-url';
import { receivedCents } from '@/lib/invoice-settlement';
import { liveCheckoutUrl } from '@/lib/instalment-checkout';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

/**
 * The payment link, routed through our own domain on the way to Stripe.
 *
 * Two jobs. Record that the client clicked — until this existed an unpaid
 * invoice looked the same whether it had been read and ignored or had never
 * arrived, and those want completely different responses. Nobody clicked
 * usually means the wrong person got it, or spam, and the fix is to ask who
 * should really receive it. Clicked and not finished means a card that failed
 * or a decision being made, and the fix is a phone call.
 *
 * And hand back a link that actually works. This used to redirect to whatever
 * URL was stored on the row, which is a Stripe Checkout Session — and those
 * die 24 hours after they are minted. The invoice gives the client fourteen
 * days. So the button in their invoice email worked on the day it landed and
 * was a Stripe error page every day after, through the whole period they were
 * being asked to pay in, with the first chase not due until day 14. There is
 * no way to email a longer-lived session: `expires_at` is capped at 24 hours.
 * The link has to be resolved at click time, which is what this now is.
 *
 * A GET that mutates, which is normally wrong. It is right here for the same
 * reason a tracking pixel is: the click IS the event, there is nothing else to
 * hang it on, and the mutation is a counter rather than anything a prefetch
 * could damage. Minting a session is likewise safe to repeat — the previous
 * one is reused while Stripe still honours it, so a double-click does not
 * produce two live checkouts for one payment.
 *
 * The instalment id is not a secret worth protecting: it grants nothing but a
 * redirect to a Stripe page the client was emailed anyway, and every
 * authorisation that matters lives on Stripe's side of the hop.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ instalmentId: string }> }
) {
  const { instalmentId } = await params;
  const siteUrl = resolveSiteUrl();

  let destination: string | null = null;
  try {
    const inst = await prisma.instalment.findUnique({
      where: { id: instalmentId },
      select: {
        id: true,
        projectId: true,
        index: true,
        label: true,
        amountCents: true,
        paymentUrl: true,
        stripeSessionId: true,
        invoiceNumber: true,
        status: true,
        project: { select: { id: true, name: true, client: { select: { email: true } } } },
      },
    });

    if (inst) {
      // Best-effort, and never in the way of the redirect.
      await prisma.instalment
        .update({
          where: { id: inst.id },
          data: { linkClickedAt: new Date(), linkClicks: { increment: 1 } },
        })
        .catch(() => null);

      /*
       * Only an instalment that has actually been invoiced gets a checkout.
       *
       * 'due' is precisely that state. 'scheduled' is not — it is money the
       * schedule has not asked for yet, and there is nothing for a client to
       * pay against it.
       *
       * That distinction is load-bearing rather than tidy. Voiding an invoice
       * resets its instalment to 'scheduled' and clears its invoice number,
       * so allowing 'scheduled' here meant: the void expired the emailed
       * Stripe session, and then this route handed the client a brand-new
       * working one the moment they clicked the link in the original email.
       * The invoice lookup below could not save it either — the void had
       * already nulled the number, so there was no invoice left to find and
       * be refused by.
       */
      if (inst.status === 'due') {
        // The ledger invoice, so the webhook settles the same row the emailed
        // link would have rather than leaving a paid instalment beside an
        // open invoice.
        const invoice = inst.invoiceNumber
          ? await prisma.invoice
              .findUnique({
                where: { number: inst.invoiceNumber },
                select: {
                  id: true,
                  status: true,
                  // Money that has gone back. A refund leaves an open invoice
                  // open and nets the sum below back to zero, so without this
                  // the guard reads "nothing has arrived" on an invoice whose
                  // money we have just returned.
                  refundedCents: true,
                  // Money already against it. An invoice can be part paid by
                  // transfer, and that deliberately leaves the instalment
                  // `due` — half of Payment 2 of 3 is not Payment 2 of 3.
                  payments: { select: { amount: true } },
                },
              })
              .catch(() => null)
          : null;

        /*
         * Nothing is minted when money has already arrived against it.
         *
         * A Checkout Session here is for the instalment's FULL amount; there
         * is no partial version of one. So a client who transferred fifteen
         * hundred of a three-thousand instalment and then pressed "Pay Payment
         * 2 of 3 — $3,000" in their own dashboard would have paid the whole
         * thing again on top of it.
         *
         * Same shape as the voided-invoice case beside it, and the same
         * answer: no session, and the redirect below lands them on their
         * dashboard, which says what has arrived and what is left.
         */
        const alreadyIn = receivedCents(invoice?.payments);
        /*
         * And nothing is minted once money has gone back off it either.
         *
         * A refund writes a negative row into the same ledger, so `alreadyIn`
         * nets to zero the moment everything that came in has been returned —
         * the same number as "nothing ever arrived", and the opposite
         * situation. A client who was refunded and then pressed the button in
         * an old email would have paid the instalment in full.
         */
        const wentBack = (invoice?.refundedCents ?? 0) > 0;

        if (invoice?.status !== 'void' && alreadyIn === 0 && !wentBack) {
          const live = await liveCheckoutUrl(
            stripe,
            inst,
            { id: inst.project.id, name: inst.project.name, clientEmail: inst.project.client.email },
            siteUrl,
            invoice?.id
          );

          if (live) {
            destination = live.url;
            if (live.minted) {
              await prisma.instalment
                .update({
                  where: { id: inst.id },
                  data: { paymentUrl: live.url, stripeSessionId: live.sessionId },
                })
                .catch(() => null);
            }
          }
        }
      }

      if (!destination) {
        // Paid, cancelled, or Stripe would not give us a session. Their own
        // dashboard is the honest place to land: it says what the state
        // actually is rather than showing a Stripe error page for a payment
        // that is already settled or was never owed.
        destination = `${siteUrl}/client/${inst.projectId}`;
      }
    }
  } catch (error) {
    console.error(`Payment link redirect failed for ${instalmentId}:`, error);
  }

  return NextResponse.redirect(destination ?? `${siteUrl}/client`, 302);
}
