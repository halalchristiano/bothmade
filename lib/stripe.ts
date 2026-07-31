import { estimate, formatMoney, getProject } from '@/lib/pricing';
import type { PortalClient } from '@/lib/portal';

/**
 * The two Stripe calls this site makes.
 *
 * Talked to over plain `fetch` rather than through the SDK: for two endpoints
 * a dependency buys nothing and costs a package to keep current, and this part
 * of Stripe's wire format is its oldest and most stable.
 *
 * No card data ever touches this server. The client is redirected to Stripe,
 * pays there, and returns with a session id we verify from the server before
 * anyone is shown a receipt.
 */

const STRIPE_API = 'https://api.stripe.com/v1';

export const stripeConfigured = (): boolean => Boolean(process.env.STRIPE_SECRET_KEY);

/** The deposit due, derived from the token's own selection — never from input. */
export function depositAmount(client: PortalClient): number {
  return Math.round((estimate(client.selection).total * client.depositPercent) / 100);
}

export type SessionResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'unconfigured' | 'nothing-due' | 'stripe-error' };

export async function createDepositSession(
  client: PortalClient,
  token: string,
  siteUrl: string
): Promise<SessionResult> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, reason: 'unconfigured' };

  const est = estimate(client.selection);
  const project = getProject(client.selection.project);
  const deposit = depositAmount(client);

  if (deposit <= 0) return { ok: false, reason: 'nothing-due' };

  const params = new URLSearchParams({
    mode: 'payment',
    'payment_method_types[0]': 'card',
    customer_email: client.email,
    client_reference_id: `${client.email}:${client.iat}`,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': (process.env.STRIPE_CURRENCY || 'usd').toLowerCase(),
    'line_items[0][price_data][unit_amount]': String(deposit * 100),
    'line_items[0][price_data][product_data][name]':
      `${project?.name ?? 'Project'} — ${client.depositPercent}% deposit`,
    'line_items[0][price_data][product_data][description]':
      `Deposit against a total of ${formatMoney(est.total)}. Balance due before launch.`,
    success_url: `${siteUrl}/client/${token}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/client/${token}?cancelled=1`,
  });

  try {
    const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const session = await response.json();

    if (!response.ok || !session?.url) {
      console.error('Stripe session creation failed:', session?.error?.message);
      return { ok: false, reason: 'stripe-error' };
    }

    return { ok: true, url: session.url };
  } catch (error) {
    console.error('Stripe request failed:', error);
    return { ok: false, reason: 'stripe-error' };
  }
}

/**
 * Confirms a completed payment. `?session_id=` in the URL proves nothing on
 * its own — anyone can type one — so the receipt is only rendered when Stripe
 * itself reports the session as paid.
 */
export async function verifyPaidSession(sessionId: string): Promise<boolean> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !sessionId) return false;

  try {
    const response = await fetch(
      `${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' }
    );

    if (!response.ok) return false;

    const session = await response.json();
    return session?.payment_status === 'paid';
  } catch {
    return false;
  }
}
