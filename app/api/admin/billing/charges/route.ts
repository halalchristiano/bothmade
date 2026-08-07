import { NextRequest, NextResponse } from 'next/server';
import { resolveSiteUrl } from '@/lib/site-url';
import Stripe from 'stripe';
import { put } from '@vercel/blob';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { sendCustomChargeEmail, sendInvoiceRecordEmail } from '@/lib/email';
import { buildCustomChargeInvoicePdf } from '@/lib/invoice-pdf';
import {
  createInvoiceRow as sharedCreateInvoiceRow,
  invoiceFilename,
  readChargeDraft,
} from '@/lib/billing';
import { formatCentsExact } from '@/lib/pricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

/**
 * Raise a one-off charge against an existing customer.
 *
 * The whole point is that it happens in one go: by the time this responds,
 * the invoice exists as a row, as a stored PDF, as a payable Stripe link, in
 * the client's inbox, and in info@. Nothing is left to "generate later",
 * because the version of this that generated the paperwork later was the
 * version where the paperwork didn't exist.
 *
 * Open to every staff role, sales included — see the note on the customer
 * search route. Billing a customer for extra work is a sales action; the ops
 * boundary in lib/authz.ts is about reading the client book, not about who is
 * allowed to invoice.
 *
 * Order matters here and is not arbitrary. The row is written first, so a
 * charge that half-fails is still a charge somebody can see and finish by
 * hand; the PDF and the Stripe link are attached to it as they succeed. The
 * failure this is built around is the silent one — a client billed with no
 * record of it, or a record with nothing behind it.
 */

