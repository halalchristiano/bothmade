// The affirmative act behind a signature on the sign-and-pay page.
//
// Kept in its own tiny module rather than in contract-terms.ts because the
// public /sign page is a client component: importing the contract builder
// there would ship every clause of every conditional exhibit to the browser
// just to render one sentence next to a checkbox.
//
// The point of the statement being a constant is that the server records the
// sentence *it* serves, not a string the browser posted. What the client
// sends is the fact that the box was ticked and the name that was typed;
// what the record says they agreed to comes from here, so a crafted POST
// can't put words in their mouth.

import { FIELD_LIMITS, isValidName } from '@/lib/validation';

/**
 * Rendered verbatim beside the checkbox, stored verbatim on the signature,
 * and printed verbatim on the executed PDF. If this sentence changes, it
 * changes in one place and all three follow — a signature record that
 * quotes a statement the client never saw is worth less than no record.
 */
export const CLICKWRAP_STATEMENT =
  'I have read and agree to the terms above. I understand that typing my full name and ' +
  'proceeding to payment is my electronic signature on this agreement, with the same ' +
  'effect as signing it on paper.';

/** Same rules as any other name field on the site — see lib/validation.ts. */
export const SIGNER_NAME_MAX = FIELD_LIMITS.name;

/**
 * User agent strings are attacker-controlled and unbounded. 512 characters
 * is well past the longest real one and short enough that nobody can use
 * the signature record as free storage.
 */
export const USER_AGENT_MAX = 512;

/**
 * Returns the name to record, or null if what was posted isn't a name.
 * Trimmed, because trailing whitespace on a legal signature is noise.
 */
export function normalizeSignerName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return isValidName(trimmed) ? trimmed : null;
}
