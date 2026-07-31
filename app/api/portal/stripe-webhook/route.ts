import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { estimate, formatMoney, getProject } from '@/lib/pricing';
import { readToken } from '@/lib/portal';
import { emailShell, escapeHtml, getResend, mailFrom, studioInbox } from '@/lib/server';

/**
 * Stripe's payment confirmation.
 *
 * The client already gets Stripe's own card receipt, which proves a card was
 * charged and says nothing about what happens next. This is the email that
 * says what they actually want to know: we have it, your dates are booked,
 * here is what is still owed and when.
 *
 * It hangs off a webhook rather than the success page on purpose. A success
 * page fires on every refresh, never fires if the client closes the tab at the
 * wrong moment, and can be opened by anyone who guesses a URL. Stripe calls
 * this endpoint exactly once per completed payment, retries if we are down,
 * and signs every call.
 *
 * Set STRIPE_WEBHOOK_SECRET and point a Stripe endpoint at
 * /api/portal/stripe-webhook for the `checkout.session.completed` event.
 */

/** Stripe signs the exact bytes it sent — any reserialisation breaks it. */
const TOLERANCE_SECONDS = 300;

function verifyStripeSignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;

  // Header looks like: t=1492774577,v1=5257a869e7…,v0=…
  const parts = Object.fromEntries(
    header.split(',').map((piece) => {
      const [k, ...rest] = piece.split('=');
      return [k.trim(), rest.join('=')];
    })
  );

  const timestamp = Number(parts.t);
  const signature = parts.v1;

  if (!Number.isFinite(timestamp) || !signature) return false;

  // Replay window. Without this, a captured call stays valid forever.
  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    // Nothing to verify against, so nothing can be trusted. Fail closed.
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const payload = await request.text();

  if (!verifyStripeSignature(payload, request.headers.get('stripe-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Anything else is acknowledged and ignored — returning non-2xx would make
  // Stripe retry events we were never going to act on.
  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true });
  }

  const session = event.data?.object ?? {};

  if (session.payment_status !== 'paid') {
    return NextResponse.json({ received: true });
  }

  // The session's success_url carries the client's token. Reading the client
  // back out of it means the confirmation is built from the signed agreement,
  // not from anything Stripe was told by a browser.
  const successUrl = typeof session.success_url === 'string' ? session.success_url : '';
  const token = successUrl.split('/client/')[1]?.split('?')[0] ?? '';
  const result = readToken(token);

  if (!result.ok) {
    console.error('Paid session had no readable portal token:', session.id);
    // Still a 200: retrying will not make the token valid, and the money has
    // been taken — this needs a human, not another delivery attempt.
    return NextResponse.json({ received: true });
  }

  const client = result.client;
  const est = estimate(client.selection);
  const project = getProject(client.selection.project);

  const amountPaid =
    typeof session.amount_total === 'number'
      ? session.amount_total / 100
      : Math.round((est.total * client.depositPercent) / 100);

  const balance = est.total - amountPaid;

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured — payment confirmation not sent');
    return NextResponse.json({ received: true });
  }

  const safeName = escapeHtml(client.name);
  const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/client/${token}`;

  const confirmation = await getResend().emails.send({
    from: mailFrom(),
    to: client.email,
    replyTo: studioInbox(),
    subject: `Deposit received — we're booked in`,
    html: emailShell(
      `<h2 style="color:#000;">Thank you, ${safeName} — that's the deposit in.</h2>
       <p style="font-size:28px;font-weight:700;color:#000;margin:16px 0 4px;">${formatMoney(amountPaid)}</p>
       <p style="color:#888;font-size:13px;margin:0 0 24px;">paid ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
       <p style="color:#666;line-height:1.6;">
         Your slot in the schedule is now held, which it wasn't before — that's the
         only thing the deposit changes, and it's the thing that matters. We start on
         ${escapeHtml(project?.name ?? 'your project')} as soon as your onboarding
         answers are in.
       </p>
       <table style="width:100%;border-collapse:collapse;margin:24px 0;">
         <tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#444;font-size:14px;">Project total</td><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#111;font-size:14px;text-align:right;">${formatMoney(est.total)}</td></tr>
         <tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#444;font-size:14px;">Paid today</td><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#111;font-size:14px;text-align:right;">${formatMoney(amountPaid)}</td></tr>
         <tr><td style="padding:8px 0;color:#444;font-size:14px;"><strong>Due before launch</strong></td><td style="padding:8px 0;color:#111;font-size:14px;text-align:right;"><strong>${formatMoney(balance)}</strong></td></tr>
       </table>
       <p style="color:#666;line-height:1.6;">
         Nothing else is owed until launch, and we'll never charge you anything you
         haven't seen on your project page first.
       </p>
       <p style="margin:28px 0;">
         <a href="${portalUrl}" style="background:#000;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Open your project</a>
       </p>
       <p style="color:#999;font-size:13px;line-height:1.6;">
         Stripe has emailed you a card receipt separately for your accounts. Reply to
         this email any time — it reaches a person.
       </p>`
    ),
  });

  if (confirmation.error) {
    console.error('Payment confirmation failed:', confirmation.error);
  }

  const studio = await getResend().emails.send({
    from: mailFrom(),
    to: studioInbox(),
    replyTo: client.email,
    subject: `💰 Deposit paid — ${client.name}, ${formatMoney(amountPaid)}`,
    html: emailShell(
      `<h2 style="color:#000;">Deposit received</h2>
       <p style="font-size:28px;font-weight:700;color:#000;margin:8px 0 24px;">${formatMoney(amountPaid)}</p>
       <p><strong>Client:</strong> ${safeName} · ${escapeHtml(client.email)}</p>
       <p><strong>Company:</strong> ${escapeHtml(client.company ?? '—')}</p>
       <p><strong>Building:</strong> ${escapeHtml(project?.name ?? '—')}</p>
       <p><strong>Total:</strong> ${formatMoney(est.total)} · <strong>Balance:</strong> ${formatMoney(balance)}</p>
       <p style="color:#666;margin-top:20px;">Book the slot, and chase the onboarding form if it isn't in yet.</p>`
    ),
  });

  if (studio.error) console.error('Studio payment notification failed:', studio.error);

  return NextResponse.json({ received: true });
}
