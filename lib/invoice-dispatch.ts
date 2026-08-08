import Stripe from 'stripe';
import { put } from '@vercel/blob';
import { buildCustomChargeInvoicePdf } from '@/lib/invoice-pdf';
// Lives in the ledger module because the billing page reads the same lines to
// show the breakdown on a row, and this file pulls in Stripe and Vercel Blob —
// neither of which belongs in a browser bundle.
import { readInvoiceLines, type InvoiceLine } from '@/lib/invoice-ledger';

export { readInvoiceLines, type InvoiceLine };

/**
 * The two artefacts an invoice needs before it can be sent: a PDF to attach
 * and a link to pay it with.
 *
 * Both were assembled inline by the route that raises a charge, which was
 * fine while raising was the only thing that ever produced them. It isn't:
 * an invoice can now be sent again, and a resend has to be able to fill in
 * whichever of the two failed the first time. Two copies of "how do we make
 * the pay link" is how the resent link ends up pointing somewhere the webhook
 * doesn't recognise, and that failure looks like a client who paid and a
 * system that says they didn't.
 *
 * Neither of these throws. A charge that half-fails must still be a charge
 * somebody can see and finish by hand — losing the invoice because Stripe was
 * briefly unreachable is the one outcome worth engineering against.
 */

/**
 * Built when a link is actually being minted, not when this file is imported.
 *
 * At module scope it made the PDF half of this file unimportable without a
 * Stripe key: `new Stripe('')` throws on construction, so anything that
 * reached this module — the webhook, which only wants to rebuild a receipt —
 * died at import with "Neither apiKey nor config.authenticator provided",
 * before running a line of its own. A helper that renders a document should
 * not require a payment processor to exist.
 */
function stripeClient(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-08-27.basil' });
}

export interface StoredPdf {
  /** For attaching to the email. Null if the render failed. */
  buffer: Buffer | null;
  /** For linking on the dashboards. Null if the render OR the upload failed. */
  url: string | null;
}

/**
 * Renders the invoice and files it.
 *
 * The two halves fail separately and mean different things: a PDF that
 * rendered but did not store still reaches the client as an attachment and
 * only lacks a link, while one that did not render leaves the charge with
 * nothing behind it at all. Reported apart so the sentence shown to whoever
 * pressed the button matches which of those happened.
 */
export async function buildAndStoreInvoicePdf(input: {
  invoiceId: string;
  invoiceNumber: string;
  company: string;
  contactName: string | null;
  description: string;
  lineItems: InvoiceLine[];
  issuedAt: Date;
  /** Set once the money has arrived — the document then says Paid rather than Amount due. */
  paidAt?: Date | null;
}): Promise<StoredPdf> {
  let buffer: Buffer | null = null;
  try {
    const bytes = await buildCustomChargeInvoicePdf({
      invoiceNumber: input.invoiceNumber,
      company: input.company,
      contactName: input.contactName,
      description: input.description,
      lineItems: input.lineItems,
      issuedAt: input.issuedAt,
      paidAt: input.paidAt,
    });
    buffer = Buffer.from(bytes);
  } catch (error) {
    console.error(`Invoice ${input.invoiceNumber}: failed to build the PDF:`, error);
    return { buffer: null, url: null };
  }

  try {
    // addRandomSuffix for the same reason as the contract and proposal blobs:
    // these are public URLs carrying a client's name and what they were
    // charged, and a guessable path is a directory listing with extra steps.
    const blob = await put(`invoices/custom/${input.invoiceId}.pdf`, buffer, {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: true,
    });
    return { buffer, url: blob.url };
  } catch (error) {
    console.error(`Invoice ${input.invoiceNumber}: failed to store the PDF:`, error);
    return { buffer, url: null };
  }
}

export interface InvoicePaymentLink {
  url: string | null;
  id: string | null;
}

/**
 * The Stripe link that pays this invoice.
 *
 * The metadata is the load-bearing part and the reason this is not written
 * twice: `existingProjectId` is what the webhook branches on to record a
 * payment against a project that already exists, and `invoiceId` is what
 * marks this specific charge settled. A link built without them takes the
 * client's money and settles nothing.
 */
export async function createInvoicePaymentLink(input: {
  siteUrl: string;
  projectId: string;
  invoiceId: string;
  invoiceNumber: string;
  lineItems: InvoiceLine[];
}): Promise<InvoicePaymentLink> {
  try {
    const link = await stripeClient().paymentLinks.create({
      // A Payment Link is reusable and permanent unless told otherwise — it
      // never expires and Stripe will take money through it every time it is
      // opened. That is the double-collection window this codebase closes
      // carefully everywhere it uses Checkout Sessions ("two live links for
      // one instalment") and left wide open here: the invoice is marked paid
      // once, because that update is scoped to a still-open row, while the
      // card is charged on every completion. A forwarded email, a back
      // button, or a client revisiting the link next month all collect again.
      restrictions: { completed_sessions: { limit: 1 } },
      after_completion: {
        type: 'redirect',
        redirect: { url: `${input.siteUrl}/client/${input.projectId}?paid=1` },
      },
      line_items: input.lineItems.map((item) => ({
        price_data: {
          currency: 'usd',
          product_data: { name: item.label },
          unit_amount: item.priceCents,
        },
        quantity: 1,
      })),
      metadata: {
        existingProjectId: input.projectId,
        invoiceId: input.invoiceId,
        invoiceNumber: input.invoiceNumber,
        paymentType: 'custom',
      },
    });
    return { url: link.url, id: link.id };
  } catch (error) {
    console.error(`Invoice ${input.invoiceNumber}: failed to create the Stripe payment link:`, error);
    return { url: null, id: null };
  }
}

/**
 * Re-render an invoice's PDF as a receipt, now that it has been paid.
 *
 * Best-effort by design, and called after the money is already recorded. The
 * PDF is the nicety; the ledger is the fact. Throwing here would undo a
 * payment that genuinely happened over a document that can be regenerated by
 * pressing a button, which is the wrong trade in every direction.
 *
 * Filed at a fresh URL rather than over the old one — Vercel Blob's
 * addRandomSuffix means the "amount due" copy stays where it was, which is
 * correct: the client may have that link in an email, and it should keep
 * resolving to the document they were sent rather than 404 or silently
 * change under them.
 */
export async function restoreInvoicePdfAsPaid(
  db: {
    invoice: {
      update(args: unknown): Promise<unknown>;
    };
  },
  invoice: {
    id: string;
    number: string;
    description: string;
    lineItems: unknown;
    createdAt: Date;
    client: { company: string; contactName: string | null };
  },
  paidAt: Date
): Promise<string | null> {
  const lineItems = readInvoiceLines(invoice.lineItems);
  if (lineItems.length === 0) return null;

  const { url } = await buildAndStoreInvoicePdf({
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    company: invoice.client.company,
    contactName: invoice.client.contactName,
    description: invoice.description,
    lineItems,
    issuedAt: invoice.createdAt,
    paidAt,
  });
  if (!url) return null;

  await db.invoice
    .update({ where: { id: invoice.id }, data: { pdfUrl: url } })
    .catch((error) => console.error(`Invoice ${invoice.number}: receipt PDF not linked:`, error));

  return url;
}
