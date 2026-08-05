import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveSiteUrl } from '@/lib/site-url';

/**
 * The payment link, routed through our own domain on the way to Stripe.
 *
 * One job: record that the client clicked, then get out of the way. Until now
 * an unpaid invoice looked the same whether it had been read and ignored or
 * had never arrived at all — and those want completely different responses.
 * Nobody clicked usually means the wrong person got it, or it went to spam,
 * and the fix is to ask who should really receive it. Clicked and not
 * finished means a card that failed or a decision being made, and the fix is
 * a phone call.
 *
 * A GET that mutates, which is normally wrong. It is right here for the same
 * reason a tracking pixel is: the click IS the event, there is nothing else
 * to hang it on, and the mutation is a counter rather than anything a
 * prefetch could damage. The redirect happens whether or not the write
 * succeeds — a client who cannot pay because our analytics failed would be an
 * absurd way to lose money.
 *
 * The instalment id is not a secret worth protecting: it grants nothing but a
 * redirect to a Stripe page that the client was emailed anyway, and every
 * authorisation that matters lives on Stripe's side of the hop.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ instalmentId: string }> }
) {
  const { instalmentId } = await params;

  let destination: string | null = null;
  try {
    const inst = await prisma.instalment.findUnique({
      where: { id: instalmentId },
      select: { id: true, projectId: true, paymentUrl: true, status: true },
    });

    if (inst) {
      destination = inst.status === 'paid' ? null : inst.paymentUrl;

      // Best-effort, and never in the way of the redirect.
      await prisma.instalment
        .update({
          where: { id: inst.id },
          data: { linkClickedAt: new Date(), linkClicks: { increment: 1 } },
        })
        .catch(() => null);

      if (!destination) {
        // Paid, or the link has been reaped. Their own dashboard is the
        // honest place to land: it says what the state actually is rather
        // than showing a Stripe error page for a payment already settled.
        destination = `${resolveSiteUrl()}/client/${inst.projectId}`;
      }
    }
  } catch (error) {
    console.error(`Payment link redirect failed for ${instalmentId}:`, error);
  }

  return NextResponse.redirect(destination ?? `${resolveSiteUrl()}/client`, 302);
}
