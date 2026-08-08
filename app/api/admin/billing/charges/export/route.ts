import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { toCsv } from '@/lib/csv';
import { ledgerWhere, readInvoiceLines } from '@/lib/invoice-ledger';
import { DISPLAY_STATE_LABELS, displayState } from '@/lib/invoice-lifecycle';
import { grossReceivedCents, receivedCents } from '@/lib/invoice-settlement';

/**
 * The ledger as a file, because at some point somebody's accountant asks.
 *
 * There was no way to get any of this out. The screen shows a hundred rows at
 * a time and the answer to "send me the quarter" was reading them off it, or
 * a database console. Both of those produce a number nobody can check.
 *
 * Three deliberate choices:
 *
 * Every matching row, not the page. The list is capped at a hundred for a
 * screen; a file has no reason to be, and a partial export is the worst kind
 * of wrong — it looks complete, and the person checking it against a bank
 * statement is checking the bank statement.
 *
 * The same filter and search as the screen, built by the same function. Every
 * time these clauses have been written twice in this app they have drifted,
 * and the drift is always in the direction of quietly answering about fewer
 * rows than the caller asked for.
 *
 * Money in cents AND formatted. The formatted column is what a person reads;
 * the cents column is what survives a spreadsheet deciding "$1,200.00" is
 * text, or a locale deciding the comma is a decimal point.
 *
 * And a column saying which KIND of invoice each row is. This list is
 * everything raised — one-off charges and the scheduled payments that make up
 * a project's contracted price — and adding those together is the specific
 * mistake a spreadsheet makes easy. The screen already knows the difference:
 * it refuses to send an instalment and says to use the project's schedule.
 * The file said nothing, so summing the Amount column billed the extra work
 * on top of the main contract and produced a revenue figure roughly double
 * the truth.
 */

/** Above this, the answer is a database query rather than a download. */
const EXPORT_LIMIT = 5000;

export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const q = params.get('q');
    const where = ledgerWhere({
      projectId: params.get('projectId'),
      status,
      q,
    });

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        client: { select: { company: true, email: true } },
        project: { select: { name: true } },
        issuedBy: { select: { name: true, email: true } },
        payments: { select: { amount: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: EXPORT_LIMIT,
    });

    /*
     * Which of these are instalments. Matched on invoiceNumber, the same join
     * the ledger and the void route already use, and only for the rows going
     * into the file — a second query about the whole book to answer a
     * question about five thousand rows is the sort of thing that is fine
     * until the day it is not.
     */
    const instalments = invoices.length
      ? await prisma.instalment.findMany({
          where: { invoiceNumber: { in: invoices.map((invoice) => invoice.number) } },
          select: { invoiceNumber: true },
        })
      : [];
    const scheduled = new Set(
      instalments.map((row) => row.invoiceNumber).filter((number): number is string => Boolean(number))
    );

    const rows: Array<Array<string | number | null>> = [
      [
        'Invoice',
        'Type',
        'Raised',
        'Client',
        'Project',
        'For',
        'Line items',
        'Amount',
        'Amount (cents)',
        'Received',
        'Received (cents)',
        'Refunded',
        'Refunded (cents)',
        'State',
        'Paid on',
        'How it was paid',
        'Raised by',
        'Emailed to',
        'Times sent',
        'Reason',
      ],
    ];

    for (const invoice of invoices) {
      const received = receivedCents(invoice.payments);
      const state = displayState({
        status: invoice.status,
        amountCents: invoice.amountCents,
        refundedCents: invoice.refundedCents,
        refundMethod: invoice.refundMethod,
        receivedCents: received,
      });
      rows.push([
        invoice.number,
        scheduled.has(invoice.number) ? 'Scheduled payment' : 'One-off charge',
        invoice.createdAt.toISOString().slice(0, 10),
        invoice.client.company,
        invoice.project.name,
        invoice.description,
        // The breakdown on one line rather than a row each: a file with two
        // shapes of row in it cannot be summed by selecting a column, which
        // is the only thing anybody does with this.
        readInvoiceLines(invoice.lineItems)
          .map((line) => `${line.label} (${(line.priceCents / 100).toFixed(2)})`)
          .join('; '),
        (invoice.amountCents / 100).toFixed(2),
        invoice.amountCents,
        (received / 100).toFixed(2),
        received,
        (invoice.refundedCents / 100).toFixed(2),
        invoice.refundedCents,
        DISPLAY_STATE_LABELS[state],
        invoice.paidAt ? invoice.paidAt.toISOString().slice(0, 10) : '',
        invoice.paidMethod || (grossReceivedCents(invoice.payments) > 0 ? 'Stripe' : ''),
        invoice.issuedBy?.name || invoice.issuedBy?.email || '',
        invoice.sentToEmail || '',
        invoice.sendCount ?? 0,
        // Why it changed, in the words the client was already given.
        invoice.voidReason || invoice.refundReason || '',
      ]);
    }

    /*
     * The ceiling, said inside the file.
     *
     * The cap is right — past this the answer is a query rather than a
     * download — but it was announced only in a response header, which nobody
     * downloading a file ever sees. That is exactly the failure this export
     * was written to avoid: a file that looks complete, handed to somebody
     * whose whole job is checking it against a bank statement.
     *
     * In the first column and nowhere near the money, so a note cannot be
     * summed by accident.
     */
    if (invoices.length === EXPORT_LIMIT) {
      rows.push([
        `Only the most recent ${EXPORT_LIMIT.toLocaleString('en-US')} invoices are in this file — narrow the filter or the search to reach the rest.`,
      ]);
    }

    /*
     * Named for what it contains rather than for when it was downloaded.
     * Two exports of different buckets on the same day used to be two files
     * called the same thing, and the one that mattered was whichever the
     * browser did not rename to "(1)".
     */
    const bucket = status === 'open' ? 'open' : status === 'paid' ? 'paid' : status === 'void' ? 'cancelled' : 'all';
    const filename = `bothmade-invoices-${bucket}-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(toCsv(rows), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // Money that moved since the last download must not come from a cache.
        'Cache-Control': 'no-store',
        // How many rows are actually in the file, so a caller that hit the
        // ceiling can find out without counting lines.
        'X-Invoice-Count': String(invoices.length),
        ...(invoices.length === EXPORT_LIMIT ? { 'X-Invoice-Truncated': 'true' } : {}),
      },
    });
  } catch (error) {
    console.error('Invoice export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
