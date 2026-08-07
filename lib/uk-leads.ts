/**
 * Which leads are British, and therefore not ones this studio is working.
 *
 * The book is a US book. UK rows arrive anyway — a scrape that wandered, a
 * directory with mixed listings, a research pass that took a `.co.uk` for a
 * `.com` — and every one of them is a lead nobody will ever ring, sitting in
 * counts, in the call sheet's ordering, and in the daily send budget.
 *
 * Two signals, and they are checked independently because either one on its
 * own is enough and neither is reliably present:
 *
 *  - the COUNTRY, when somebody filled it in;
 *  - the PHONE NUMBER, which is filled in far more often and cannot be
 *    written in a way that hides a dialling code.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not guess from the address, the
 * company name, or a `.co.uk` domain. Those are suggestive and not proof, and
 * the action taken on the answer is deletion — so the bar is a fact on the
 * record, not an inference from one.
 */

const UK_COUNTRY_NAMES: ReadonlySet<string> = new Set([
  'uk',
  'u.k.',
  'gb',
  'gbr',
  'united kingdom',
  'united kingdom of great britain and northern ireland',
  'great britain',
  'britain',
  'england',
  'scotland',
  'wales',
  'northern ireland',
]);

/** Lower-cased, punctuation-stripped, so "U.K." and "uk" are one thing. */
const normalise = (value: string): string =>
  value.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

export function isUkCountry(country: string | null | undefined): boolean {
  if (!country?.trim()) return false;
  const cleaned = normalise(country);
  return UK_COUNTRY_NAMES.has(cleaned) || UK_COUNTRY_NAMES.has(country.toLowerCase().trim());
}

/**
 * A British phone number, however it was written down.
 *
 * Two shapes cover every real case:
 *
 *  - an international one, `+44…` or `0044…`, which is unambiguous;
 *  - a national one, eleven digits beginning `0` — `07496 815847`,
 *    `0161 496 0000`. No North American number looks like this: they are ten
 *    digits, or eleven beginning `1`.
 *
 * The leading-zero rule is what earns its place. Most UK rows in this book
 * were written by somebody copying a British website, so they carry no
 * dialling code at all — and those are exactly the ones a country check
 * misses too.
 */
export function isUkPhone(phone: string | null | undefined): boolean {
  if (!phone?.trim()) return false;

  const raw = phone.trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return false;

  // +44 … and 0044 … — the dialling code, written either way.
  if (/^\+\s*4\s*4/.test(raw)) return true;
  if (digits.startsWith('0044')) return true;

  /*
   * Bare `44…`, but only at a length that makes it a dialling code rather
   * than the middle of something else. A US number can start 44 quite
   * legitimately — area code 442 covers part of California — so this is
   * checked at UK length only, never at ten digits.
   */
  if (digits.startsWith('44') && digits.length >= 12) return true;

  // National form: 11 digits from a leading zero. Never a US number.
  if (digits.length === 11 && digits.startsWith('0')) return true;

  return false;
}

export interface MaybeUkLead {
  phone?: string | null;
  country?: string | null;
}

/** Either signal is enough. Neither is reliably present on its own. */
export function isUkLead(lead: MaybeUkLead): boolean {
  return isUkCountry(lead.country) || isUkPhone(lead.phone);
}

/** Which of the two flagged it, for a preview somebody has to trust. */
export function ukReason(lead: MaybeUkLead): 'country' | 'phone' | null {
  if (isUkCountry(lead.country)) return 'country';
  if (isUkPhone(lead.phone)) return 'phone';
  return null;
}
