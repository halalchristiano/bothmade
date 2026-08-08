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
 * What the project itself records about the two moments the contract names.
 *
 * Both are stamped by a deliberate act with a date on it, and both are more
 * authoritative than the stage dropdown — because both ARE the definition:
 *
 *   §4  Design Approval happens when the client approves, or when the review
 *       period lapses without a reply. `designApprovedAt` is that moment.
 *   §1  "Ready for Launch" means the Agency "has confirmed in writing through
 *       the dashboard that it is ready to go live." `readyForLaunchAt` is
 *       that confirmation — see the deployment route, which writes it and
 *       puts it on the client's timeline.
 */
export interface GateRecord {
  designApprovedAt?: Date | string | null;
  readyForLaunchAt?: Date | string | null;
}

/**
 * Has the schedule's gate for this instalment actually been passed?
 *
 * The instalment triggers are written in the language of the contract — "on
 * signing", "on design approval", "when ready for launch". Sending is still a
 * deliberate act by a person; this only answers whether it *would* be fair to
 * send, which is the difference between "we haven't billed them yet" and "we
 * can't bill them yet".
 *
 * The stage is the fallback, not the source. It used to be the only thing
 * read, and that made the system contradict itself out loud: a project could
 * be confirmed Ready for Launch on the launch board — the exact act Section 1
 * defines the phrase as, announced to the client on their own timeline, in a
 * lane captioned "what makes Payment 3 due" — and the one route that bills
 * Payment 3 would still refuse it as a milestone that had not happened.
 *
 * Design Approval had the same hole, half-patched: uninvoicedPayments() in
 * lib/stage-gates carried its own inline exception for `designApprovedAt` so
 * a lapsed review period would surface the money, and nothing else in the
 * codebase knew about it. Both records belong here, where every caller
 * already looks.
 */
export function gateReached(
  trigger: string,
  statusStage: number,
  recorded: GateRecord = {}
): boolean {
  // past Design, or the approval is on the record
  if (trigger === 'design-approval') return statusStage >= 2 || Boolean(recorded.designApprovedAt);
  // Launch or later, or we confirmed it in writing
  if (trigger === 'ready-for-launch') return statusStage >= 3 || Boolean(recorded.readyForLaunchAt);
  return true; // signing — they signed, or there'd be no project
}

/**
 * Where a project's money actually stands, split by whose move it is.
 *
 * "Balance due" used to be one number — contracted price minus everything
 * paid — and that number was wrong in two directions at once.
 *
 * It was too small because it counted one-off `custom` payments, so a client
 * invoiced separately for a change request appeared to have paid down the
 * project itself. And it was too big because every project now carries a
 * three-instalment schedule, so the moment someone pays the 40% on signing,
 * the other 60% reads as "outstanding" — money that is not owed, has not been
 * invoiced, and in most cases cannot be invoiced yet. A chase list where every
 * live project is permanently flagged is a chase list nobody opens.
 *
 * So there are three numbers, and they mean different things:
 *
 *   dueNow    — invoiced, unpaid. Chase the client.
 *   unbilled  — past its gate, never invoiced. Chase *yourself*; this is money
 *               sitting on the table because nobody pressed send.
 *   gated     — not owed yet. Not a problem. Not on any list.
 */
export interface ProjectBalance {
  /** Contracted price minus what's cleared against it — the whole rest of the job. */
  remainingCents: number;
  /** Invoiced and unpaid. The only figure that belongs on a chase list. */
  dueNowCents: number;
  /** Gate passed, invoice never sent. Ours to fix, not theirs. */
  unbilledCents: number;
  /** Deliberately held back by the schedule. */
  gatedCents: number;
}

export interface BalanceInstalment {
  status: string;
  amountCents: number;
  trigger: string;
}

