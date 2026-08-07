import { describe, expect, it } from 'vitest';
import { isUkLead } from '@/lib/uk-leads';

/**
 * The importer and the cleanup have to agree.
 *
 * British rows were cleared out of the book by hand once. Without a guard at
 * the door the next CSV puts them straight back — and a cleanup somebody has
 * to repeat after every import is a cleanup that stops happening.
 *
 * The rule is deliberately the same function the sweep uses, so a file can
 * never import what the cleanup would immediately remove. These cases are the
 * shapes an actual research CSV arrives in.
 */

/** How the import reads a row: exactly as written, before any normalising. */
const row = (over: Record<string, string>) => ({ phone: '', country: '', ...over });

describe('rows a CSV would bring back', () => {
  it('turns away a British number with no country column', () => {
    expect(isUkLead(row({ phone: '0161 496 0000' }))).toBe(true);
    expect(isUkLead(row({ phone: '+44 20 7946 0018' }))).toBe(true);
  });

  it('turns away a British country with a US-looking number', () => {
    expect(isUkLead(row({ phone: '(212) 555-0100', country: 'United Kingdom' }))).toBe(true);
  });

  it('lets an American row through untouched', () => {
    expect(isUkLead(row({ phone: '(212) 555-0100', country: 'United States' }))).toBe(false);
    expect(isUkLead(row({ phone: '336-555-0100' }))).toBe(false);
  });

  /**
   * Most rows carry neither. Treating an empty row as suspicious would throw
   * away the ordinary case, which is the whole file.
   */
  it('lets a row with neither field through', () => {
    expect(isUkLead(row({}))).toBe(false);
    expect(isUkLead(row({ country: '' }))).toBe(false);
  });

  /**
   * The importer judges the row as written and the sweep judges the stored
   * lead. If those two ever disagreed, a file would import rows the cleanup
   * panel would immediately offer to delete — which reads as the app fighting
   * itself.
   */
  it('agrees with the sweep on the same business either way round', () => {
    const written = row({ phone: '020 7946 0018', country: '' });
    const stored = { phone: '020 7946 0018', country: null };

    expect(isUkLead(written)).toBe(isUkLead(stored));
  });
});
