import { describe, expect, it } from 'vitest';

/**
 * The glossary exists for the reader who does not already know the word, so
 * the failure that matters is silence: a brief or a brochure uses the term,
 * no definition appears, and nobody notices because nothing broke.
 *
 * Spelling it out was the gap. A brief written by a researcher says "CMS";
 * a brochure written for an accountant says "Content Management System". The
 * second reader is the one who needed the definition, and was the one not
 * getting it.
 */

import { findGlossaryTerms, SALES_GLOSSARY } from '@/lib/glossary';

const terms = (...texts: string[]) => findGlossaryTerms(...texts).map((entry) => entry.term);

describe('findGlossaryTerms', () => {
  it('explains the abbreviation and the words it stands for alike', () => {
    expect(terms('We will set up a CMS.')).toContain('CMS');
    expect(terms('A content management system is included.')).toContain('CMS');
    expect(terms('Customer relationship management, wired to the forms.')).toContain('CRM');
    expect(terms('Search engine optimization, done properly.')).toContain('SEO');
  });

  it('counts an abbreviation and its expansion as one idea, not two', () => {
    const found = terms('The CMS — a content management system — comes as standard.');

    expect(found.filter((term) => term === 'CMS')).toHaveLength(1);
  });

  it('still prefers the longer phrase when one contains the other', () => {
    const found = terms('Local SEO for the map results.');

    expect(found).toContain('local SEO');
    expect(found).not.toContain('SEO');
  });

  it('matches whole words only, so a plural has to be spelled out to count', () => {
    // "integration" does not match inside "integrations" — hence the alias.
    expect(terms('Third-party integrations with the tools you run on.')).toContain('integration');
    expect(terms('disintegration')).not.toContain('integration');
  });

  it('finds nothing in text that has no jargon in it', () => {
    expect(terms('We will call you on Tuesday.')).toEqual([]);
    expect(terms('   ')).toEqual([]);
  });

  it('gives every term something to say out loud, not just something to know', () => {
    for (const entry of SALES_GLOSSARY) {
      expect(entry.plain.length, `${entry.term} has no plain definition`).toBeGreaterThan(20);
      expect(entry.sayIt, `${entry.term} has nothing to say on a call`).toBeTruthy();
    }
  });

  it('keeps aliases distinct from each other, so one word cannot mean two things', () => {
    const seen = new Map<string, string>();
    for (const entry of SALES_GLOSSARY) {
      for (const form of [entry.term, ...(entry.aliases ?? [])]) {
        const key = form.toLowerCase();
        expect(seen.has(key), `"${form}" is claimed by both ${seen.get(key)} and ${entry.term}`).toBe(
          false
        );
        seen.set(key, entry.term);
      }
    }
  });
});
