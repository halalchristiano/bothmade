import { describe, expect, it } from 'vitest';
import { isUkCountry, isUkLead, isUkPhone, ukReason } from '@/lib/uk-leads';

/**
 * Telling a British lead from an American one.
 *
 * The book is a US book. UK rows arrive anyway — a scrape that wandered, a
 * directory with mixed listings — and every one is a lead nobody will ever
 * ring, sitting in counts, in the call sheet's ordering and in a daily send
 * budget that exists because the account was once restricted.
 *
 * The action taken on this answer is DELETION, and a deleted lead takes its
 * whole history with it. So the tests that matter most here are the ones
 * about not deleting an American business by mistake.
 */

describe('a country somebody filled in', () => {
  it('reads the ways people write it', () => {
    for (const country of [
      'UK',
      'uk',
      'U.K.',
      'GB',
      'United Kingdom',
      'united kingdom',
      'Great Britain',
      'England',
      'Scotland',
      'Wales',
      'Northern Ireland',
    ]) {
      expect(isUkCountry(country), country).toBe(true);
    }
  });

  it('leaves everywhere else alone', () => {
    for (const country of ['US', 'USA', 'United States', 'Canada', 'Ireland', 'Australia', '', null]) {
      expect(isUkCountry(country), String(country)).toBe(false);
    }
  });

  /**
   * The Republic of Ireland is a different country with a different dialling
   * code, and deleting it because the word "Ireland" appears in "Northern
   * Ireland" would be the wrong hundred rows.
   */
  it('does not take Ireland for Northern Ireland', () => {
    expect(isUkCountry('Ireland')).toBe(false);
    expect(isUkCountry('Republic of Ireland')).toBe(false);
  });
});

describe('a phone number, however it was written', () => {
  it('reads an international British number', () => {
    for (const phone of ['+44 7496 815847', '+447496815847', '+44 (0)161 496 0000', '00447496815847']) {
      expect(isUkPhone(phone), phone).toBe(true);
    }
  });

  /**
   * The rule that earns its place. Most UK rows in this book were written by
   * somebody copying a British website, so they carry no dialling code at all
   * — and those are exactly the ones the country check misses too.
   */
  it('reads a national British number with no dialling code', () => {
    for (const phone of ['07496 815847', '0161 496 0000', '020 7946 0018', '(01865) 240000']) {
      expect(isUkPhone(phone), phone).toBe(true);
    }
  });

  /** Every shape the American book actually contains. */
  it('never mistakes a US number for one', () => {
    for (const phone of [
      '(212) 555-0100',
      '212-555-0100',
      '1 (212) 555-0100',
      '+1 212 555 0100',
      '212.555.0100',
      '336 555 0100',
    ]) {
      expect(isUkPhone(phone), phone).toBe(false);
    }
  });

  /**
   * Area code 442 covers part of California, so a ten-digit number beginning
   * 44 is American. The dialling code is only read at a length no US number
   * reaches.
   */
  it('does not read a 442 area code as a country code', () => {
    expect(isUkPhone('(442) 555-0100')).toBe(false);
    expect(isUkPhone('4425550100')).toBe(false);
    expect(isUkPhone('1-442-555-0100')).toBe(false);
  });

  it('says nothing about a number that is not there', () => {
    for (const phone of ['', '   ', null, undefined, 'ask for Dave']) {
      expect(isUkPhone(phone), String(phone)).toBe(false);
    }
  });
});

describe('putting the two together', () => {
  /** Either signal is enough; neither is reliably present on its own. */
  it('catches a lead flagged by only one of them', () => {
    expect(isUkLead({ phone: '(212) 555-0100', country: 'United Kingdom' })).toBe(true);
    expect(isUkLead({ phone: '020 7946 0018', country: null })).toBe(true);
    expect(isUkLead({ phone: '020 7946 0018', country: 'United States' })).toBe(true);
  });

  it('leaves an American lead with neither', () => {
    expect(isUkLead({ phone: '(212) 555-0100', country: 'United States' })).toBe(false);
    expect(isUkLead({ phone: null, country: null })).toBe(false);
  });

  /** So a preview can say why, and be trusted enough to press the button. */
  it('says which signal flagged it', () => {
    expect(ukReason({ country: 'UK', phone: '(212) 555-0100' })).toBe('country');
    expect(ukReason({ country: null, phone: '020 7946 0018' })).toBe('phone');
    expect(ukReason({ country: 'US', phone: '(212) 555-0100' })).toBeNull();
  });
});

/**
 * What this deliberately will not do.
 *
 * An address, a company name and a `.co.uk` domain are all suggestive and
 * none of them is proof. The action taken on the answer is deletion, so the
 * bar is a fact on the record rather than an inference from one.
 */
describe('what it refuses to guess from', () => {
  it('does not delete a business for having a British-sounding name', () => {
    expect(isUkLead({ country: null, phone: '(212) 555-0100' })).toBe(false);
  });

  it('does not treat an empty country as a signal either way', () => {
    expect(isUkLead({ country: '', phone: '(212) 555-0100' })).toBe(false);
  });
});
