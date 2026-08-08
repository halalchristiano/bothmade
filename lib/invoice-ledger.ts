import { displayState, type InvoiceDisplayState } from '@/lib/invoice-lifecycle';

/**
 * Reading the ledger, rather than only listing it.
 *
 * The invoices card was a hundred rows newest-first with no totals, no filter
 * and no search. Every question anybody actually opens it with — how much is
 * outstanding, who hasn't paid, has this one been chased, where is the invoice
 * for that job in March — was answered by scrolling and adding up in your
 * head. The rows were fine; there was just no way through them.
 *
 * The functions here are the reading. Kept out of the component because the
 * ageing rule and the filter are the parts worth pinning in a test, and
 * neither of them needs a browser to be wrong.
 */

/** The buckets somebody actually thinks in when they open this page. */
export type LedgerFilter = 'chase' | 'paid' | 'cancelled' | 'all';

export const LEDGER_FILTER_LABELS: Record<LedgerFilter, string> = {
  chase: 'Needs chasing',
  paid: 'Paid',
  cancelled: 'Cancelled',
  all: 'All',
};

export interface LedgerInvoice {
  number: string;
  description: string;
  status: string;
  amountCents: number;
  refundedCents: number;
  refundMethod?: string | null;
  createdAt: string;
  client: { company: string };
  project: { name: string };
}

/**
 * The `status` each bucket asks the server for, or null for "don't filter".
 *
 * The status half of the filter is a query rather than a pass over the rows
 * that came back: filtering a hundred newest-first rows in the browser
 * answers "which of the recent ones are unpaid", and the question is "which
 * are unpaid". The invoice sitting there since March is exactly the one worth
 * finding and exactly the one a shared recency cap drops.
 */
export const FILTER_STATUS: Record<LedgerFilter, string | null> = {
  chase: 'open',
  paid: 'paid',
  cancelled: 'void',
  all: null,
};

export function matchesFilter(invoice: { status: string }, filter: LedgerFilter): boolean {
  const status = FILTER_STATUS[filter];
  return status === null || invoice.status === status;
}

/**
 * Matches on everything visible in the row.
 *
 * Deliberately not "company only": the three ways somebody arrives at this
 * page looking for one invoice are with a number off a bank statement, a
 * company name off a phone call, and a half-remembered description of the
 * work. All three are on the row, so all three should find it.
 */
