/**
 * What may not be deleted, and the sentence explaining why.
 *
 * Three routes can destroy a project: deleting one, deleting fifty at once,
 * and deleting the client they hang off. All three cascade — a project takes
 * eleven tables with it and a client takes every project — so all three need
 * the same answer to "is any of this an accounting record", and before this
 * module they gave three different ones:
 *
 *   - the single project delete refused when a payment existed,
 *   - the bulk delete did not exist yet, and
 *   - the client delete refused nothing at all, which made it the way round
 *     the other guard: the project the studio was told it could not delete
 *     could be deleted, with its payments, by deleting the client instead.
 *
 * So the rule lives here once and the routes call it.
 *
 * ## Why invoices count, and not only payments
 *
 * A payment is money that arrived. An invoice is a numbered document that
 * went to a client — `BM-2026-0031`, unique and sequential within the year —
 * and deleting one leaves a hole in that sequence that nobody can explain
 * afterwards. `void` invoices are included deliberately: the schema keeps
 * them precisely because a cancelled charge is part of the record ("kept,
 * never deleted"), so a delete that takes them is the exact loss the void
 * status exists to prevent.
 *
 * The project route counted invoices before this and then never looked at the
 * number — the guard read `_count.payments` alone — so a project that had
 * been invoiced but not yet paid deleted cleanly and took its invoices with
 * it. That is the most likely state for a real engagement to be in: charge
 * raised, client hasn't paid yet.
 */

/** The records that make a deletion permanent, counted per project. */
export interface AccountingRecordCounts {
  payments: number;
  invoices: number;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * The reason this cannot be deleted, or null when it can be.
 *
 * `subject` is what the caller is looking at — a company name, usually,
 * because that is what the person pressing the button typed. The returned
 * string is shown to them verbatim, so it names what is in the way and what
 * to do instead rather than only refusing.
 */
export function accountingHold(
  subject: string,
  counts: AccountingRecordCounts
): string | null {
  const held: string[] = [];
  if (counts.payments > 0) held.push(plural(counts.payments, 'payment'));
  if (counts.invoices > 0) held.push(plural(counts.invoices, 'invoice'));
  if (held.length === 0) return null;

  return (
    `${subject} has ${held.join(' and ')} recorded against it. ` +
    'Payments and invoices are accounting records — they cannot be deleted. ' +
    'Decommission the client instead, or tell us what you actually need removed.'
  );
}

/** Short form for a list, where the full sentence would repeat per row. */
export function accountingHoldReason(counts: AccountingRecordCounts): string | null {
  const held: string[] = [];
  if (counts.payments > 0) held.push(plural(counts.payments, 'payment'));
  if (counts.invoices > 0) held.push(plural(counts.invoices, 'invoice'));
  return held.length === 0 ? null : held.join(' and ');
}

/**
 * The phrase that confirms deleting several projects at once.
 *
 * A single delete asks for the company name typed out, which is the one
 * confirmation a person cannot satisfy by clicking through on autopilot. That
 * does not generalise: across six companies, typing one of the six names
 * proves nothing about the other five.
 *
 * So the phrase carries the count. It cannot be typed ahead of the selection,
 * and — the part that matters — it stops matching the moment the selection
 * changes underneath it. Tick a seventh row after typing "delete 6 projects"
 * and the button disarms rather than quietly taking the extra one.
 */
export function bulkDeletePhrase(count: number): string {
  return `delete ${count} project${count === 1 ? '' : 's'}`;
}

/** Case- and space-insensitive, because the point is proving you read it. */
export function matchesBulkDeletePhrase(typed: unknown, count: number): boolean {
  if (typeof typed !== 'string') return false;
  return typed.trim().replace(/\s+/g, ' ').toLowerCase() === bulkDeletePhrase(count);
}
