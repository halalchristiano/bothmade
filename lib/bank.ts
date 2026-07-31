/**
 * Bank transfer details, shown on a client's deposit panel.
 *
 * The industry norm for B2B invoices of this size is a transfer, not a card:
 * card processing costs 1.5–3.5%, which on a £10,000 deposit is £150–£350 of
 * pure margin, and nobody paying five figures expects to type a card number.
 * Cards earn their fee on small, urgent, impulse payments. A project deposit
 * is none of those.
 *
 * So this is the default path and Stripe is the optional extra, rather than
 * the other way round. Fill these in from environment variables — account
 * numbers in a public repository is exactly the kind of thing that gets
 * scraped.
 */

export type BankDetails = {
  accountName: string;
  sortCode: string;
  accountNumber: string;
  /** Only needed for clients paying from outside the UK. */
  iban?: string;
  bic?: string;
  bankName?: string;
};

export function bankDetails(): BankDetails | null {
  const accountName = process.env.BANK_ACCOUNT_NAME;
  const sortCode = process.env.BANK_SORT_CODE;
  const accountNumber = process.env.BANK_ACCOUNT_NUMBER;

  // All three or nothing — half a set of bank details is worse than none,
  // because a client will try to pay with it and the transfer will bounce.
  if (!accountName || !sortCode || !accountNumber) return null;

  return {
    accountName,
    sortCode,
    accountNumber,
    iban: process.env.BANK_IBAN,
    bic: process.env.BANK_BIC,
    bankName: process.env.BANK_NAME,
  };
}

/**
 * The reference a client puts on their transfer. Derived from their name and
 * the moment their link was minted, so it is stable across visits and unique
 * per project — which is the difference between reconciling a payment in five
 * seconds and going through a bank statement by hand.
 */
export function paymentReference(name: string, iat: number): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return `BM-${initials || 'XX'}-${String(iat).slice(-6)}`;
}
