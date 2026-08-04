import Stripe from 'stripe';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
  depositAmount,
  formatCents,
  type AddOnKey,
  type BaseService,
  type ClientType,
  type TimelineKey,
} from './pricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

export interface CheckoutInput {
  baseService: BaseService;
  addOns: AddOnKey[];
  clientType: ClientType;
  timeline: TimelineKey;
  clientEmail: string;
  company: string;
  contactName?: string;
  phone?: string;
  /**
   * The CRM lead this checkout belongs to. Carried through Stripe metadata so
   * the webhook can promote the same row to "won" on payment instead of the
   * paying customer arriving as an unrelated record.
   */
  leadId?: string;
}

/**
 * Create a Stripe checkout session priced from the /start calculator selection
 */
export async function createCheckoutSession(
  input: CheckoutInput,
  successUrl: string,
  cancelUrl: string
): Promise<{ sessionId: string; url: string } | null> {
  try {
    const breakdown = calculatePrice({
      baseService: input.baseService,
      addOns: input.addOns,
      clientType: input.clientType,
      timeline: input.timeline,
    });

    const serviceLabel = BASE_SERVICES[input.baseService].label;
    const addOnLabels = input.addOns.map((key) => ADD_ONS[key].label);

    /**
     * Charge the deposit, not the whole project.
     *
     * The /start FAQ promises "a 50% deposit to begin Discovery, with the
     * remaining balance due once Build is complete" — and everything
     * downstream is already built for that: the webhook branches on
     * `paymentType === 'deposit'`, Payment.type distinguishes deposit from
     * balance, and /api/admin/projects/[id]/collect-balance exists to take
     * the rest. Only this call had been left billing the full total, so a
     * client configuring a $20k build was charged $20k at a page that told
     * them they owed half. Billing double what the page promised is the kind
     * of error that ends in a chargeback, so the deposit is authoritative here.
     */
    const deposit = depositAmount(breakdown.totalPrice);

    const scope =
      addOnLabels.length > 0
        ? `${TIMELINES[input.timeline].label} timeline, ${CLIENT_TYPES[input.clientType].label} + ${addOnLabels.join(', ')}`
        : `${TIMELINES[input.timeline].label} timeline, ${CLIENT_TYPES[input.clientType].label}`;
    // Say what this charge is on the Stripe page itself, where the amount is
    // about to be confirmed — the balance is the surprise worth pre-empting.
    const description = `50% deposit of ${formatCents(breakdown.totalPrice)} total — ${scope}. Balance due before launch.`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Bothmade ${serviceLabel} — ${input.company} (50% deposit)`,
              description,
            },
            unit_amount: deposit,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: input.clientEmail,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        clientEmail: input.clientEmail,
        company: input.company,
        contactName: input.contactName || '',
        phone: input.phone || '',
        baseService: input.baseService,
        addOns: input.addOns.join(','),
        clientType: input.clientType,
        timeline: input.timeline,
        basePrice: String(breakdown.basePrice),
        totalPrice: String(breakdown.totalPrice),
        // The webhook reads both: `paymentType` decides whether this books as
        // a deposit or a full payment, `depositAmount` is what actually got
        // charged, and `totalPrice` stays the project's contract value so the
        // outstanding balance is derivable.
        depositAmount: String(deposit),
        paymentType: 'deposit',
        ...(input.leadId ? { leadId: input.leadId } : {}),
      },
    });

    if (!session.url) {
      return null;
    }

    return { sessionId: session.id, url: session.url };
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return null;
  }
}

export { formatCents };

/**
 * Get a Stripe session
 */
export async function getCheckoutSession(
  sessionId: string
): Promise<Stripe.Checkout.Session | null> {
  try {
    return await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    console.error('Error retrieving session:', error);
    return null;
  }
}

/**
 * Construct event from webhook signature
 *
 * Returning null here is the whole sale silently going nowhere: the caller
 * answers Stripe with a 400, so no client account is created, no project
 * appears, and no welcome email with the generated password is sent — while
 * the customer's card was charged perfectly happily.
 *
 * An unset STRIPE_WEBHOOK_SECRET lands in exactly the same place as a forged
 * request, because an empty secret makes constructEvent throw the same way a
 * bad signature does. Those are opposite problems — one is a misconfigured
 * deployment, the other is an attack — so name the first one explicitly
 * rather than making someone read a signature-mismatch trace and guess.
 *
 * Missing config is still a rejection. A webhook that cannot be verified is
 * never trusted, whatever the reason.
 */
export function constructWebhookEvent(
  body: string | Buffer,
  signature: string
): Stripe.Event | null {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || '';

  if (!webhookSecret) {
    console.error(
      'STRIPE_WEBHOOK_SECRET is not set — rejecting this webhook. Every ' +
        'payment will complete in Stripe while creating no client account, ' +
        'no project and no welcome email until it is set. Copy the signing ' +
        'secret (whsec_...) from the endpoint under Stripe > Developers > ' +
        'Webhooks and set it in the environment. Test mode and live mode ' +
        'issue different secrets, and each endpoint has its own.'
    );
    return null;
  }

  try {
    return stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return null;
  }
}

export default stripe;
