import type Stripe from 'stripe';

/**
 * A payment link that is alive when the client clicks it.
 *
 * A Stripe Checkout Session dies 24 hours after it is minted, and 24 hours is
 * not a number that appears anywhere in this business. The invoice says
 * fourteen days. The chase schedule waits until day 14 and then goes on days
 * 17, 21 and weekly. So every link the studio sends is a corpse for most of
 * the window it is supposed to cover — the invoice email's button works on the
 * day it lands and is dead by the next morning, with thirteen days of terms
 * still to run and nothing chasing it.
 *
 * The stored session cannot simply be made to last longer: `expires_at` is
 * capped at 24 hours from creation, so there is no session long-lived enough
 * to email. The link has to be resolved when it is clicked, not when it is
 * sent — which means the address in the email must be ours, and this is what
 * sits behind it.
 *
 * `Instalment.paymentUrl` is kept as a cache rather than the truth: reusing a
 * session Stripe still honours keeps a client who clicks twice on one checkout
 * instead of two, which matters because two live sessions for one instalment
 * is the double-collection window the schedule flow exists to close.
 */

export interface CheckoutInstalment {
  id: string;
  projectId: string;
  index: number;
  label: string;
  amountCents: number;
  paymentUrl: string | null;
  stripeSessionId: string | null;
  invoiceNumber: string | null;
}

export interface CheckoutProject {
  id: string;
  name: string;
  clientEmail: string;
}

/**
 * Is the session we last minted still one Stripe would take money through?
 *
 * Only `open` counts. An expired session shows the client a Stripe page that
 * explains nothing, and a `complete` one belongs to a payment that already
 * happened — sending someone back to either is how a paid invoice gets paid
 * twice or an unpaid one gets abandoned.
 */
export async function sessionStillOpen(
  stripe: Pick<Stripe, 'checkout'>,
  sessionId: string | null
): Promise<boolean> {
  if (!sessionId) return false;
  const stored = await stripe.checkout.sessions.retrieve(sessionId).catch(() => null);
  return stored?.status === 'open';
}

/**
 * The URL to send a client to right now, minting a new session if the stored
 * one has died. Returns null only when Stripe itself refuses, which the caller
 * has to handle — a client who cannot pay is the failure this whole module is
 * about, so it must never be swallowed into a broken button.
 */
export async function liveCheckoutUrl(
  stripe: Pick<Stripe, 'checkout'>,
  inst: CheckoutInstalment,
  project: CheckoutProject,
  siteUrl: string,
  invoiceId?: string | null,
  /**
   * What is actually still owed, when that is less than what was billed.
   *
   * An instalment carries what it BILLED and nothing about what has arrived,
   * and it stays `due` until an invoice is settled in full — which is right,
   * because the rest is still owed. But money can reach a bill without
   * closing it: a client who transfers half of a $12,000 instalment leaves a
   * `due` row for $12,000 with $6,000 outstanding. Charging the row's face
   * value takes $12,000 from somebody who has already sent $6,000.
   *
   * Optional, and absent means the full amount, because every caller that
   * cannot see the ledger should keep behaving exactly as it did.
   */
  outstandingCents?: number
): Promise<{ url: string; sessionId: string | null; minted: boolean } | null> {
  const dueCents =
    typeof outstandingCents === 'number' && outstandingCents > 0
      ? Math.min(outstandingCents, inst.amountCents)
      : inst.amountCents;
  const partPaid = dueCents < inst.amountCents;

  /*
   * A cached link is only reusable while it still asks for the right money.
   * The stored session was minted for the face value; once part of it has
   * been paid, that session is a request for more than is owed and reusing it
   * is the same overcharge by a slower route.
   */
  if (!partPaid && inst.paymentUrl && (await sessionStillOpen(stripe, inst.stripeSessionId))) {
    return { url: inst.paymentUrl, sessionId: inst.stripeSessionId, minted: false };
  }

  /*
   * Kill what we just refused to reuse.
   *
   * Refusing to hand back the stored session is only half the job. On the
   * part-paid branch that session is still `open` and still in the client's
   * inbox asking for the face value, so declining to reuse it and then
   * minting a smaller one beside it produces exactly the thing the paragraph
   * at the top of this file calls the double-collection window: two live
   * checkouts for one instalment. A client who transfers half of a $12,000
   * payment and then clicks the original email sends the other $12,000.
   *
   * The instalment send route already expires the old session before minting
   * a replacement. This is the same act and needs the same clean-up. Failures
   * are swallowed on purpose — already expired, already paid, or never
   * existed are all fine, and none of them are a reason to deny somebody a
   * way to pay.
   */
  if (inst.stripeSessionId) {
    await stripe.checkout.sessions.expire(inst.stripeSessionId).catch(() => null);
  }

  try {
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: project.clientEmail,
      success_url: `${siteUrl}/client/${project.id}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/client/${project.id}`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: dueCents,
            product_data: {
              name: partPaid
                ? `${project.name} — ${inst.label} (balance)`
                : `${project.name} — ${inst.label}`,
            },
          },
        },
      ],
      // The same shape every other mint site uses, so the webhook settles this
      // exactly as it would have settled the emailed link. Dropping the
      // invoice here would leave a paid instalment beside an open invoice.
      metadata: {
        existingProjectId: project.id,
        instalmentId: inst.id,
        ...(invoiceId ? { invoiceId } : {}),
        invoiceNumber: inst.invoiceNumber ?? '',
        paymentType: inst.index === 1 ? 'deposit' : 'balance',
      },
    });
    if (!checkout.url) return null;
    return { url: checkout.url, sessionId: checkout.id, minted: true };
  } catch (error) {
    console.error(`Could not mint a checkout for instalment ${inst.id}:`, error);
    return null;
  }
}
