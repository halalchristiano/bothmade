/**
 * Field rules for the public-facing forms, in one place because both sides
 * need them.
 *
 * A check the browser does and the server doesn't is decoration — anything
 * can POST to the route directly. A check the server does and the browser
 * doesn't is a submission that fails after the fact, with the visitor's
 * message already gone from the screen. So the form and the route behind it
 * import the same predicates and the same wording, and cannot drift apart.
 *
 * No Node or React imports here: this runs in the browser as well as on the
 * server.
 */

import { hasKnownDialCode } from './country-codes';

export const FIELD_LIMITS = {
  name: 100,
  email: 254,
  company: 120,
  /** The whole thing, dial code included — this is what gets stored. */
  phone: 32,
  /**
   * Just the part typed into the number box. Short enough that appending it
   * to the longest dial code still fits in `phone`, so composing the two can
   * never overflow into a "that number is invalid" the visitor can't explain.
   */
  nationalNumber: 24,
  message: 4000,
} as const;

export const NAME_MIN = 2;

/**
 * Long enough to rule out "hi" and a stray keypress, short enough that a
 * genuine one-line enquiry ("Need an iOS app") still gets through.
 */
export const MESSAGE_MIN = 10;

/**
 * What the form and the route say when a field is wrong. Shared so the
 * message a visitor sees inline is the same one they'd get back from the
 * server, rather than two different accounts of the same problem.
 */
export const FIELD_ERRORS = {
  name: 'Enter your name using letters, spaces, hyphens or apostrophes.',
  email: 'Enter a valid email address, like name@company.com.',
  phone: 'Enter a valid phone number for the country code selected.',
  company: `Company name must be under ${FIELD_LIMITS.company} characters.`,
  message: `Tell us a little more — at least ${MESSAGE_MIN} characters.`,
} as const;

/**
 * Letters (any script, so accents and non-Latin names are fine), plus the
 * punctuation that actually appears in names. Digits and symbols are not
 * name characters — "07700 900123" in the name box is a phone number in the
 * wrong field, and this is what catches it.
 */
const NAME_ALLOWED = /^[\p{L}\p{M}][\p{L}\p{M} '’.,-]*$/u;

/** Strips what `isValidName` would reject, so it can't be typed in the first place. */
export function sanitizeNameInput(value: string): string {
  return value.replace(/[^\p{L}\p{M} '’.,-]/gu, '').slice(0, FIELD_LIMITS.name);
}

export function isValidName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < NAME_MIN || trimmed.length > FIELD_LIMITS.name) return false;
  return NAME_ALLOWED.test(trimmed);
}

/**
 * Deliberately conservative: no display names, no comments, no newlines.
 * This address ends up as a `replyTo` header, so anything that could carry a
 * second address or a header break has no business passing.
 */
export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > FIELD_LIMITS.email) return false;
  return /^[^\s@<>"']+@[^\s@<>"'.]+\.[^\s@<>"']{2,}$/.test(trimmed);
}

/** Digits and the punctuation people put between them. Nothing else is dialable. */
const PHONE_DISALLOWED = /[^0-9+()\-.\s]/g;

/**
 * Makes a phone field refuse anything that isn't part of a phone number.
 * `+` survives only in first position, where it means a country code —
 * anywhere else it's noise.
 */
export function sanitizePhoneInput(value: string): string {
  // trimStart on both halves, or " +1 555…" comes back as "+ 1 555…" — the
  // country code parted from its own digits. Nothing legitimate starts with
  // a space, so dropping leading whitespace is free.
  const stripped = value.replace(PHONE_DISALLOWED, '').trimStart();
  const lead = stripped.startsWith('+') ? '+' : '';
  return (lead + stripped.replace(/\+/g, '').trimStart()).slice(0, FIELD_LIMITS.phone);
}

/**
 * The national part alone, for the form's number box — the country code
 * comes from the dropdown beside it, so a `+` typed here would only produce
 * a second one.
 */
export function sanitizeNationalNumber(value: string): string {
  return value
    .replace(/[^0-9()\-.\s]/g, '')
    .trimStart()
    .slice(0, FIELD_LIMITS.nationalNumber);
}

/**
 * Joins what the dropdown chose to what was typed, into the single string
 * that gets stored and dialled. Empty in, empty out, so an untouched field
 * doesn't become a bare "+1".
 */
export function composePhone(dial: string, national: string): string {
  const number = sanitizeNationalNumber(national).replace(/\s+/g, ' ').trim();
  return number ? `${dial} ${number}` : '';
}

export function phoneDigits(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/**
 * Rejects rather than strips: a value the browser would have sanitised can
 * only reach the server if someone bypassed the form, and silently keeping
 * the digits out of `x9y8z7...` would invent a number nobody typed.
 *
 * 15 is E.164's ceiling for a whole number including the country code; 7 is
 * the shortest thing that can be dialled anywhere.
 */
export function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > FIELD_LIMITS.phone) return false;
  if (trimmed !== sanitizePhoneInput(trimmed)) return false;
  const digits = phoneDigits(trimmed);
  if (digits.length < 7 || digits.length > 15) return false;
  // A leading + is a claim about which country this dials, so it has to be a
  // country that exists. The form picks the code from a list and can't
  // produce +999, but the route is reachable without the form.
  if (trimmed.startsWith('+')) {
    if (!hasKnownDialCode(digits)) return false;
    // Per-country number lengths are a library's worth of data, and getting
    // them wrong rejects real customers — so only the one that is fixed and
    // certain is enforced. Every NANP number is exactly ten digits after the
    // 1, and these are the studio's own markets, where a six-digit number
    // waved through as "seven digits, close enough" is a call that fails.
    if (digits.startsWith('1') && digits.length !== 11) return false;
  }
  return true;
}

/**
 * Storage form. Keeps the caller's own grouping — `(555) 000-0000` is easier
 * for a rep to read back over the phone than a run of digits — and only
 * tidies the whitespace. Everything downstream (`leadLocalTime`, tel: links)
 * reduces to digits itself.
 */
export function normalizePhone(value: string): string {
  return sanitizePhoneInput(value).replace(/\s+/g, ' ').trim();
}

export function isValidMessage(value: string): boolean {
  return value.trim().length >= MESSAGE_MIN;
}

/**
 * Company is the loose one on purpose: "3M", "Ben & Jerry's" and "Foo, Inc."
 * are all real, so length is the only thing worth asserting.
 */
export function isValidCompany(value: string): boolean {
  return value.trim().length <= FIELD_LIMITS.company;
}
