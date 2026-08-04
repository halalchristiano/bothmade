import { sanitizeCustomItems, type CustomItem } from '@/lib/pricing';

/**
 * One-off charges — an amount someone on the team types in, rather than one
 * the catalogue works out.
 *
 * Everything else that takes money here prices itself from a proposal: the
 * deposit is a percentage of a calculated total, the balance is the rest of
 * it. That covers the sale and nothing after it. A change request, a second
 * round of design, a month of retainer work — all of it was "ask them to send
 * a bank transfer" until this existed, which meant no invoice, no record, and
 * nothing on the client's dashboard.
 */

/**
 * Payment types that count against a project's contracted price.
 *
 * A "custom" payment deliberately does not: it settles an invoice raised
 * outside `Project.totalPrice`, so adding it to the same sum would mark a
 * project paid off because the client was separately billed for extra work.
 * Every balance calculation reads this, and none of them re-derive it.
 */
export const PROJECT_SCOPE_PAYMENT_TYPES = ['deposit', 'balance', 'full'] as const;

/** Money paid toward a project's own contracted price. See above for why this is not "all payments". */
export function amountPaidTowardProject(payments: Array<{ amount: number; type: string }>): number {
  return payments
    .filter((payment) => (PROJECT_SCOPE_PAYMENT_TYPES as readonly string[]).includes(payment.type))
    .reduce((sum, payment) => sum + payment.amount, 0);
}

/**
 * What a custom charge may be. Both ends are deliberate:
 *
 * The floor is Stripe's — a card charge below roughly 50¢ is rejected by the
 * network, and $1 is the smallest amount anyone would actually raise an
 * invoice for. The ceiling is a typo guard: cents are the unit here, so a
 * misplaced "00" turns $500 into $50,000, and an invoice for that lands in a
 * client's inbox before anyone notices. Six figures is above every real job
 * the studio has run and below the amount that would end a relationship.
 */
export const MIN_CHARGE_CENTS = 100;
export const MAX_CHARGE_CENTS = 25_000_000; // $250,000

export const MAX_DESCRIPTION_LENGTH = 200;

/** Matches the cap inside sanitizeCustomItems, so nothing is dropped in silence. */
export const MAX_LINE_ITEMS = 20;

export interface ChargeDraft {
  description: string;
  lineItems: CustomItem[];
  amountCents: number;
}

export type ChargeDraftResult = { ok: true; draft: ChargeDraft } | { ok: false; error: string };

/**
 * Turns whatever arrived over the wire into a charge we're willing to bill,
 * or a sentence explaining why not.
 *
 * Line items are the source of the total — the caller never gets to send an
 * amount alongside them, because then two numbers can disagree and the one
 * that gets charged won't be the one printed on the invoice.
 */
export function readChargeDraft(input: {
  description?: unknown;
  lineItems?: unknown;
}): ChargeDraftResult {
  const description =
    typeof input.description === 'string' ? input.description.trim().slice(0, MAX_DESCRIPTION_LENGTH) : '';
  if (!description) {
    return { ok: false, error: 'Say what the charge is for — it goes on the invoice.' };
  }

  // sanitizeCustomItems drops anything malformed rather than throwing, which
  // is right for a proposal (send the rest) and wrong here (bill the rest).
  // So compare counts: if it dropped one, the rep is about to be charged for
  // a different list than the one on their screen.
  const submitted = Array.isArray(input.lineItems) ? input.lineItems : [];
  if (submitted.length > MAX_LINE_ITEMS) {
    // sanitizeCustomItems caps at the same number and would otherwise drop
    // the overflow silently, which here means billing less than the screen
    // showed. Say what happened instead.
    return { ok: false, error: `An invoice can carry at most ${MAX_LINE_ITEMS} lines — combine a few.` };
  }
  const lineItems = sanitizeCustomItems(submitted);

  if (lineItems.length === 0) {
    return { ok: false, error: 'Add at least one line item with a label and an amount above zero.' };
  }
  if (lineItems.length !== submitted.length) {
    return { ok: false, error: 'Every line needs a description and an amount above zero.' };
  }

  const amountCents = lineItems.reduce((sum, item) => sum + item.priceCents, 0);
  if (amountCents < MIN_CHARGE_CENTS) {
    return { ok: false, error: 'The total has to be at least $1 — cards reject anything smaller.' };
  }
  if (amountCents > MAX_CHARGE_CENTS) {
    return {
      ok: false,
      error: `That totals ${(amountCents / 100).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      })}. Amounts are in dollars — check for an extra zero.`,
    };
  }

  return { ok: true, draft: { description, lineItems, amountCents } };
}

/**
 * "BM-2026-0007" — the year it was raised, then its position within that year.
 *
 * Deliberately no database access in this module: it is imported by the
 * admin projects list, which is a client component, and a `prisma` import
 * reachable from the browser bundle is how a server-only dependency ends up
 * failing at build time. The counting half lives next to the route that
 * writes the row.
 */
export function formatInvoiceNumber(year: number, sequence: number): string {
  return `BM-${year}-${String(sequence).padStart(4, '0')}`;
}

/** The prefix every invoice raised in a given year shares. */
export function invoiceNumberPrefix(year: number): string {
  return `BM-${year}-`;
}

/**
 * Dollars as typed → integer cents.
 *
 * Written out rather than `Math.round(Number(x) * 100)` because that is
 * wrong for money in the ordinary case: `12.35 * 100` is
 * 1234.9999999999998, and rounding papers over it only until the value
 * that doesn't round back. Parsing the two sides of the decimal point
 * separately keeps every amount exact.
 *
 * Returns null for anything that isn't a plain amount — an empty field,
 * more than two decimal places, letters. Null is "don't charge this", never
 * zero.
 */
export function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === '' || cleaned === '.') return null;
  const [whole, fraction = ''] = cleaned.split('.');
  const cents = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** The filename a client sees on the attachment, not a path we control. */
export function invoiceFilename(number: string): string {
  return `${number.replace(/[^A-Za-z0-9-]/g, '')}.pdf`;
}
