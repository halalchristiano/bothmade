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

    const rows: Array<Array<string | number | null>> = [
      [
        'Invoice',
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
