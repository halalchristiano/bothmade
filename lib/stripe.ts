import Stripe from 'stripe';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
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
    const description =
      addOnLabels.length > 0
        ? `${TIMELINES[input.timeline].label} timeline, ${CLIENT_TYPES[input.clientType].label} + ${addOnLabels.join(', ')}`
        : `${TIMELINES[input.timeline].label} timeline, ${CLIENT_TYPES[input.clientType].label}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Bothmade ${serviceLabel} — ${input.company}`,
              description,
            },
            unit_amount: breakdown.totalPrice,
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
 */
export function constructWebhookEvent(
  body: string | Buffer,
  signature: string
): Stripe.Event | null {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    return stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return null;
  }
}

export default stripe;