export function projectBalance(
  project: {
    totalPrice: number;
    statusStage: number;
    payments: Array<{ amount: number; type: string }>;
    instalments: BalanceInstalment[];
  } & GateRecord
): ProjectBalance {
  const paid = amountPaidTowardProject(project.payments);
  const remainingCents = Math.max(0, project.totalPrice - paid);

  // No schedule means a project from before instalments existed, still on the
  // old lump-balance flow. There is no gate to be behind: whatever is left is
  // simply owed.
  const live = project.instalments.filter((i) => i.status !== 'void');
  if (live.length === 0) {
    return { remainingCents, dueNowCents: remainingCents, unbilledCents: 0, gatedCents: 0 };
  }

  let dueNowCents = 0;
  let unbilledCents = 0;
  let gatedCents = 0;
  for (const inst of live) {
    if (inst.status === 'paid') continue;
    if (inst.status === 'due') dueNowCents += inst.amountCents;
    else if (gateReached(inst.trigger, project.statusStage, project)) unbilledCents += inst.amountCents;
    else gatedCents += inst.amountCents;
  }

  return { remainingCents, dueNowCents, unbilledCents, gatedCents };
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

/**
 * Capitalises the first letter, and only the first letter.
 *
 * This description becomes the heading on a client's invoice and the subject
 * of the email carrying it, so "extra page" typed at speed should not be how
 * they receive it. Title-casing every word was the obvious alternative and is
 * wrong: it turns "SEO audit" into "Seo Audit" and "iOS app" into "Ios App",
 * which is a worse failure than a lowercase first letter because it looks
 * deliberate. A line already carrying capitals is left exactly as typed.
 */
export function openingCapital(text: string): string {
  if (!text) return text;
  return text[0].toUpperCase() + text.slice(1);
}

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
    typeof input.description === 'string'
      ? openingCapital(input.description.trim().slice(0, MAX_DESCRIPTION_LENGTH))
      : '';
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

/**
 * Why the Charge button won't go, in the words the person at the keyboard
 * needs — or null when it will.
 *
 * The form used to disable the button and say nothing. Every one of the five
 * reasons it could be dead is a sentence readChargeDraft() already writes
 * beautifully, and none of them were ever seen, because the button that would
 * have submitted the request was the thing switched off. So somebody typing
 * "1,200" into an amount field with a stray character in it, or leaving the
 * heading blank, got a grey rectangle and no explanation — and a disabled
 * control with no reason reads as a broken page, not as an unfinished form.
 *
 * Ordered the way the form is filled, so it names the next thing to do rather
 * than the worst thing wrong.
 */
export function describeChargeBlocker(input: {
  hasCustomer: boolean;
  description: string;
  /** Exactly as typed, before any parsing — an unparseable amount is its own message. */
  lines: Array<{ label: string; amount: string }>;
}): string | null {
  if (!input.hasCustomer) {
    return 'Pick the customer this is for.';
  }
  if (!input.description.trim()) {
    return 'Say what the charge is for — it becomes the invoice heading and the email subject.';
  }

  const parsed = input.lines.map((line) => ({
    label: line.label.trim(),
    raw: line.amount.trim(),
    cents: dollarsToCents(line.amount),
  }));

  // A number that won't parse is a different problem from a number that is
  // missing, and "amount above zero" sends somebody hunting for a zero they
  // didn't type. Three decimal places and a stray letter both land here.
  if (parsed.some((line) => line.raw !== '' && line.cents === null)) {
    return 'Amounts look like 250 or 250.00 — digits, and at most two decimal places.';
  }
  if (parsed.some((line) => !line.label || line.cents === null || line.cents <= 0)) {
    return 'Every line needs a description and an amount above zero.';
  }

  const total = parsed.reduce((sum, line) => sum + (line.cents ?? 0), 0);
  if (total < MIN_CHARGE_CENTS) {
    return 'The total has to be at least $1 — cards reject anything smaller.';
  }
  if (total > MAX_CHARGE_CENTS) {
    return `That totals ${(total / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    })}. Amounts are in dollars — check for an extra zero.`;
  }

  return null;
}

/** The filename a client sees on the attachment, not a path we control. */
export function invoiceFilename(number: string): string {
  return `${number.replace(/[^A-Za-z0-9-]/g, '')}.pdf`;
}

/**
 * Claim the next invoice number and write the ledger row in one go.
 *
 * The ledger's unique constraint on `number` is the lock: a P2002 means
 * somebody else took it, and the next attempt counts again and gets the one
 * after. Three call sites were carrying their own copy of this loop — the
 * custom-charge allocator, the instalment sender, and the webhook — which is
 * three places for the retry to be subtly different in.
 *
 * Returns null after five collisions rather than throwing, because every
 * caller would rather report "couldn't allocate a number, try again" than
 * lose the thing it was raising an invoice for.
 */
export async function createInvoiceRow(
  db: {
    invoice: {
      count(args: unknown): Promise<number>;
      create(args: unknown): Promise<{ id: string; number: string; createdAt: Date }>;
    };
  },
  input: {
    clientId: string;
    projectId: string;
    description: string;
    lineItems: Array<{ label: string; priceCents: number }>;
    amountCents: number;
    issuedById?: string | null;
    sentToEmail?: string | null;
    /** A payment already taken is recorded as settled, not as owed. */
    status?: 'open' | 'paid';
    paidAt?: Date | null;
  },
  now: Date = new Date()
): Promise<{ id: string; number: string; createdAt: Date } | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const year = now.getUTCFullYear();
    const issued = await db.invoice.count({
      where: { number: { startsWith: invoiceNumberPrefix(year) } },
    });
    const number = formatInvoiceNumber(year, issued + 1);
    try {
      return await db.invoice.create({
        data: {
          number,
          clientId: input.clientId,
          projectId: input.projectId,
          description: input.description,
          lineItems: input.lineItems,
          amountCents: input.amountCents,
          status: input.status ?? 'open',
          paidAt: input.paidAt ?? null,
          issuedById: input.issuedById ?? null,
          sentToEmail: input.sentToEmail ?? null,
        },
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error;
      console.warn(`Invoice number ${number} was taken — retrying (attempt ${attempt + 1}).`);
    }
  }
  return null;
}
