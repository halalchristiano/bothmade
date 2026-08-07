import { NextRequest, NextResponse } from 'next/server';
import { resolveSiteUrl } from '@/lib/site-url';
import { invoiceDate } from '@/lib/money-dates';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { sendInstalmentEmail } from '@/lib/email';
import { buildInstalmentInvoicePdf } from '@/lib/invoice-pdf';
import { formatInvoiceNumber, invoiceNumberPrefix } from '@/lib/billing';
import { ensureInstalments, instalmentDueDate, instalmentEmailCopy } from '@/lib/instalments';
import { formatCents, formatCentsExact } from '@/lib/pricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

/**
 * The instalment schedule, listed and sent.
 *
 * Open to every staff role, sales included, for the same reason the custom
 * charge route is: sending "Payment 2 of 3" after the client approved their
 * design is not a pricing decision — the price and the split were fixed at
 * signing, and this route can only execute that schedule, never change it.
 *
 * Order of operations follows the house rule for money paperwork: the
 * invoice row is written first, so a send that half-fails is still a charge
 * somebody can see and finish by hand; the PDF, the Stripe session, and the
 * email attach to it as they succeed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await requireStaff();
  if (!session) return unauthorizedResponse();

  const { projectId } = await params;
  // ensureInstalments, not instalmentsForProject: a project that predates the
  // schedule gets one on first sight, derived from what it has already been
  // paid. Otherwise the panel stays blank on every project the studio owned
  // before this shipped, which is exactly how a feature ends up looking like
  // it was never built.
  const instalments = await ensureInstalments(projectId);

  /*
   * `payUrl` beside the raw one, and it is the one to hand to a client.
   *
   * `paymentUrl` on the row is a Stripe Checkout Session, which dies 24 hours
   * after it was minted. The panel offers a "Copy link" button on every due
   * payment — the natural thing to reach for when chasing somebody by hand —
   * and it was copying that, so whatever ops pasted into a message worked
   * today and was a Stripe error page tomorrow.
   *
   * /pay resolves a live session when it is clicked and refuses once the row
   * is settled or cancelled, so it can be shared freely and does not expire.
   */
  const siteUrl = resolveSiteUrl();
  return NextResponse.json({
    success: true,
    instalments: instalments.map((inst) => ({ ...inst, payUrl: `${siteUrl}/pay/${inst.id}` })),
  });
}

