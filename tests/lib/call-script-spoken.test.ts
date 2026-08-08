import { describe, expect, it } from 'vitest';
import { toSpokenLine } from '@/lib/call-script';

/**
 * The sentence a rep reads down the phone, out of a research note written
 * about the person they are talking to.
 *
 * lib/call-script had no tests, and this is the function that turns "CONTECH's
 * buyers must interpret a spec sheet" into "your buyers must interpret a spec
 * sheet". When it fails it does not fail quietly — the rep reads the note in
 * the third person, aloud, to the company it is about.
 *
 * It failed for any name ending in a full stop. The pattern was
 * `\b<name>\b`, and `\b` only asserts a boundary beside a word character, so
 * "Rigidized Metals Inc." could never match: nothing was substituted, and the
 * script said the company's own name back at its owner. Inc., Ltd., Co. and
 * LLC. are most of a B2B book.
 *
 * And it only ever looked for the registered name. A note says "Rigidized",
 * not "Rigidized Metals Inc.", so even the names that did match usually
 * weren't the ones written down.
 */

describe('a company name in the middle of a sentence', () => {
  it('becomes "you"', () => {
    expect(toSpokenLine('CONTECH needs a site that quotes.', 'CONTECH')).toBe(
      'you need a site that quotes.'
    );
  });

  it('becomes "your" in the possessive', () => {
    expect(toSpokenLine("CONTECH's buyers must interpret a spec sheet.", 'CONTECH')).toBe(
      'your buyers must interpret a spec sheet.'
    );
  });

  it('is still substituted when the name ends in a full stop', () => {
    // The one that was silently doing nothing.
    const line = toSpokenLine(
      'Rigidized Metals Inc. must interpret a spec sheet before they can quote.',
      'Rigidized Metals Inc.'
    );

    expect(line).not.toContain('Rigidized');
    expect(line).toContain('you must interpret');
  });

  it('handles the other suffixes that end in a stop', () => {
    for (const name of ['Acme Ltd.', 'Acme Co.', 'Acme LLC.', 'Acme Corp.']) {
      const line = toSpokenLine(`${name} needs a booking flow.`, name);
      expect(line, name).not.toContain('Acme');
    }
  });

  it('survives a name full of regex characters', () => {
    const line = toSpokenLine('Smith & Co. (Roofing) needs a site.', 'Smith & Co. (Roofing)');

    expect(line).not.toContain('Smith');
    expect(line).toContain('you need a site.');
  });
});

describe('the name a research note actually uses', () => {
  it('matches the trading name when the CRM holds the registered one', () => {
    // Nobody writes "Rigidized Metals Inc." in a note. They write this.
    const line = toSpokenLine('Rigidized Metals has no way to filter samples.', 'Rigidized Metals Inc.');

    expect(line).not.toContain('Rigidized');
    expect(line).toContain('you have no way to filter samples.');
  });

  it('matches a distinctive single word from the name', () => {
    const line = toSpokenLine("Rigidized's buyers cannot compare finishes.", 'Rigidized Metals Inc.');

    expect(line).toBe('your buyers cannot compare finishes.');
  });

  it('does not chase a short first word, which would eat the sentence', () => {
    // "The" or "A1" as a standalone match would rewrite half of any note.
    const line = toSpokenLine('The roof needs replacing before the winter.', 'The A1 Roofing Company');

    expect(line).toContain('roof needs replacing');
    expect(line).not.toContain('you roof');
  });

  it('replaces the longest form first, leaving no fragment behind', () => {
    const line = toSpokenLine('Rigidized Metals Inc. and Rigidized both appear.', 'Rigidized Metals Inc.');

    expect(line).not.toMatch(/Rigidized/i);
  });
});

describe('English that survives the substitution', () => {
  it('fixes the verb left conjugated for the third person', () => {
    expect(toSpokenLine('CONTECH needs, wants and requires a rebuild.', 'CONTECH')).toBe(
      'you need, wants and requires a rebuild.'
    );
  });

  it('fixes the auxiliaries', () => {
    expect(toSpokenLine('CONTECH is losing work.', 'CONTECH')).toBe('you are losing work.');
    expect(toSpokenLine('CONTECH has no booking form.', 'CONTECH')).toBe('you have no booking form.');
    expect(toSpokenLine("CONTECH doesn't answer enquiries.", 'CONTECH')).toBe(
      "you don't answer enquiries."
    );
  });

  it('turns third-person framings into second person', () => {
    expect(toSpokenLine('The current site loads slowly.', 'CONTECH')).toContain('your site');
    expect(toSpokenLine('Buyers cannot find a price.', 'CONTECH')).toBe(
      'your buyers cannot find a price.'
    );
  });

  it('never leaves a doubled "your your"', () => {
    expect(toSpokenLine("The company's buyers are lost.", 'CONTECH')).not.toContain('your your');
  });

  it('lowercases the opening, because it is spoken mid-sentence', () => {
    // Read as: "From what I could see, <this>"
    expect(toSpokenLine('Buyers cannot find a price.', 'CONTECH').charAt(0)).toBe('y');
  });

  it('says nothing at all about an empty note', () => {
    expect(toSpokenLine('', 'CONTECH')).toBe('');
  });

  it('is unbothered by a lead with no company name on file', () => {
    expect(toSpokenLine('Buyers cannot find a price.', '')).toBe('your buyers cannot find a price.');
  });
});