export function matchesQuery(invoice: LedgerInvoice, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [invoice.number, invoice.description, invoice.client.company, invoice.project.name]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

/**
 * How long an open invoice has been sitting there, in whole days.
 *
 * Only meaningful while it is open — a paid invoice's age is trivia, and
 * showing it beside one that is nineteen days overdue makes both look the
 * same. Returns null for anything settled or cancelled.
 */
export function daysOutstanding(
  invoice: { status: string; createdAt: string | Date },
  now: Date = new Date()
): number | null {
  if (invoice.status !== 'open') return null;
  const raised = new Date(invoice.createdAt).getTime();
  if (Number.isNaN(raised)) return null;
  const days = Math.floor((now.getTime() - raised) / (24 * 60 * 60 * 1000));
  return Math.max(0, days);
}

/**
 * Standard commercial terms are net 30, and the studio's invoices carry no
 * stated due date at all — so this is not "overdue" and does not claim to be.
 * It is the point at which an unpaid invoice stops being recent and starts
 * being something nobody has picked up, which is a question about us rather
 * than about the client.
 */
export const CHASE_AFTER_DAYS = 14;

export type LedgerAge = 'fresh' | 'ageing' | 'stale';

export function ageBand(days: number | null): LedgerAge | null {
  if (days === null) return null;
  if (days >= CHASE_AFTER_DAYS * 2) return 'stale';
  if (days >= CHASE_AFTER_DAYS) return 'ageing';
  return 'fresh';
}

/**
 * The one line at the top of an open invoice's row: how long, and whether
 * anybody has asked about it since.
 *
 * Both halves matter and neither is enough alone. Nineteen days with three
 * reminders sent is a client ignoring you; nineteen days with none is an
 * invoice nobody remembered to send. Those want opposite responses, and the
 * old row said neither.
 */
export function chaseLine(
  invoice: { status: string; createdAt: string | Date; sendCount?: number },
  now: Date = new Date()
): string | null {
  const days = daysOutstanding(invoice, now);
  if (days === null) return null;

  const age = days === 0 ? 'raised today' : days === 1 ? 'open 1 day' : `open ${days} days`;
  const sends = invoice.sendCount ?? 0;
  const chased =
    sends === 0 ? 'never emailed' : sends === 1 ? 'sent once' : `sent ${sends}×`;

  return `${age} · ${chased}`;
}

/** The badge tone for a display state, shared so the two invoice lists agree. */
export function stateTone(
  state: InvoiceDisplayState
): 'emerald' | 'neutral' | 'purple' | 'amber' | 'sky' {
  if (state === 'paid') return 'emerald';
  if (state === 'void') return 'neutral';
  if (state === 'refunded' || state === 'part-refunded' || state === 'credited') return 'purple';
  // Its own colour rather than amber. Part paid is neither "they owe us all of
  // it" nor "settled", and reading as the first is what gets a client chased
  // for money they have already sent.
  if (state === 'part-paid') return 'sky';
  return 'amber';
}

export { displayState };

export interface InvoiceLine {
  label: string;
  priceCents: number;
}

/**
 * `lineItems` comes off the row as `Json`, which is `unknown` as far as the
 * type system is concerned. Read defensively rather than cast: this reads
 * rows written months ago, and the two callers fail differently on a
 * malformed one — the ledger would render `$NaN` beside a client's name,
 * and the pay-link builder would hand Stripe `unit_amount: undefined` and
 * fail a whole send over a single bad line.
 *
 * Lives here rather than beside the Stripe helpers so the billing page can
 * import it: lib/invoice-dispatch.ts pulls in Stripe and Vercel Blob, and
 * neither belongs in a browser bundle.
 */
export function readInvoiceLines(value: unknown): InvoiceLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const { label, priceCents } = raw as { label?: unknown; priceCents?: unknown };
    if (typeof label !== 'string' || !label.trim()) return [];
    if (typeof priceCents !== 'number' || !Number.isSafeInteger(priceCents) || priceCents <= 0) return [];
    return [{ label: label.trim(), priceCents }];
  });
}

/**
 * Who raised it, in the words that fit on a row.
 *
 * `issuedBy` was fetched by the ledger query and rendered nowhere at all —
 * so with two people raising charges, "who billed this client" was a
 * question the screen already had the answer to and did not say.
 */
export function issuedByLabel(issuedBy: { name: string | null; email: string } | null): string | null {
  if (!issuedBy) return null;
  return issuedBy.name || issuedBy.email || null;
}

/**
 * The rows a ledger question is about, as a Prisma `where`.
 *
 * Shared rather than written twice on purpose. Every widening of this has
 * gone wrong the same way: the filter moved into the query and the search did
 * not, so searching answered about the hundred rows already on screen. A
 * second copy of these clauses in the export would be that failure again in
 * its worst form — an accountant handed a file that is confidently missing
 * rows, with the filename saying which rows it should have had.
 */
export function ledgerWhere(input: {
  projectId?: string | null;
  status?: string | null;
  q?: string | null;
}): Record<string, unknown> {
  const q = (input.q || '').trim().slice(0, 100);
  return {
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.status === 'open' || input.status === 'paid' || input.status === 'void'
      ? { status: input.status }
      : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: 'insensitive' as const } },
            { description: { contains: q, mode: 'insensitive' as const } },
            { client: { company: { contains: q, mode: 'insensitive' as const } } },
            { project: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };
}