/** A second identical charge inside this window is a double-click, not a decision. */
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }

    const body = (await request.json().catch(() => null)) as {
      projectId?: unknown;
      description?: unknown;
      lineItems?: unknown;
      sendToClient?: unknown;
      confirmDuplicate?: unknown;
    } | null;

    const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
    if (!projectId) {
      return NextResponse.json({ error: 'Pick which customer this is for.' }, { status: 400 });
    }

    const parsed = readChargeDraft({ description: body?.description, lineItems: body?.lineItems });
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { description, lineItems, amountCents } = parsed.draft;
    const sendToClient = body?.sendToClient !== false;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'That customer no longer exists.' }, { status: 404 });
    }
    if (project.client.archivedAt) {
      return NextResponse.json(
        { error: `${project.client.company} has been decommissioned — reactivate them before billing.` },
        { status: 400 }
      );
    }

    // Charging twice is worse than charging once too slowly, and a slow
    // network plus an impatient second click is the ordinary way it happens.
    if (body?.confirmDuplicate !== true) {
      const recentTwin = await prisma.invoice.findFirst({
        where: {
          projectId,
          description,
          amountCents,
          createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
          /*
           * A cancelled invoice is not a duplicate of anything.
           *
           * Void means "this should never have existed" — the pay link is
           * dead and the client has been told to ignore it. The ordinary way
           * that happens is raising a charge, spotting a wrong figure in it,
           * cancelling, and typing it again, which lands inside this window
           * every time. The guard then answered with "send it again only if
           * you meant to bill twice", about an invoice nobody can pay, and
           * the person doing the right thing had to overrule a warning to do
           * it. Warnings that are wrong get clicked through, including the
           * ones that were right.
           */
          status: { not: 'void' },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (recentTwin) {
        return NextResponse.json(
          {
            error: `${recentTwin.number} for ${formatCentsExact(amountCents)} was raised a moment ago. Send it again only if you meant to bill twice.`,
            duplicateOf: recentTwin.number,
            needsConfirmation: true,
          },
          { status: 409 }
        );
      }
    }

    const invoice = await createInvoiceRow({
      clientId: project.clientId,
      projectId: project.id,
      description,
      lineItems,
      amountCents,
      issuedById: session.userId,
    });
    if (!invoice) {
      return NextResponse.json(
        { error: "Couldn't allocate an invoice number — try once more." },
        { status: 500 }
      );
    }

    const filename = invoiceFilename(invoice.number);
    const amountLabel = formatCentsExact(amountCents);
    const siteUrl = resolveSiteUrl();

    // The PDF and the pay link are independent failures with the same rule:
    // neither is allowed to lose the charge. Whatever survives is stored, the
    // rest is reported, and the invoice stays on both dashboards either way.
    let pdfBuffer: Buffer | null = null;
    let pdfUrl: string | null = null;
    try {
      const bytes = await buildCustomChargeInvoicePdf({
        invoiceNumber: invoice.number,
        company: project.client.company,
        contactName: project.client.contactName,
        description,
        lineItems,
        issuedAt: invoice.createdAt,
      });
      pdfBuffer = Buffer.from(bytes);
      // addRandomSuffix for the same reason as the contract and proposal
      // blobs: these are public URLs carrying a client's name and what they
      // were charged, and a guessable path is a directory listing with extra
      // steps.
      const blob = await put(`invoices/custom/${invoice.id}.pdf`, pdfBuffer, {
        access: 'public',
        contentType: 'application/pdf',
        addRandomSuffix: true,
      });
      pdfUrl = blob.url;
    } catch (pdfError) {
      console.error(`Invoice ${invoice.number}: failed to build or store the PDF:`, pdfError);
    }

    let paymentUrl: string | null = null;
    let paymentLinkId: string | null = null;
    try {
      const link = await stripe.paymentLinks.create({
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
          redirect: { url: `${siteUrl}/client/${project.id}?paid=1` },
        },
        line_items: lineItems.map((item) => ({
          price_data: {
            currency: 'usd',
            product_data: { name: item.label },
            unit_amount: item.priceCents,
          },
          quantity: 1,
        })),
        metadata: {
          // existingProjectId is what the webhook branches on to record a
          // payment against a project that already exists; invoiceId is what
          // marks this specific charge settled.
          existingProjectId: project.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          paymentType: 'custom',
        },
      });
      paymentUrl = link.url;
      paymentLinkId = link.id;
    } catch (stripeError) {
      console.error(`Invoice ${invoice.number}: failed to create the Stripe payment link:`, stripeError);
    }

    const stored = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        pdfUrl,
        paymentUrl,
        stripePaymentLinkId: paymentLinkId,
        sentToEmail: sendToClient ? project.client.email : null,
      },
    });

    // A charge with no PDF is still a charge, so the client gets told about
    // it either way — with the invoice attached when there is one.
    let clientDelivered = false;
    let clientSendError: string | null = null;
    if (sendToClient) {
      const result = await sendCustomChargeEmail({
        toEmail: project.client.email,
        contactName: project.client.contactName,
        company: project.client.company,
        projectName: project.name,
        invoiceNumber: invoice.number,
        description,
        amountLabel,
        paymentUrl,
        invoicePdf: pdfBuffer,
        filename,
      }).catch((error) => {
        console.error(`Invoice ${invoice.number}: client email threw:`, error);
        return { sent: false as const, reason: 'The send threw an error.' };
      });
      clientDelivered = result.sent;
      if (!result.sent) clientSendError = result.reason;
    }

    // info@ gets its copy whether or not the client's send worked — it is the
    // studio's record of the invoice, not a notification about the email.
    const issuer = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { name: true, email: true },
    });
    await sendInvoiceRecordEmail({
      invoiceNumber: invoice.number,
      company: project.client.company,
      projectName: project.name,
      description,
      amountLabel,
      issuedByName: issuer?.name || issuer?.email || null,
      sentToEmail: sendToClient ? project.client.email : null,
      clientDelivered,
      adminUrl: `${siteUrl}/admin/projects/${project.id}`,
      paymentUrl,
      invoicePdf: pdfBuffer,
      filename,
    }).catch((error) => console.error(`Invoice ${invoice.number}: record email failed:`, error));

    return NextResponse.json(
      {
        success: true,
        invoice: {
          ...stored,
          client: { id: project.client.id, company: project.client.company, email: project.client.email },
          project: { id: project.id, name: project.name },
        },
        clientDelivered,
        // Named so the UI can say which half failed rather than "something
        // went wrong" — the fix for each is different.
        warnings: [
          // Rendering and storing are separate failures with separate
          // consequences: a PDF that rendered but didn't store still reaches
          // the client and info@ as an attachment, it just has no link on
          // the dashboards. Saying "no PDF" for that would send someone
          // re-issuing an invoice the client already has.
          pdfBuffer
            ? pdfUrl
              ? null
              : "The invoice was emailed but couldn't be filed — there'll be no PDF link on the dashboards."
            : "The invoice PDF couldn't be generated — the charge is recorded, but nothing is attached to it.",
          paymentUrl ? null : "Stripe didn't return a payment link — the client can't pay this online yet.",
          clientSendError ? `The client's copy didn't send: ${clientSendError}` : null,
        ].filter((warning): warning is string => Boolean(warning)),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Custom charge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Every invoice raised, newest first — the studio's own copy of the record,
 * and what the billing page lists.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }

    const projectId = request.nextUrl.searchParams.get('projectId');
    const invoices = await prisma.invoice.findMany({
      where: projectId ? { projectId } : undefined,
      include: {
        client: { select: { id: true, company: true, email: true } },
        project: { select: { id: true, name: true } },
        issuedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ success: true, invoices }, { status: 200 });
  } catch (error) {
    console.error('List invoices error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/*
 * A second copy of the numbering used to live here — `nextInvoiceNumber`,
 * unreferenced since the allocator moved into lib/billing, and still
 * counting rows and formatting a number nobody read. Deleted rather than
 * left: two implementations of "what number is next" is exactly the pair
 * that eventually disagrees, and the dead one is always the one somebody
 * copies.
 */

/** Thin alias for the shared allocator — the retry loop lives in lib/billing. */
async function createInvoiceRow(input: {
  clientId: string;
  projectId: string;
  description: string;
  lineItems: Array<{ label: string; priceCents: number }>;
  amountCents: number;
  issuedById: string;
}) {
  return sharedCreateInvoiceRow(prisma, input);
}
