import { NextRequest, NextResponse } from 'next/server';
import { resolveSiteUrl } from '@/lib/site-url';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { sendCustomChargeEmail, sendInvoiceRecordEmail } from '@/lib/email';
import { buildAndStoreInvoicePdf, createInvoicePaymentLink } from '@/lib/invoice-dispatch';
import {
  createInvoiceRow as sharedCreateInvoiceRow,
  invoiceFilename,
  readChargeDraft,
} from '@/lib/billing';
import { formatCentsExact } from '@/lib/pricing';
import { receivedCents } from '@/lib/invoice-settlement';

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
    //
    // Shared with the resend route via lib/invoice-dispatch.ts. Two copies of
    // "how do we mint the pay link" is how a resent link ends up without the
    // metadata the webhook branches on — which looks like a client who paid
    // and a system that says they didn't.
    const { buffer: pdfBuffer, url: pdfUrl } = await buildAndStoreInvoicePdf({
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      company: project.client.company,
      contactName: project.client.contactName,
      description,
      lineItems,
      issuedAt: invoice.createdAt,
    });

    const { url: paymentUrl, id: paymentLinkId } = await createInvoicePaymentLink({
      siteUrl,
      projectId: project.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      lineItems,
    });

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

    /*
     * The first send counts as a send.
     *
     * Written after the attempt rather than with the artefacts above, because
     * these two answer "how many times have we asked them for this money" and
     * a send that failed is not an ask. An invoice raised for the record only
     * stays at zero, which is the honest reading of it: nobody has been told.
     */
    if (clientDelivered) {
      stored.lastSentAt = new Date();
      stored.sendCount = 1;
      await prisma.invoice
        .update({
          where: { id: invoice.id },
          data: { lastSentAt: stored.lastSentAt, sendCount: 1 },
        })
        .catch((error) => console.error(`Invoice ${invoice.number}: send counters not written:`, error));
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

/** The page shows this many rows; the totals below are computed over all of them. */
const LIST_LIMIT = 100;

/**
 * Every invoice raised, newest first — the studio's own copy of the record,
 * and what the billing page lists.
 *
 * ## Why the totals are computed here and not on the screen
 *
 * The list is capped at a hundred rows, and adding up what is on screen would
 * silently start under-reporting the day the hundred-and-first invoice is
 * raised — with no visible change, because a wrong total looks exactly like a
 * right one. The only question anybody opens this page to answer is "how much
 * is outstanding", so that number has to be true about the books rather than
 * about the page.
 *
 * Refunds are reported apart from payments rather than netted off. "Paid" and
 * "paid then given back" are different sentences to whoever is reading, and a
 * single net figure hides the second one entirely.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }

    const projectId = request.nextUrl.searchParams.get('projectId');
    const where = projectId ? { projectId } : undefined;

    /*
     * The filter is applied here, not on the rows that come back.
     *
     * Filtering a hundred newest-first rows in the browser answers "which of
     * the recent ones are unpaid", and the question is "which are unpaid".
     * The invoice sitting there since March is exactly the one worth finding
     * and exactly the one a recency cap drops — so each bucket gets its own
     * hundred rather than sharing one.
     */
    const status = request.nextUrl.searchParams.get('status');

    /*
     * And so is the search, for the same reason and with more teeth.
     *
     * Typing in the box filtered the rows already on screen — the hundred
     * most recent in whichever bucket was open. So searching "Northgate" past
     * a hundred invoices answered about the recent ones and said "nothing
     * matches" about the invoice from March, which is the single most likely
     * thing anybody is hunting for: an old one, unpaid, that a client has
     * just rung about. A search that quietly means "search the visible page"
     * is worse than no search, because it answers confidently.
     *
     * Matched across the four things printed on the row, so all three ways
     * somebody arrives — a number off a bank statement, a company name off a
     * phone call, a half-remembered description of the work — find it.
     */
    const q = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 100);
    const search = q
      ? {
          OR: [
            { number: { contains: q, mode: 'insensitive' as const } },
            { description: { contains: q, mode: 'insensitive' as const } },
            { client: { company: { contains: q, mode: 'insensitive' as const } } },
            { project: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : null;

    const listWhere = {
      ...(where ?? {}),
      ...(status === 'open' || status === 'paid' || status === 'void' ? { status } : {}),
      ...(search ?? {}),
    };

    const [invoices, byStatus, refundsByMethod, total, listTotal, partPaid] = await Promise.all([
      prisma.invoice.findMany({
        where: listWhere,
        include: {
          client: { select: { id: true, company: true, email: true } },
          project: { select: { id: true, name: true } },
          issuedBy: { select: { name: true, email: true } },
          // What has actually arrived against each one. An invoice can now be
          // part paid by transfer, and "open" alone stops being the whole
          // story the moment it is.
          payments: { select: { amount: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: LIST_LIMIT,
      }),
      prisma.invoice.groupBy({
        by: ['status'],
        where,
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      /*
       * Split by method, because "given back" was two different facts added
       * together.
       *
       * A refund is cash that left the account. A credit is value the client
       * is owed against future work, with the money still here. Summing them
       * produced a figure that overstated what had actually gone out — which
       * is the same mistake as netting refunds off "paid", one level down.
       */
      prisma.invoice.groupBy({
        by: ['refundMethod'],
        where,
        _sum: { refundedCents: true },
      }),
      prisma.invoice.count({ where }),
      prisma.invoice.count({ where: listWhere }),
      /*
       * Money already received against invoices that are still open.
       *
       * Outstanding used to be the sum of open invoices' totals, which was
       * exactly right while an invoice was all-or-nothing. It can now be part
       * paid by transfer — so without this, six hundred arriving against a
       * twelve-hundred invoice leaves the figure claiming twelve hundred is
       * owed, and the page whose whole job is reconciling against a bank
       * statement is the one overstating.
       */
      prisma.payment.aggregate({
        where: { invoice: { ...(where ?? {}), status: 'open' } },
        _sum: { amount: true },
      }),
    ]);

    /*
     * Which of these are instalments, so the row can stop offering an action
     * that always refuses.
     *
     * This list is every invoice raised — one-off charges and the three
     * scheduled payments on every project alike. They are settled completely
     * differently: an instalment is paid through a Checkout Session held on
     * its own row, so the resend route turns one away with "send it from the
     * project's payment schedule". Which is correct, and was being said AFTER
     * somebody had pressed Send, read a confirmation, and pressed Send again.
     *
     * Matched on `invoiceNumber`, the unique join the void and mark-paid
     * routes already use, and only for the rows on screen.
     */
    const instalments = invoices.length
      ? await prisma.instalment.findMany({
          where: { invoiceNumber: { in: invoices.map((i) => i.number) } },
          select: { invoiceNumber: true, projectId: true },
        })
      : [];
    const instalmentNumbers = new Set(
      instalments.map((i) => i.invoiceNumber).filter((n): n is string => Boolean(n))
    );

    const bucket = (status: string) => byStatus.find((row) => row.status === status);
    const open = bucket('open');
    const paid = bucket('paid');

    // Anything not explicitly a credit moved real money: 'stripe' went back to
    // the card, 'manual' went back by transfer, and a null method on a row
    // carrying refunded cents predates the column and is far likelier to have
    // been cash than a credit. Guessing toward "money left" is the safer way
    // to be wrong about a figure somebody reconciles against a bank statement.
    const refundedCents = refundsByMethod
      .filter((row) => row.refundMethod !== 'credit')
      .reduce((sum, row) => sum + (row._sum.refundedCents ?? 0), 0);
    const creditedCents = refundsByMethod
      .filter((row) => row.refundMethod === 'credit')
      .reduce((sum, row) => sum + (row._sum.refundedCents ?? 0), 0);

    return NextResponse.json(
      {
        success: true,
        // Flagged on the row rather than sent as a separate list, so nothing
        // downstream has to do the join a second time to know what it is
        // looking at.
        invoices: invoices.map(({ payments, ...invoice }) => ({
          ...invoice,
          isInstalment: instalmentNumbers.has(invoice.number),
          // Summed rather than sent as rows: the screen wants one number and
          // handing it a list invites a second opinion about what it adds to.
          receivedCents: receivedCents(payments),
        })),
        totals: {
          // The only figure that is a to-do list: raised, not cancelled, not
          // paid. Everything else on this page is history.
          // Net of anything already received against a still-open invoice.
          outstandingCents: Math.max(
            0,
            (open?._sum.amountCents ?? 0) - (partPaid._sum.amount ?? 0)
          ),
          outstandingCount: open?._count._all ?? 0,
          paidCents: paid?._sum.amountCents ?? 0,
          paidCount: paid?._count._all ?? 0,
          // Cash that actually left the account.
          refundedCents,
          // Value the client is owed, with the money still here. A different
          // fact, and never folded into the one above.
          creditedCents,
          count: total,
        },
        // How many rows the current filter has, so the screen can say what it
        // is showing out of what. Said out loud rather than left to be
        // discovered: a list that quietly stops at a hundred reads as "that is
        // all of them".
        matching: listTotal,
        truncated: listTotal > invoices.length,
      },
      { status: 200 }
    );
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
