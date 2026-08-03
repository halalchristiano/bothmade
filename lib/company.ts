/**
 * The studio's own details — the "from" side of anything we issue.
 *
 * Kept in one place because the same address has to appear on the invoice PDF,
 * the contract PDF, the site footer and the transactional email footer: an
 * invoice without a supplier address isn't a valid invoice, and a client
 * chasing a payment query should find the same address everywhere.
 */
export const COMPANY_NAME = 'Bothmade';

/** Postal address, one line per line as it should be printed. */
export const COMPANY_ADDRESS_LINES = [
  'Suite 695',
  '80A Ruskin Ave',
  'Welling DA16 3QQ',
  'United Kingdom',
] as const;

/** Same address on a single line, for footers and other tight spaces. */
export const COMPANY_ADDRESS_INLINE = COMPANY_ADDRESS_LINES.join(', ');

/**
 * Where billing questions go. A constant rather than the CONTACT_EMAIL env
 * var: that one picks the mailbox we send *from*, and this gets printed into
 * documents and the client-side footer, where a server env var can't be read.
 */
export const COMPANY_EMAIL = 'info@bothmade.studio';

export const COMPANY_WEBSITE = 'bothmade.studio';
