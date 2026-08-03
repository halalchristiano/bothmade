import { describe, expect, it } from 'vitest';
import { COUNTRIES, countryByIso2, hasKnownDialCode } from '@/lib/country-codes';
import {
  FIELD_LIMITS,
  composePhone,
  sanitizeNationalNumber,
  isValidCompany,
  isValidEmail,
  isValidMessage,
  isValidName,
  isValidPhone,
  normalizePhone,
  phoneDigits,
  sanitizeNameInput,
  sanitizePhoneInput,
} from '@/lib/validation';

/**
 * These predicates are the only thing standing between the contact form and
 * the CRM. Both the browser and `/api/contact` call them, so what's pinned
 * here is the contract the two sides agree on — a rule that loosens on one
 * side only shows up as a lead nobody can act on: a name that's really a
 * phone number, or a number a rep dials into a dead tone.
 */

describe('names', () => {
  it('accepts names as people actually write them', () => {
    for (const name of [
      'Kiana Arabpour',
      "O'Neill",
      'Jean-Luc Picard',
      'Renée Zellweger',
      'Ana María de la Cruz',
      'Иван Петров',
      '田中太郎',
      'Smith, Jr.',
    ]) {
      expect(isValidName(name), name).toBe(true);
    }
  });

  it('rejects a phone number, an email or a URL typed into the name box', () => {
    for (const wrong of ['07700 900123', 'me@example.com', 'https://example.com', '12345']) {
      expect(isValidName(wrong), wrong).toBe(false);
    }
  });

  it('rejects an initial alone, and anything blank', () => {
    expect(isValidName('K')).toBe(false);
    expect(isValidName('   ')).toBe(false);
    expect(isValidName('')).toBe(false);
  });

  it('rejects markup outright rather than relying on escaping downstream', () => {
    expect(isValidName('<script>alert(1)</script>')).toBe(false);
  });

  it('rejects a name past the column length', () => {
    expect(isValidName('a'.repeat(FIELD_LIMITS.name))).toBe(true);
    expect(isValidName('a'.repeat(FIELD_LIMITS.name + 1))).toBe(false);
  });

  it('strips what it would reject, so the value can never be typed', () => {
    expect(sanitizeNameInput('Kiana 07700900123')).toBe('Kiana ');
    expect(sanitizeNameInput("Jean-Luc O'Neill")).toBe("Jean-Luc O'Neill");
    expect(sanitizeNameInput('<b>Kiana</b>')).toBe('bKianab');
  });

  it('truncates rather than accepting an over-long paste', () => {
    expect(sanitizeNameInput('a'.repeat(500))).toHaveLength(FIELD_LIMITS.name);
  });
});

describe('emails', () => {
  it('accepts an ordinary address', () => {
    for (const email of [
      'year-forum0p@icloud.com',
      'first.last+tag@sub.example.co.uk',
      'k_a@bothmade.studio',
    ]) {
      expect(isValidEmail(email), email).toBe(true);
    }
  });

  it('rejects the near-misses people actually type', () => {
    for (const wrong of [
      'not-an-address',
      'missing@tld',
      '@example.com',
      'two@@example.com',
      'spaced out@example.com',
      'trailing@example.',
    ]) {
      expect(isValidEmail(wrong), wrong).toBe(false);
    }
  });

  it('rejects anything that could smuggle a second recipient or a header', () => {
    // This value becomes a replyTo header, so a display name, a comma or a
    // newline in it is a header-injection attempt, not an address.
    for (const wrong of [
      'Kiana <kiana@example.com>',
      'a@example.com, b@example.com',
      'a@example.com\nBcc: c@example.com',
    ]) {
      expect(isValidEmail(wrong), wrong).toBe(false);
    }
  });
});

describe('phone numbers', () => {
  it('accepts the formats a visitor is likely to type', () => {
    for (const phone of [
      '+1 (555) 000-0000',
      '555-000-0000',
      '5550000000',
      '+44 7700 900123',
      '020 7946 0958',
      '+353 1 234 5678',
    ]) {
      expect(isValidPhone(phone), phone).toBe(true);
    }
  });

  it('rejects anything with letters in it', () => {
    for (const wrong of ['555-CALL-NOW', 'not a phone', 'O7700900123']) {
      expect(isValidPhone(wrong), wrong).toBe(false);
    }
  });

  it('rejects a number too short to dial or too long to exist', () => {
    expect(isValidPhone('12345')).toBe(false); // 5 digits
    expect(isValidPhone('1234567')).toBe(true); // 7, the floor
    expect(isValidPhone('123456789012345')).toBe(true); // 15, E.164's ceiling
    expect(isValidPhone('1234567890123456')).toBe(false); // 16
  });

  it('rejects a dial code no country uses', () => {
    // The form picks the code from a list, so this can only arrive from
    // something that bypassed it.
    expect(isValidPhone('+999 1234567')).toBe(false);
    expect(isValidPhone('+353 1 234 5678')).toBe(true);
  });

  it('holds North American numbers to their fixed ten digits', () => {
    // E.164's seven-digit floor would wave "+1 123456" through, and it is not
    // a number anyone can ring. Every NANP number is ten digits after the 1,
    // and these are the studio's own markets.
    expect(isValidPhone('+1 123456')).toBe(false);
    expect(isValidPhone('+1 555 000 000')).toBe(false); // 9
    expect(isValidPhone('+1 555 000 0000')).toBe(true); // 10
    expect(isValidPhone('+1 555 000 00000')).toBe(false); // 11
  });

  it('rejects an empty or blank value, leaving "optional" to the caller', () => {
    // The field is optional on both forms, but that is the form's decision to
    // make — an empty string is not a valid phone number.
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone('   ')).toBe(false);
  });

  it('rejects rather than salvages a value with junk in it', () => {
    // Stripping the letters out of this would invent a number nobody typed
    // and hand a rep something to dial.
    expect(isValidPhone('call me on 5550000000')).toBe(false);
  });

  it('keeps a leading + and drops one anywhere else', () => {
    expect(sanitizePhoneInput('+15550000000')).toBe('+15550000000');
    expect(sanitizePhoneInput('555+000+0000')).toBe('5550000000');
    expect(isValidPhone('555+000+0000')).toBe(false);
  });

  it('strips letters as they are typed', () => {
    expect(sanitizePhoneInput('555-CALL')).toBe('555-');
    expect(sanitizePhoneInput('+1 (555) 000-0000')).toBe('+1 (555) 000-0000');
  });

  it('keeps the caller‑typed grouping when storing, tidying only whitespace', () => {
    // A rep reads this back down the phone; a bare run of digits is harder.
    expect(normalizePhone('  +1  (555)   000-0000  ')).toBe('+1 (555) 000-0000');
  });

  it('reduces to digits for tel: links and area-code lookups', () => {
    expect(phoneDigits('+1 (555) 000-0000')).toBe('15550000000');
  });
});

