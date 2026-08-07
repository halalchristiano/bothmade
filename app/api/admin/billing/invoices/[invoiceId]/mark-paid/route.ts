import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { readReason } from '@/lib/invoice-lifecycle';
import { canMarkPaid, manualPaymentType } from '@/lib/invoice-settlement';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

/**
 * Record money that arrived some other way.
 *
 * ## What was missing
 *
 * Every invoice in the system could only be settled by Stripe. The invoice
 * email offers the alternative in as many words — "reply to this email if
 * you'd rather pay another way" — and clients take it: a bank transfer, a
 * cheque, a card taken over the phone. Nothing on our side could record that
 * it happened.
 *
 * So the money arrived and the invoice stayed open. Forever. It kept counting
 * toward the outstanding total on the billing page, it kept surfacing in the
 * chase queue, and the client's own dashboard kept showing "Due" with a Pay
 * button next to an invoice they had already paid. The only way out was to
 * cancel it, which writes a lie into the books: a cancelled invoice is one
 * that should never have existed, and this one was paid.
 *
 * ## The link comes down first
 *
 * The dangerous half of this is not the database write — it is that a paid
 * invoice with a live payment link is an invoice the client can pay a second
 * time. That is the same window the void route closes and for the same
 * reason, so the same order applies: Stripe first, and a failure there stops
 * the whole thing rather than being logged and shrugged at.
 *
 * ## It is a payment, not a status
 *
 * A Payment row is written alongside, because every revenue figure in the
 * app reads payments rather than invoice statuses. Flipping the status alone
 * would settle the invoice and leave the money invisible to all of them. Its
 * type decides whether it counts toward the project's contracted price — see
 * manualPaymentType() and amountPaidTowardProject() for why a one-off charge
 * must not.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { invoiceId } = await params;
    const body = (await request.json().catch(() => null)) as { method?: unknown } | null;

    /*
     * How it arrived, required rather than optional.
     *
     * "Paid" with nothing beside it is the version of this record that cannot
     * be reconciled against a bank statement a year later — and the person
     * who could say which transfer it was is never in the room. Same argument
     * as the void and refund reasons, which is why it reuses their reader.
     */
    const method = readReason(body?.method);
    if (!method) {
      return NextResponse.json(
        { error: 'Say how it arrived — "bank transfer, ref ACME0312" is enough to reconcile it later.' },
        { status: 400 }
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { project: { select: { id: true } } },
    });
    if (!invoice) {
      return NextResponse.json({ error: 'That invoice no longer exists.' }, { status: 404 });
    }

    const allowed = canMarkPaid(invoice);
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.error }, { status: 409 });
    }

    // Which instalment this settles, if any — it decides both the payment
    // type and whether there is a checkout session to expire.
    const instalment = await prisma.instalment.findUnique({
      where: { invoiceNumber: invoice.number },
      select: { id: true, index: true, stripeSessionId: true },
    });

    // The way to pay it comes down before it is recorded as paid, so nobody
    // can pay it twice. Custom charges carry a payment link; instalments are
    // paid through a checkout session held on their own row.
    if (invoice.stripePaymentLinkId) {
      try {
        await stripe.paymentLinks.update(invoice.stripePaymentLinkId, { active: false });
      } catch (error) {
        console.error(`Mark paid ${invoice.number}: could not deactivate payment link:`, error);
        return NextResponse.json(
          {
            error:
              "Stripe wouldn't take the payment link down, so the client could still pay this again. Nothing has been changed — try again in a moment.",
          },
          { status: 502 }
        );
      }
    }

    if (instalment?.stripeSessionId) {
      try {
        await stripe.checkout.sessions.expire(instalment.stripeSessionId);
      } catch (error) {
        // Already expired, already paid, or gone. Only a session Stripe still
        // considers payable is a reason to stop.
        const code = (error as { code?: string })?.code;
        if (code !== 'resource_missing' && code !== 'checkout_session_expired') {
          console.error(`Mark paid ${invoice.number}: could not expire the checkout session:`, error);
          return NextResponse.json(
            {
              error:
                "Stripe wouldn't expire the payment session, so the client could still pay this again. Nothing has been changed — try again in a moment.",
            },
            { status: 502 }
          );
        }
      }
    }

    const paidAt = new Date();

    const settled = await prisma.$transaction(async (tx) => {
      /*
       * Scoped to a still-open row, so two people pressing this at once
       * settle it once. The second update matches nothing and the second
       * payment is not written.
       */
      const moved = await tx.invoice.updateMany({
        where: { id: invoice.id, status: 'open' },
        data: { status: 'paid', paidAt, paidMethod: method, paidById: session.userId },
      });
      if (moved.count === 0) return null;

      await tx.payment.create({
        data: {
          projectId: invoice.projectId,
          amount: invoice.amountCents,
          type: manualPaymentType(instalment),
          invoiceId: invoice.id,
          // Null, and deliberately so: there is no Stripe session behind this
          // money. The column is nullable and unique, and Postgres allows any
          // number of nulls in a unique index.
          stripeSessionId: null,
        },
      });

      if (instalment) {
        await tx.instalment.updateMany({
          where: { id: instalment.id, status: { not: 'paid' } },
          data: { status: 'paid', paidAt },
        });
      }

      return tx.invoice.findUnique({
        where: { id: invoice.id },
        include: {
          client: { select: { id: true, company: true, email: true } },
          project: { select: { id: true, name: true } },
          issuedBy: { select: { name: true, email: true } },
        },
      });
    });

    if (!settled) {
      return NextResponse.json(
        { error: 'That invoice was settled by somebody else a moment ago. Nothing was recorded twice.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, invoice: settled }, { status: 200 });
  } catch (error) {
    console.error('Mark invoice paid error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
