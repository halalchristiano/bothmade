import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { canVoid, readReason } from '@/lib/invoice-lifecycle';
import { sendInvoiceVoidedEmail } from '@/lib/email';
import { formatCentsExact } from '@/lib/pricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

/**
 * Cancel an invoice that should never have existed.
 *
 * The important half of this is not the database write — it is deactivating
 * the Stripe payment link. An invoice marked void in our books whose link
 * still works is worse than no void at all: the client pays an invoice we
 * have written off, the webhook marks a voided invoice paid, and the two
 * systems disagree about money. So the link goes down first, and a failure to
 * take it down blocks the void rather than being logged and shrugged at.
 *
 * A paid invoice is never voidable — see canVoid(). Voiding one would erase a
 * payment that really happened, leaving the client with no evidence of it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { invoiceId } = await params;
    const body = (await request.json().catch(() => null)) as {
      reason?: unknown;
      notifyClient?: unknown;
    } | null;

    const reason = readReason(body?.reason);
    if (!reason) {
      return NextResponse.json(
        { error: 'Say why this invoice is being cancelled — it goes on the record.' },
        { status: 400 }
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: { select: { company: true, email: true, contactName: true } },
        project: { select: { id: true, name: true, status: true } },
      },
    });
    if (!invoice) {
      return NextResponse.json({ error: 'That invoice no longer exists.' }, { status: 404 });
    }

    const allowed = canVoid(invoice);
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.error }, { status: 409 });
    }

    // Kill the way to pay it before recording that it can't be paid.
    if (invoice.stripePaymentLinkId) {
      try {
        await stripe.paymentLinks.update(invoice.stripePaymentLinkId, { active: false });
      } catch (error) {
        console.error(`Void ${invoice.number}: could not deactivate payment link:`, error);
        return NextResponse.json(
          {
            error:
              "Stripe wouldn't take the payment link down, so the client could still pay this. Nothing has been changed — try again in a moment.",
          },
          { status: 502 }
        );
      }
    }

    /**
     * And the schedule's half of it.
     *
     * Only custom charges carry a `stripePaymentLinkId`. An instalment
     * invoice is paid through a Checkout Session held on the Instalment row,
     * so voiding one used to take nothing down at all — this route's own
     * promise, that the link dies before the void is recorded, simply did not
     * apply to the invoices the studio sends most.
     *
     * Worse than the live link was the chase. The instalment stayed `due`,
     * and payment-clock chases every `due` instalment daily-to-weekly, minting
     * a FRESH Stripe session each time. So the client got an email saying the
     * invoice was cancelled and there was nothing to pay, and then a working
     * payment link for it the next morning, forever.
     */
    const instalment = await prisma.instalment.findUnique({
      where: { invoiceNumber: invoice.number },
      select: { id: true, label: true, stripeSessionId: true },
    });

    if (instalment?.stripeSessionId) {
      try {
        await stripe.checkout.sessions.expire(instalment.stripeSessionId);
      } catch (error) {
        // Already expired, already paid, or gone. Stripe says which, and only
        // a session it still considers payable is a reason to stop.
        const code = (error as { code?: string })?.code;
        if (code !== 'resource_missing' && code !== 'checkout_session_expired') {
          console.error(`Void ${invoice.number}: could not expire the checkout session:`, error);
          return NextResponse.json(
            {
              error:
                "Stripe wouldn't expire the payment session, so the client could still pay this. Nothing has been changed — try again in a moment.",
            },
            { status: 502 }
          );
        }
      }
    }

    const [voided] = await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'void',
          voidedAt: new Date(),
          voidReason: reason,
          voidedById: session.userId,
          // The link is dead; leaving the URL on the record would put a button
          // on two dashboards that goes to a Stripe page saying nothing useful.
          paymentUrl: null,
        },
      }),
      /*
       * Back to `scheduled`, not to `void`.
       *
       * A voided invoice is a cancelled BILL, not cancelled scope — the money
       * is still owed under the contract, and marking the instalment void
       * would quietly delete it from the project's remaining balance because
       * every balance calculation skips void rows. That would turn "we sent
       * the wrong invoice" into "the client owes us 30% less", silently.
       *
       * The invoice number is cleared with it: a re-send reuses the stored
       * number when it still matches, which would put a voided invoice back
       * in the client's inbox. Nulling it makes the next send mint a fresh
       * one. The chase counters go too, so the new invoice gets the full
       * fourteen days rather than inheriting a schedule that already thinks
       * it is three chases deep.
       */
      ...(instalment
        ? [
            prisma.instalment.update({
              where: { id: instalment.id },
              data: {
                status: 'scheduled',
                invoiceNumber: null,
                stripeSessionId: null,
                paymentUrl: null,
                invoicedAt: null,
                dueAt: null,
                emailSentAt: null,
                lastChasedAt: null,
                chaseCount: 0,
              },
            }),
          ]
        : []),
    ]);

    // Only worth telling them if they were told about it in the first place.
    const notifyClient = body?.notifyClient !== false && Boolean(invoice.sentToEmail);
    let clientNotified = false;
    if (notifyClient && invoice.sentToEmail) {
      const sent = await sendInvoiceVoidedEmail({
        to: invoice.sentToEmail,
        contactName: invoice.client.contactName,
        company: invoice.client.company,
        invoiceNumber: invoice.number,
        description: invoice.description,
        amountLabel: formatCentsExact(invoice.amountCents),
        reason,
      }).catch((error) => {
        console.error(`Void ${invoice.number}: client email failed:`, error);
        return { sent: false };
      });
      clientNotified = Boolean(sent?.sent);
    }

    // The client's own dashboard is a timeline, and an invoice quietly
    // disappearing off it is exactly the sort of thing that gets asked about
    // on a call nobody has the answer to.
    await prisma.projectUpdate.create({
      data: {
        projectId: invoice.projectId,
        title: `Invoice ${invoice.number} cancelled`,
        description: `${invoice.description} (${formatCentsExact(invoice.amountCents)}) has been cancelled — there's nothing to pay. ${reason}`,
        statusStage: invoice.project.status,
        userId: session.userId,
      },
    }).catch((error) => console.error(`Void ${invoice.number}: timeline entry failed:`, error));

    return NextResponse.json({ success: true, invoice: voided, clientNotified }, { status: 200 });
  } catch (error) {
    console.error('Void invoice error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