describe('the split phone field', () => {
  it('refuses a + in the number box, since the dropdown supplies it', () => {
    // Letting one through would compose "+44 +44 7700900123".
    expect(sanitizeNationalNumber('+44 7700 900123')).toBe('44 7700 900123');
    expect(sanitizeNationalNumber('(555) 000-0000')).toBe('(555) 000-0000');
    expect(sanitizeNationalNumber('555 CALL')).toBe('555 ');
  });

  it('joins the code to the number as one dialable string', () => {
    expect(composePhone('+44', '7700 900123')).toBe('+44 7700 900123');
    expect(composePhone('+1', '  (555)   000-0000  ')).toBe('+1 (555) 000-0000');
  });

  it('composes nothing from an empty number, rather than a bare dial code', () => {
    // "+1" on its own in the CRM reads as a phone number until someone tries
    // to ring it.
    expect(composePhone('+1', '')).toBe('');
    expect(composePhone('+1', '   ')).toBe('');
  });

  it('produces a value the full validator accepts', () => {
    expect(isValidPhone(composePhone('+44', '7700 900123'))).toBe(true);
    expect(isValidPhone(composePhone('+1', '5550000000'))).toBe(true);
    // Too short under +1, long enough once a longer code is in front of it.
    expect(isValidPhone(composePhone('+1', '12345'))).toBe(false);
    expect(isValidPhone(composePhone('+353', '12345'))).toBe(true);
  });

  it('caps the number box short enough that composing cannot overflow', () => {
    const longest = COUNTRIES.reduce((a, b) => (a.dial.length > b.dial.length ? a : b));
    const composed = composePhone(longest.dial, '9'.repeat(200));

    expect(composed.length).toBeLessThanOrEqual(FIELD_LIMITS.phone);
  });
});

describe('the country list', () => {
  it('carries the flag, name and dial code for each country', () => {
    expect(countryByIso2('US')).toEqual({
      iso2: 'US',
      name: 'United States',
      dial: '+1',
      flag: '🇺🇸',
    });
    expect(countryByIso2('GB')).toMatchObject({ name: 'United Kingdom', dial: '+44', flag: '🇬🇧' });
    expect(countryByIso2('IE')).toMatchObject({ dial: '+353', flag: '🇮🇪' });
  });

  it('leads with the studio’s own markets', () => {
    // Two hundred countries between a US visitor and the obvious answer is a
    // worse first impression than the form is worth.
    expect(COUNTRIES.slice(0, 5).map((c) => c.iso2)).toEqual(['US', 'GB', 'CA', 'IE', 'AU']);
  });

  it('lists everywhere else alphabetically, once each', () => {
    const rest = COUNTRIES.slice(5).map((c) => c.name);

    expect([...rest].sort((a, b) => a.localeCompare(b))).toEqual(rest);
    expect(new Set(COUNTRIES.map((c) => c.iso2)).size).toBe(COUNTRIES.length);
  });

  it('derives every flag from its ISO code, so none can be the wrong one', () => {
    // Two regional indicator symbols, always — a pasted flag is what drifts.
    for (const country of COUNTRIES) {
      expect([...country.flag], country.iso2).toHaveLength(2);
      expect(country.dial, country.iso2).toMatch(/^\+\d{1,4}$/);
    }
  });

  it('knows a real dial code from an invented one', () => {
    expect(hasKnownDialCode('15550000000')).toBe(true);
    expect(hasKnownDialCode('447700900123')).toBe(true);
    expect(hasKnownDialCode('3531234567')).toBe(true);
    expect(hasKnownDialCode('9991234567')).toBe(false);
  });
});

describe('messages and company', () => {
  it('rejects a message too short to be an enquiry', () => {
    expect(isValidMessage('hi')).toBe(false);
    expect(isValidMessage('   ')).toBe(false);
    expect(isValidMessage('I want an app')).toBe(true);
  });

  it('leaves company permissive, because real ones are', () => {
    for (const company of ['3M', "Ben & Jerry's", 'Foo, Inc.', '']) {
      expect(isValidCompany(company), company).toBe(true);
    }
    expect(isValidCompany('a'.repeat(FIELD_LIMITS.company + 1))).toBe(false);
  });
});
