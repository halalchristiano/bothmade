import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { readRefundRequest, settlement, type SettlementLine } from '@/lib/invoice-lifecycle';
import { grossReceivedCents, receivedCents } from '@/lib/invoice-settlement';
import { restoreInvoicePdfAsPartPaid } from '@/lib/invoice-dispatch';
import { sendInvoiceRefundedEmail } from '@/lib/email';
import { formatCentsExact } from '@/lib/pricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

/**
 * Give money back.
 *
 * Section 8(l) of the contract: "A refund due under this Section is processed
 * to the original payment method." So a card refund runs through Stripe for
 * real, and the two other methods exist because the contract's world is
 * bigger than Stripe's — a payment that arrived by transfer goes back by
 * transfer, and a credit is value held rather than money moved. All three are
 * recorded identically; what differs is whether anything actually left the
 * account, and the books say which.
 *
 * The ordering is the whole design. Stripe moves the money FIRST, and only a
 * confirmed refund is written down. The other order — record it, then call
 * Stripe — produces the failure that cannot be cleaned up: books saying the
 * client was refunded while the money is still sitting here, and nobody
 * looking because the screen says it is done.
 *
 * A refund cannot be undone. Neither can this route.
 */

/** Deductions the contract allows to come off a refund. Free-form label + amount. */
function readDeductions(value: unknown): SettlementLine[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > 10) return null;

  const out: SettlementLine[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { label, amountCents } = raw as { label?: unknown; amountCents?: unknown };
    if (typeof label !== 'string' || !label.trim()) return null;
    if (typeof amountCents !== 'number' || !Number.isFinite(amountCents) || amountCents < 0) return null;
    out.push({ label: label.trim().slice(0, 120), amountCents: Math.round(amountCents) });
  }
  return out;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { invoiceId } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: { select: { company: true, email: true, contactName: true } },
        project: { select: { id: true, name: true, status: true } },
        payments: { select: { id: true, stripeSessionId: true, amount: true, type: true } },
      },
    });
    if (!invoice) {
      return NextResponse.json({ error: 'That invoice no longer exists.' }, { status: 404 });
    }

    const parsed = readRefundRequest(
      invoice,
      { amountCents: body?.amountCents, method: body?.method, reason: body?.reason },
      // An open invoice may still be holding money — someone sent part of it
      // by transfer. What can go back is what came in, not the face value.
      grossReceivedCents(invoice.payments)
    );
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { amountCents, method, reason } = parsed.draft;

    const deductions = readDeductions(body?.deductions);
    if (deductions === null) {
      return NextResponse.json(
        { error: 'Every deduction needs a description and an amount of zero or more.' },
        { status: 400 }
      );
    }

    const statement = settlement({ refundCents: amountCents, deductions });

    let stripeRefundId: string | null = null;
    if (method === 'stripe') {
      // The Payment row stores the Checkout Session, not the charge. The
      // session is what knows which PaymentIntent actually took the money.
      const payment = invoice.payments.find((p) => p.stripeSessionId);
      if (!payment?.stripeSessionId) {
        return NextResponse.json(
          {
            error:
              "There's no Stripe payment recorded against this invoice, so there's nothing to refund a card from. If the money came in another way, record it as a manual refund.",
          },
          { status: 409 }
        );
      }

      let paymentIntentId: string | null = null;
      try {
        const checkout = await stripe.checkout.sessions.retrieve(payment.stripeSessionId);
        paymentIntentId =
          typeof checkout.payment_intent === 'string'
            ? checkout.payment_intent
            : checkout.payment_intent?.id ?? null;
      } catch (error) {
        console.error(`Refund ${invoice.number}: could not read the checkout session:`, error);
        return NextResponse.json(
          { error: "Couldn't reach Stripe to find the original payment. Nothing has been changed." },
          { status: 502 }
        );
      }

      if (!paymentIntentId) {
        return NextResponse.json(
          {
            error:
              "Stripe has no payment against that checkout — it may never have completed. Record this as a manual refund if the money went back another way.",
          },
          { status: 409 }
        );
      }

      try {
        // The net is what actually leaves the account: deductions the contract
        // allows us to withhold are withheld, not refunded and re-invoiced.
        const refund = await stripe.refunds.create(
          {
            payment_intent: paymentIntentId,
            amount: statement.returnedToClientCents,
            reason: 'requested_by_customer',
            metadata: { invoiceId: invoice.id, invoiceNumber: invoice.number },
          },
          // Stripe's own guard against a double-click becoming two refunds.
          { idempotencyKey: `refund-${invoice.id}-${invoice.refundedCents}-${amountCents}` }
        );
        stripeRefundId = refund.id;
      } catch (error) {
        console.error(`Refund ${invoice.number}: Stripe refused the refund:`, error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
          { error: `Stripe refused the refund: ${message}. Nothing has been changed.`, staffOnly: true },
          { status: 502 }
        );
      }
    }

    // Money has moved (or deliberately hasn't). Only now is it written down.
    //
    // The refund is also a ledger entry, not just a flag on the invoice. Every
    // balance calculation in the system reads Payment rows — see
    // amountPaidTowardProject() — so without a negative row a refunded deposit
    // goes on reading as money received, and the project it belongs to reads
    // as paid down by an amount that is back in the client's account.
    //
    // The negative row carries the *original* payment's type, which makes it
    // net out in exactly the right place: a refunded `custom` charge leaves
    // the project balance alone (it was never counted toward it), while a
    // refunded deposit correctly reopens it.
    //
    // A credit moves no money and so writes no ledger row. That is the whole
    // distinction: the client is owed value, the studio still holds the cash.
    const original = invoice.payments[0];
    const writeLedgerRow = method !== 'credit' && Boolean(original);

    /*
     * Scoped to the invoice as it was READ, which is what makes a double-click
     * safe rather than merely half-safe.
     *
     * The idempotency key above already stops Stripe sending the money twice —
     * two racing requests both compute `refund-inv_1-0-250000` and Stripe
     * replays the first refund for the second. What it does not touch is this
     * side. Both requests read `refundedCents: 0`, both passed the ceiling
     * check on it, and both then wrote `0 + 250000` and created a NEGATIVE
     * PAYMENT ROW. The invoice ends up correct by luck — last writer wins on
     * the same number — and the ledger ends up saying $5,000 went back to a
     * client who received $2,500.
     *
     * That is the expensive half. Every balance figure in the app is derived
     * from Payment rows rather than from invoice fields (see
     * amountPaidTowardProject), so the phantom row reopens a paid-off project
     * and understates revenue, and nothing on any screen contradicts it.
     *
     * `refundedCents` in the WHERE is the version check: it is exactly the
     * value the ceiling was measured against, so a second request that lost
     * the race matches nothing and stops before writing anything. Same shape
     * as the guard in the mark-paid route, for the same reason.
     */
    const claimed = await prisma.invoice.updateMany({
      where: { id: invoice.id, refundedCents: invoice.refundedCents },
      data: {
        refundedCents: invoice.refundedCents + amountCents,
        refundedAt: new Date(),
        refundReason: reason,
        refundMethod: method,
        stripeRefundId: stripeRefundId ?? invoice.stripeRefundId,
        refundedById: session.userId,
      },
    });

    if (claimed.count === 0) {
      /*
       * Somebody else refunded this in the moment between our read and our
       * write. The money is fine — Stripe replayed rather than re-sent, so
       * exactly one refund exists — and their write recorded it. Ours must
       * not be recorded a second time.
       */
      return NextResponse.json(
        {
          error:
            'That invoice was refunded by somebody else a moment ago. The money went back once; nothing was recorded twice.',
        },
        { status: 409 }
      );
    }

    const [updated] = await prisma.$transaction([
      prisma.invoice.findUnique({ where: { id: invoice.id } }),
      ...(writeLedgerRow
        ? [
            prisma.payment.create({
              data: {
                projectId: invoice.projectId,
                // Negative: this is the same ledger the payments live in, and
                // a refund is a payment going the other way.
                amount: -statement.returnedToClientCents,
                type: original!.type,
                invoiceId: invoice.id,
              },
            }),
          ]
        : []),
    ]);

    const clientEmail = invoice.sentToEmail || invoice.client.email;
    const notifyClient = body?.notifyClient !== false && Boolean(clientEmail);
    let clientNotified = false;
    if (notifyClient && clientEmail) {
      const sent = await sendInvoiceRefundedEmail({
        to: clientEmail,
        contactName: invoice.client.contactName,
        company: invoice.client.company,
        invoiceNumber: invoice.number,
        description: invoice.description,
        method,
        reason,
        refundLabel: formatCentsExact(amountCents),
        deductions: statement.deductions.map((d) => ({
          label: d.label,
          amountLabel: formatCentsExact(d.amountCents),
        })),
        dueFromClientLabel: formatCentsExact(statement.dueFromClientCents),
        returnedToClientLabel: formatCentsExact(statement.returnedToClientCents),
      }).catch((error) => {
        console.error(`Refund ${invoice.number}: client email failed:`, error);
        return { sent: false };
      });
      clientNotified = Boolean(sent?.sent);
    }

    await prisma.projectUpdate.create({
      data: {
        projectId: invoice.projectId,
        title:
          method === 'credit'
            ? `Credit of ${formatCentsExact(amountCents)} applied`
            : `Refund of ${formatCentsExact(statement.returnedToClientCents)} issued`,
        description:
          method === 'credit'
            ? `${formatCentsExact(amountCents)} from invoice ${invoice.number} is held as a credit against future work. ${reason}`
            : `${formatCentsExact(statement.returnedToClientCents)} from invoice ${invoice.number} is on its way back to you${
                method === 'stripe' ? ' via the original card, usually within 5–10 days' : ''
              }. ${reason}`,
        statusStage: invoice.project.status,
        userId: session.userId,
      },
    }).catch((error) => console.error(`Refund ${invoice.number}: timeline entry failed:`, error));

    /*
     * The document catches up.
     *
     * A refund on an OPEN invoice leaves it open — it moves `refundedCents`,
     * not `status` — so nothing here rebuilds it as paid or as cancelled, and
     * the stored file went on reading "Amount due: $1,800" to somebody we had
     * just sent $900 back to. That is the copy their bookkeeper has.
     *
     * Only the open case: a settled invoice's PDF says "Paid", which is still
     * true after a refund, and the refund email carries the settlement in the
     * shape Section 8(l) requires. Rewriting a receipt into something else is
     * a different document, not a corrected one.
     *
     * Best-effort and last, like every other rebuild: the money has moved and
     * a refund is not undone because a PDF would not render.
     */
    let rebuiltPdfUrl: string | null = null;
    if (invoice.status === 'open') {
      /*
       * A credit moves no money, so nothing comes off what is sitting here.
       *
       * The ledger already works this way — a credit writes no negative
       * Payment row, which is the whole distinction between the two. Taking
       * it off here anyway would print a document saying less of the client's
       * money is here than actually is, on the one path where the cash never
       * left the account.
       */
      const stillHere =
        receivedCents(invoice.payments) - (method === 'credit' ? 0 : statement.returnedToClientCents);
      rebuiltPdfUrl = await restoreInvoicePdfAsPartPaid(
        prisma,
        { ...invoice, client: invoice.client },
        {
          receivedCents: Math.max(0, stillHere),
          refundedCents: invoice.refundedCents + amountCents,
        }
      ).catch((error) => {
        console.error(`Refund ${invoice.number}: PDF not rebuilt:`, error);
        return null;
      });
    }

    return NextResponse.json(
      {
        success: true,
        invoice: updated,
        settlement: statement,
        clientNotified,
        // Same reason as the void route: the PDF is what a client's
        // bookkeeper files, and a failed rebuild leaves it asking for money
        // we have just given back.
        warnings:
          invoice.status === 'open' && !rebuiltPdfUrl
            ? [
                `${invoice.number} still has a PDF asking for the full ${formatCentsExact(invoice.amountCents)} — it couldn't be rebuilt. The refund is recorded either way.`,
              ]
            : [],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Refund invoice error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
