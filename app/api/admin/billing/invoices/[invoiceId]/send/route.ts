import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { resolveSiteUrl } from '@/lib/site-url';
import { sendCustomChargeEmail } from '@/lib/email';
import { invoiceFilename } from '@/lib/billing';
import { formatCentsExact } from '@/lib/pricing';
import {
  buildAndStoreInvoicePdf,
  createInvoicePaymentLink,
  readInvoiceLines,
} from '@/lib/invoice-dispatch';

/**
 * Send an invoice to the client — for the first time, or again.
 *
 * ## What was missing
 *
 * An invoice could be raised and then never sent. Three ordinary situations
 * produced one sitting in the ledger the client had never received:
 *
 *  - raised with "email the client" switched off, for the record only;
 *  - raised with it on, and the send failed — reported as a warning on a
 *    screen that had no button to do anything about it;
 *  - sent fine, and the client lost it, or it went to spam, or the person who
 *    got it left.
 *
 * The row's only actions were Cancel and Refund. So the answer to "they say
 * they never got it" was to cancel a perfectly good invoice and raise the
 * same charge again under a new number — which leaves the books carrying a
 * cancellation that never happened for a reason that was not true.
 *
 * ## It repairs what it finds
 *
 * A missing PDF and a missing pay link are filled in here rather than being
 * permanent. The charge route deliberately survives either failing, which
 * means an invoice raised while Stripe was unreachable had no way to be paid
 * online, ever. Pressing send is the retry.
 *
 * ## What it refuses
 *
 * Instalments. A scheduled instalment is paid through a Checkout Session held
 * on the Instalment row, not through a payment link on the invoice — minting
 * a link here would give the client a second way to pay the same money, one
 * the instalment machinery has never heard of and would not mark settled.
 * Those get resent from the project's schedule, and this says so.
 *
 * Paid and void invoices, for the plainer reason that neither is a request
 * for money any more.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { invoiceId } = await params;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: { select: { company: true, email: true, contactName: true, archivedAt: true } },
        project: { select: { id: true, name: true } },
      },
    });
    if (!invoice) {
      return NextResponse.json({ error: 'That invoice no longer exists.' }, { status: 404 });
    }

    if (invoice.status === 'void') {
      return NextResponse.json(
        { error: `${invoice.number} was cancelled, so there is nothing to pay. Raise a new charge instead.` },
        { status: 409 }
      );
    }
    if (invoice.status === 'paid') {
      return NextResponse.json(
        { error: `${invoice.number} has already been paid — there is nothing to chase.` },
        { status: 409 }
      );
    }
    if (invoice.client.archivedAt) {
      return NextResponse.json(
        { error: `${invoice.client.company} has been decommissioned — reactivate them before chasing this.` },
        { status: 409 }
      );
    }

    /*
     * An instalment invoice is not ours to send.
     *
     * Matched on `invoiceNumber`, the same join the void route uses. The
     * schedule mints a Checkout Session per instalment and tracks it on that
     * row; a payment link created here would be a second, unwatched way to
     * pay the same money, and the client using it would settle nothing.
     */
    const instalment = await prisma.instalment.findUnique({
      where: { invoiceNumber: invoice.number },
      select: { id: true, label: true },
    });
    if (instalment) {
      return NextResponse.json(
        {
          error: `${invoice.number} is the "${instalment.label}" instalment. Send it from the project's payment schedule so the payment is tracked against it.`,
          projectId: invoice.project.id,
        },
        { status: 409 }
      );
    }

    const lineItems = readInvoiceLines(invoice.lineItems);
    if (lineItems.length === 0) {
      return NextResponse.json(
        {
          error: `${invoice.number} has no readable line items, so nothing can be rebuilt from it. Cancel it and raise the charge again.`,
        },
        { status: 409 }
      );
    }

    const siteUrl = resolveSiteUrl();
    const filename = invoiceFilename(invoice.number);

    /*
     * Repair before send, and only what is actually missing.
     *
     * A PDF that is already filed is not rebuilt — the client may be holding
     * the first copy, and a second render at a different URL is a second
     * document claiming to be the same invoice. The buffer still has to exist
     * to attach, so a stored PDF is fetched rather than regenerated.
     */
    let pdfBuffer: Buffer | null = null;
    let pdfUrl = invoice.pdfUrl;

    if (pdfUrl) {
      pdfBuffer = await fetch(pdfUrl)
        .then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null))
        .catch(() => null);
    }

    if (!pdfBuffer) {
      const built = await buildAndStoreInvoicePdf({
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        company: invoice.client.company,
        contactName: invoice.client.contactName,
        description: invoice.description,
        lineItems,
        issuedAt: invoice.createdAt,
      });
      pdfBuffer = built.buffer;
      // Only overwrite a stored URL when a new one was actually filed — a
      // failed re-upload must not blank the link that already worked.
      pdfUrl = built.url ?? pdfUrl;
    }

    let paymentUrl = invoice.paymentUrl;
    let paymentLinkId = invoice.stripePaymentLinkId;
    if (!paymentUrl) {
      const link = await createInvoicePaymentLink({
        siteUrl,
        projectId: invoice.project.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        lineItems,
      });
      paymentUrl = link.url;
      paymentLinkId = link.id ?? paymentLinkId;
    }

    const result = await sendCustomChargeEmail({
      toEmail: invoice.client.email,
      contactName: invoice.client.contactName,
      company: invoice.client.company,
      projectName: invoice.project.name,
      invoiceNumber: invoice.number,
      description: invoice.description,
      amountLabel: formatCentsExact(invoice.amountCents),
      paymentUrl,
      invoicePdf: pdfBuffer,
      filename,
    }).catch((error) => {
      console.error(`Invoice ${invoice.number}: resend threw:`, error);
      return { sent: false as const, reason: 'The send threw an error.' };
    });

    /*
     * Whatever was repaired is stored either way.
     *
     * A pay link minted on an attempt whose email then bounced is still a pay
     * link, and it is on the client's dashboard the moment it is written. The
     * send counters, though, only move when a message actually left — they
     * exist to answer "how many times have we chased them", and a failed
     * attempt is not a chase.
     */
    const stored = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        pdfUrl,
        paymentUrl,
        stripePaymentLinkId: paymentLinkId,
        ...(result.sent
          ? {
              sentToEmail: invoice.client.email,
              lastSentAt: new Date(),
              sendCount: { increment: 1 },
            }
          : {}),
      },
      include: {
        client: { select: { id: true, company: true, email: true } },
        project: { select: { id: true, name: true } },
        issuedBy: { select: { name: true, email: true } },
      },
    });

    if (!result.sent) {
      return NextResponse.json(
        {
          error: `${invoice.number} couldn't be emailed to ${invoice.client.email}: ${result.reason}`,
          invoice: stored,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        invoice: stored,
        sentTo: invoice.client.email,
        warnings: [
          pdfUrl ? null : "The invoice PDF couldn't be filed, so there's no PDF link on the dashboards.",
          paymentUrl
            ? null
            : "Stripe still isn't returning a payment link — the client has the invoice but can't pay it online yet.",
        ].filter((warning): warning is string => Boolean(warning)),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Invoice send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