async function claimInvoiceNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const issued = await prisma.invoice.count({
    where: { number: { startsWith: invoiceNumberPrefix(year) } },
  });
  return formatInvoiceNumber(year, issued + 1);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { projectId } = await params;
    const body = await request.json().catch(() => ({}));
    const index = Number(body?.index);
    if (!Number.isInteger(index) || index < 1) {
      return NextResponse.json({ error: 'Which payment? Pass its index.' }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // ensureInstalments, same as the GET: a legacy project reached directly —
    // by a stale tab, or a rep who opened the panel before this shipped —
    // should get its schedule rather than an error pointing at the balance
    // flow that a schedule stands down.
    const instalments = await ensureInstalments(projectId);
    if (instalments.length === 0) {
      return NextResponse.json(
        { error: 'This project has no price on it, so there is no schedule to send.' },
        { status: 400 }
      );
    }
    const inst = instalments.find((i) => i.index === index);
    if (!inst) {
      return NextResponse.json({ error: `No Payment ${index} on this project` }, { status: 404 });
    }
    if (inst.status === 'paid') {
      return NextResponse.json({ error: `${inst.label} is already paid` }, { status: 400 });
    }
    // Sending out of order is almost always a mistake — Payment 3 before
    // Payment 2 has cleared means two open invoices racing each other.
    const earlierUnpaid = instalments.find(
      (i) => i.index < index && i.status !== 'paid' && i.status !== 'void'
    );
    if (earlierUnpaid) {
      return NextResponse.json(
        { error: `${earlierUnpaid.label} is still unpaid — send and settle that one first.` },
        { status: 400 }
      );
    }

    // The invoice number is claimed by creating the Invoice row itself —
    // the ledger's unique constraint is the lock, exactly as the custom
    // charge allocator does it. Claiming by stamping the instalment first
    // left a number that existed nowhere in the ledger's namespace, so a
    // concurrent custom charge could take the same number and this
    // instalment would bind to a stranger's invoice.
    //
    // A re-send reuses the stored identity — same number, same amount,
    // fresh link — but only after checking the row actually belongs to
    // this project for this amount; anything else mints fresh.
    let invoice: { id: string; number: string } | null = null;
    if (inst.invoiceNumber) {
      const existing = await prisma.invoice.findUnique({ where: { number: inst.invoiceNumber } });
      // Never a voided one. The void clears this pointer, so reaching here
      // with one means something else went wrong — and re-sending an invoice
      // the client was told was cancelled is the worst way to find out.
      if (
        existing &&
        existing.status !== 'void' &&
        existing.projectId === project.id &&
        existing.amountCents === inst.amountCents
      ) {
        invoice = existing;
      }
    }
    if (!invoice) {
      for (let attempt = 0; attempt < 5 && !invoice; attempt++) {
        const number = await claimInvoiceNumber();
        try {
          invoice = await prisma.invoice.create({
            data: {
              number,
              clientId: project.clientId,
              projectId: project.id,
              description: `${inst.label} — ${project.name}`,
              lineItems: [{ label: `${inst.label} (${inst.percent}% of project total)`, priceCents: inst.amountCents }],
              amountCents: inst.amountCents,
              issuedById: session.userId,
              sentToEmail: project.client.email,
            },
          });
        } catch {
          continue; // P2002: someone else took that number — count again.
        }
      }
      if (!invoice) {
        return NextResponse.json({ error: 'Could not allocate an invoice number — try again.' }, { status: 503 });
      }
      await prisma.instalment.update({
        where: { id: inst.id },
        data: { invoiceNumber: invoice.number },
      });
    }
    const invoiceNumber = invoice.number;

    // Two people clicking Send at once would mint two live checkouts for one
    // payment. Claim the row before touching Stripe: only proceed if it is
    // still exactly as read; a 409 beats a double collection.
    const claimed = await prisma.instalment.updateMany({
      where: { id: inst.id, status: inst.status, stripeSessionId: inst.stripeSessionId },
      data: { invoicedAt: inst.invoicedAt ?? new Date() },
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: `${inst.label} is already being sent by someone else — refresh to see it.` },
        { status: 409 }
      );
    }

    // A re-send replaces the checkout link, so kill the old session first —
    // two live links for one instalment is the double-collection window the
    // old balance flow had, and this flow exists partly to close it.
    if (inst.stripeSessionId) {
      await stripe.checkout.sessions
        .expire(inst.stripeSessionId)
        .catch(() => null); // already expired, already paid, or never existed — all fine
    }

    const siteUrl = resolveSiteUrl();
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: project.client.email,
      success_url: `${siteUrl}/client/${project.id}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/client/${project.id}`,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${project.name} — ${inst.label}`,
              description: `${inst.percent}% of ${formatCents(project.totalPrice)} project total · Invoice ${invoiceNumber}`,
            },
            unit_amount: inst.amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        existingProjectId: project.id,
        instalmentId: inst.id,
        invoiceId: invoice.id,
        invoiceNumber,
        paymentType: inst.index === 1 ? 'deposit' : 'balance',
      },
    });

    const now = new Date();
    const dueAt = instalmentDueDate(now);
    // Both the issue date and the due date printed on the invoice PDF. See
    // lib/money-dates for why these are not rendered in the server's zone.
    const dateLabel = invoiceDate;

    const gateLine =
      inst.trigger === 'design-approval'
        ? `Due on Design Approval — approved ${dateLabel(now)}.`
        : inst.trigger === 'ready-for-launch'
        ? `Due on Ready for Launch — confirmed ${dateLabel(now)}.`
        : `Due on signing.`;

    // The PDF is best-effort by design: a client with a working payment link
    // and no attachment is better off than one with neither.
    let invoicePdf: Buffer | null = null;
    try {
      const schedule = instalments.map((i) => ({
        label: i.label,
        amount: formatCentsExact(i.amountCents),
        status:
          i.status === 'paid' ? ('paid' as const) : i.id === inst.id ? ('due' as const) : ('scheduled' as const),
        triggerLabel:
          i.trigger === 'signing'
            ? 'On signing'
            : i.trigger === 'design-approval'
            ? 'On design approval'
            : 'When ready to launch',
      }));
      invoicePdf = Buffer.from(
        await buildInstalmentInvoicePdf({
          invoiceNumber,
          date: dateLabel(now),
          company: project.client.company,
          contactName: project.client.contactName,
          projectName: project.name,
          schedule,
          instalmentIndex: inst.index,
          amountDue: formatCentsExact(inst.amountCents),
          totalPrice: formatCents(project.totalPrice),
          dueDate: dateLabel(dueAt),
          gateLine,
        })
      );
    } catch (error) {
      console.error(`Instalment invoice PDF failed for ${inst.id}:`, error);
    }

    const copy = instalmentEmailCopy(inst, {
      company: project.client.company,
      contactName: project.client.contactName,
      projectName: project.name,
    });

    const sent = await sendInstalmentEmail({
      toEmail: project.client.email,
      copy,
      /*
       * Our own address, not Stripe's, for the same reason the chase emails
       * use it. A Checkout Session dies 24 hours after it is minted and this
       * invoice gives the client fourteen days, so pasting the Stripe URL in
       * here shipped a button that worked on the day it landed and was an
       * error page for the rest of the period they were being asked to pay
       * in. /pay resolves a live session at click time — and records the
       * click, which until now only the chases could see.
       */
      paymentUrl: `${siteUrl}/pay/${inst.id}`,
      invoicePdf,
      invoiceFilename: `${invoiceNumber}.pdf`,
      instalmentId: inst.id,
    });

    await prisma.instalment.update({
      where: { id: inst.id },
      data: {
        status: 'due',
        stripeSessionId: checkout.id,
        paymentUrl: checkout.url,
        invoicedAt: inst.invoicedAt ?? now,
        dueAt: inst.dueAt ?? dueAt,
        emailSentAt: sent.sent ? now : inst.emailSentAt,
      },
    });

    await prisma.projectUpdate.create({
      data: {
        projectId: project.id,
        title: `${inst.label} invoiced`,
        description:
          inst.trigger === 'ready-for-launch'
            ? `Your project is ready to launch — the final invoice (${invoiceNumber}, ${formatCentsExact(inst.amountCents)}) is in your inbox. We go live as soon as it clears.`
            : `${inst.label} (${invoiceNumber}, ${formatCentsExact(inst.amountCents)}) has been sent to your email with a secure payment link.`,
        statusStage: project.status,
        userId: session.userId,
      },
    });

    return NextResponse.json({
      success: true,
      instalment: { ...inst, status: 'due', paymentUrl: checkout.url, invoiceNumber },
      emailSent: sent.sent,
      emailReason: sent.sent ? null : sent.reason,
    });
  } catch (error) {
    console.error('Send instalment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
