import { describe, expect, it } from 'vitest';

/**
 * The form a client is emailed after enquiring, and what their answers become.
 *
 * Everything worth protecting here is a join: the radio values have to land in
 * the same columns the research CSV imports into, or a lead briefed by the
 * client and a lead briefed by a researcher stop being the same shape and the
 * brief, the pricing and the export need a second code path each.
 *
 * The other half is that this is a public, unauthenticated POST writing into
 * the note somebody reads before ringing a stranger — so anything not on the
 * list has to be dropped rather than stored.
 */

import {
  BRIEF_QUESTIONS,
  briefToLeadFields,
  isWorthRecording,
  parseBriefSubmission,
} from '@/lib/client-brief-form';
import { COMPANY_SIZE_BANDS } from '@/lib/lead-pricing';

describe('the questions', () => {
  it('is radio buttons, not typing — every question offers real choices', () => {
    for (const question of BRIEF_QUESTIONS) {
      expect(question.options.length, `${question.key} has too few options`).toBeGreaterThan(2);
      const values = question.options.map((o) => o.value);
      expect(new Set(values).size, `${question.key} repeats a value`).toBe(values.length);
    }
  });

  /**
   * The company-size answers are written straight to `Lead.companySize`, which
   * the CSV import and the export both read. A label that reads well but is
   * not one of these silently produces a lead the exporter cannot round-trip.
   */
  it('offers company sizes the CRM already stores', () => {
    const sizes = BRIEF_QUESTIONS.find((q) => q.key === 'companySize')!;

    for (const option of sizes.options) {
      expect(COMPANY_SIZE_BANDS, `${option.value} is not a size the pricing knows`).toContain(
        option.value
      );
    }
  });

  /**
   * No prices, anywhere. That is the promise the covering email makes about
   * this form — what something costs depends on these answers, and a figure
   * shown before that conversation is a figure argued with instead of a
   * problem discussed. (Headcounts are fine; a currency or a budget band is
   * not.)
   */
  it('never shows a price they could argue with', () => {
    const text = JSON.stringify(BRIEF_QUESTIONS);

    expect(text).not.toMatch(/[$£€]/);
    expect(text).not.toMatch(/\d\s*[km]\b/i);
    expect(text).not.toMatch(/budget|per month|cost us|\bfee\b/i);
  });

  it('asks in the client’s language — no keys, no column names', () => {
    for (const question of BRIEF_QUESTIONS) {
      expect(question.question).toMatch(/\?$/);
      for (const option of question.options) {
        expect(option.label.length).toBeGreaterThan(3);
      }
    }
  });
});

describe('parseBriefSubmission', () => {
  it('keeps answers that are on the list', () => {
    const parsed = parseBriefSubmission({
      problems: ['poor-seo', 'no-booking'],
      answers: { companySize: 'small', timing: 'Yesterday' },
      extra: '  We open a second branch in March.  ',
    });

    expect(parsed.problems).toEqual(['poor-seo', 'no-booking']);
    expect(parsed.answers).toEqual({ companySize: 'small', timing: 'Yesterday' });
    expect(parsed.extra).toBe('We open a second branch in March.');
  });

  /**
   * The brief is read aloud on a call. A stranger who can POST to this route
   * must not be able to put a sentence in it.
   */
  it('drops a value that was never offered', () => {
    const parsed = parseBriefSubmission({
      problems: ['poor-seo', 'free-money', 42, null],
      answers: { companySize: 'gigantic', timing: 'Yesterday', invented: 'x' },
    });

    expect(parsed.problems).toEqual(['poor-seo']);
    expect(parsed.answers).toEqual({ timing: 'Yesterday' });
  });

  it('survives a body that is not what it should be', () => {
    for (const body of [null, undefined, 'nope', 42, [], { answers: 'nope', problems: 'nope' }]) {
      const parsed = parseBriefSubmission(body);
      expect(parsed.problems).toEqual([]);
      expect(parsed.answers).toEqual({});
      expect(parsed.extra).toBe('');
    }
  });

  it('counts a duplicated tick once', () => {
    expect(parseBriefSubmission({ problems: ['poor-seo', 'poor-seo'] }).problems).toEqual([
      'poor-seo',
    ]);
  });

  it('caps the one free-text box, so a paste cannot fill the column', () => {
    expect(parseBriefSubmission({ extra: 'x'.repeat(50_000) }).extra.length).toBe(4000);
  });
});

describe('briefToLeadFields', () => {
  const full = parseBriefSubmission({
    problems: ['not-mobile-friendly'],
    answers: {
      priority: 'get-enquiries',
      companySize: 'small',
      industry: 'Trades & home services',
      authority: 'Me alone',
      timing: 'Yesterday',
      consequence: 'Losing work to competitors',
    },
    extra: 'Our competitor rebuilt theirs last year.',
  });

  it('fills the same columns a researcher would have filled', () => {
    const fields = briefToLeadFields(full);

    expect(fields.painPoints).toBe('not-mobile-friendly');
    expect(fields.companySize).toBe('small');
    expect(fields.industry).toBe('Trades & home services');
    expect(fields.qualAuthority).toBe('Me, on my own');
    expect(fields.qualTiming).toContain('Yesterday');
    expect(fields.qualNeed).toContain('losing work');
  });

  it('writes an assessment a rep can read without decoding anything', () => {
    const assessment = briefToLeadFields(full).currentSiteAssessment;

    // The pain point stated as a problem, not as its key.
    expect(assessment).toContain('Not mobile-friendly');
    expect(assessment).not.toContain('not-mobile-friendly');
    expect(assessment).toContain('Fix first:');
    expect(assessment).toContain('Our competitor rebuilt theirs last year.');
  });

  it('leaves a column alone rather than inventing a value for it', () => {
    const fields = briefToLeadFields(parseBriefSubmission({ problems: ['poor-seo'] }));

    expect(fields.companySize).toBeNull();
    expect(fields.industry).toBeNull();
    expect(fields.qualTiming).toBeNull();
    expect(fields.qualAuthority).toBeNull();
    expect(fields.qualNeed).toBeNull();
    expect(fields.qualMotivation).toBeNull();
  });

  it('stores the key, not the label, in the field the pricing reads', () => {
    expect(briefToLeadFields(full).painPoints.split(',')).toEqual(['not-mobile-friendly']);
  });
});

describe('isWorthRecording', () => {
  it('is true if they answered anything at all', () => {
    expect(isWorthRecording(parseBriefSubmission({ problems: ['poor-seo'] }))).toBe(true);
    expect(isWorthRecording(parseBriefSubmission({ answers: { timing: 'Yesterday' } }))).toBe(true);
    expect(isWorthRecording(parseBriefSubmission({ extra: 'call me' }))).toBe(true);
  });

  /** An empty submission must not stamp a reply on the lead and stop the follow-up. */
  it('is false for an empty form', () => {
    expect(isWorthRecording(parseBriefSubmission({}))).toBe(false);
    expect(isWorthRecording(parseBriefSubmission({ extra: '   ' }))).toBe(false);
  });
});
