import { NextRequest, NextResponse } from 'next/server';
import { estimate, formatMoney, getProject } from '@/lib/pricing';
import { readToken } from '@/lib/portal';
import { emailShell, escapeHtml, getResend, isAdmin, mailFrom, studioInbox } from '@/lib/server';

/**
 * Studio-only. Confirms a payment that arrived by bank transfer.
 *
 * Card payments confirm themselves through the Stripe webhook. A transfer
 * lands silently in your bank, so without this the client hears nothing — they
 * have sent five figures into the void and are refreshing their email. That
 * silence is the worst moment in the whole process to leave unattended, and it
 * is exactly when a new client starts wondering whether they were wise.
 *
 * One command when you see the money:
 *
 *   curl -X POST https://bothmade.studio/api/portal/mark-paid \
 *     -H "x-admin-secret: $ADMIN_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"token":"<their portal token>"}'
 *
 * Add "amount": 5000 if they paid something other than the deposit — a part
 * payment, or the final balance.
 */

export async function POST(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    token?: unknown;
    amount?: unknown;
    final?: unknown;
  };

  if (typeof body.token !== 'string') {
    return NextResponse.json({ error: 'token is required.' }, { status: 400 });
  }

  const result = readToken(body.token);
  if (!result.ok) {
    return NextResponse.json({ error: `Token ${result.reason}.` }, { status: 400 });
  }

  const client = result.client;
  const est = estimate(client.selection);
  const project = getProject(client.selection.project);

  const deposit = Math.round((est.total * client.depositPercent) / 100);
  const amount =
    typeof body.amount === 'number' && Number.isFinite(body.amount) && body.amount > 0
      ? Math.round(body.amount)
      : deposit;

  const isFinal = body.final === true;
  const balance = Math.max(0, est.total - amount);

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured.' }, { status: 500 });
  }

  const safeName = escapeHtml(client.name);
  const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/client/${body.token}`;

  const sent = await getResend().emails.send({
    from: mailFrom(),
    to: client.email,
    replyTo: studioInbox(),
    subject: isFinal
      ? 'Payment received in full — thank you'
      : "Deposit received — we're booked in",
    html: emailShell(
      `<h2 style="color:#000;">Thank you, ${safeName} — that's ${isFinal ? 'the balance' : 'the deposit'} in.</h2>
       <p style="font-size:28px;font-weight:700;color:#000;margin:16px 0 4px;">${formatMoney(amount)}</p>
       <p style="color:#888;font-size:13px;margin:0 0 24px;">received by bank transfer</p>
       <p style="color:#666;line-height:1.6;">
         ${
           isFinal
             ? `That settles ${escapeHtml(project?.name ?? 'the project')} in full. Nothing further is owed.`
             : `Your slot in the schedule is now held, which it wasn't before — that's the only thing the deposit changes, and it's the thing that matters. We start on ${escapeHtml(project?.name ?? 'your project')} as soon as your onboarding answers are in.`
         }
       </p>
       <table style="width:100%;border-collapse:collapse;margin:24px 0;">
         <tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#444;font-size:14px;">Project total</td><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#111;font-size:14px;text-align:right;">${formatMoney(est.total)}</td></tr>
         <tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#444;font-size:14px;">Received</td><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#111;font-size:14px;text-align:right;">${formatMoney(amount)}</td></tr>
         <tr><td style="padding:8px 0;color:#444;font-size:14px;"><strong>${isFinal ? 'Outstanding' : 'Due before launch'}</strong></td><td style="padding:8px 0;color:#111;font-size:14px;text-align:right;"><strong>${formatMoney(isFinal ? 0 : balance)}</strong></td></tr>
       </table>
       <p style="color:#666;line-height:1.6;">
         This email is your receipt. We'll never ask you for anything you haven't seen
         on your project page first.
       </p>
       <p style="margin:28px 0;">
         <a href="${portalUrl}" style="background:#000;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Open your project</a>
       </p>
       <p style="color:#999;font-size:13px;line-height:1.6;">
         Reply to this email any time — it reaches a person.
       </p>`
    ),
  });

  if (sent.error) {
    console.error('Payment receipt failed:', sent.error);
    return NextResponse.json({ error: 'Could not send the receipt.' }, { status: 502 });
  }

  return NextResponse.json({
    sent: true,
    to: client.email,
    amount,
    balance: isFinal ? 0 : balance,
  });
}
