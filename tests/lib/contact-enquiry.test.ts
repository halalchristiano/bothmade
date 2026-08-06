import { describe, expect, it } from 'vitest';

/**
 * The enquiry form used to be a message box. Somebody typed a paragraph, it
 * landed in `notes`, and the lead opened on "Nothing to brief you on yet" —
 * because the brief reads structured pain points and a paragraph is not one.
 * Every inbound lead therefore needed the same research a cold lead needs,
 * despite the prospect having already said what was wrong.
 *
 * These cover the join that fixes it: the tick boxes emit the same keys the
 * research CSV imports, so an enquiry arrives already briefed.
 */

import {
  ENQUIRY_PROBLEMS,
  buildSalesNote,
  parseProblems,
  recommendedWork,
  toOptions,
} from '@/lib/contact-enquiry';
import { PAIN_POINTS, isPainPointKey } from '@/lib/leads';
import { ADD_ONS, PAIN_POINT_BRIEFS } from '@/lib/pricing';

describe('the questions', () => {
  /**
   * The whole feature. If a tick box ever emits something the brief cannot
   * read, an enquiry silently goes back to arriving unbriefed.
   */
  it('asks only in keys the brief already understands', () => {
    for (const problem of ENQUIRY_PROBLEMS) {
      expect(isPainPointKey(problem.key), `${problem.key} is not a pain point`).toBe(true);
      expect(PAIN_POINT_BRIEFS[problem.key], `${problem.key} has no brief`).toBeDefined();
    }
  });

  it('asks the visitor about their business, not the CRM about its schema', () => {
    for (const problem of ENQUIRY_PROBLEMS) {
      // "It is awkward or broken on a phone", not "not-mobile-friendly".
      expect(problem.ask).not.toBe(PAIN_POINTS[problem.key]);
      expect(problem.ask.length).toBeGreaterThan(12);
    }
  });

  it('offers every problem the system can price, so nothing is unaskable', () => {
    const asked = new Set(ENQUIRY_PROBLEMS.map((p) => p.key));
    for (const key of Object.keys(PAIN_POINTS)) {
      expect(asked, `${key} can be priced but never asked`).toContain(key);
    }
  });
});

describe('parseProblems', () => {
  it('keeps what was ticked, in the order it was asked', () => {
    expect(parseProblems(['poor-seo', 'not-mobile-friendly'])).toEqual([
      'not-mobile-friendly',
      'poor-seo',
    ]);
  });

  it('drops anything a hand-made POST invented', () => {
    expect(parseProblems(['poor-seo', 'constructor', 'free-money', 42, null])).toEqual(['poor-seo']);
    expect(parseProblems('poor-seo')).toEqual([]);
    expect(parseProblems(undefined)).toEqual([]);
  });

  it('counts a duplicate once', () => {
    expect(parseProblems(['poor-seo', 'poor-seo'])).toEqual(['poor-seo']);
  });
});

describe('recommendedWork', () => {
  it('turns what they ticked into what we would do', () => {
    const { needs, worthRaising } = recommendedWork(['poor-seo']);

    expect([...needs, ...worthRaising].length).toBeGreaterThan(0);
    for (const key of [...needs, ...worthRaising]) {
      expect(Object.hasOwn(ADD_ONS, key), `${key} is not in the catalogue`).toBe(true);
    }
  });

  /**
   * Two problems often want the same fix. A client reading the same line
   * twice assumes they are being charged for it twice.
   */
  it('says each thing once, however many problems asked for it', () => {
    const { needs, worthRaising } = recommendedWork(['poor-seo', 'no-analytics', 'outdated-design']);
    const all = [...needs, ...worthRaising];

    expect(new Set(all).size).toBe(all.length);
  });

  it('never lists something as optional when it is required', () => {
    const { needs, worthRaising } = recommendedWork(Object.keys(PAIN_POINTS) as never);

    for (const key of needs) expect(worthRaising).not.toContain(key);
  });

  it('recommends nothing when nothing was ticked', () => {
    expect(recommendedWork([])).toEqual({ needs: [], worthRaising: [] });
  });
});

describe('toOptions', () => {
  /**
   * The reply email names the work and deliberately carries no figures. A
   * number before a conversation is a number argued with instead of a
   * problem discussed.
   */
  it('carries the catalogue wording and no price at all', () => {
    const [option] = toOptions(['seo']);

    expect(option.label).toBe(ADD_ONS.seo.label);
    expect(option.benefit).toBe(ADD_ONS.seo.benefit);
    expect(JSON.stringify(option)).not.toMatch(/\$|\d{3,}/);
  });

  it('explains a label that is jargon, with something concrete', () => {
    const [crm] = toOptions(['crm-setup']);

    expect(crm.explain).toBeTruthy();
    expect(crm.explain).toContain('In practice:');
  });
});

describe('buildSalesNote', () => {
  it('leads with their own words, then what they ticked', () => {
    const note = buildSalesNote(['poor-seo'], 'We are invisible on Google.');

    expect(note.indexOf('In their words')).toBeLessThan(note.indexOf('Poor / no SEO'));
    expect(note).toContain('We are invisible on Google.');
  });

  it('still writes a usable note when they only ticked boxes', () => {
    const note = buildSalesNote(['no-booking', 'slow-site'], '');

    expect(note).not.toContain('In their words');
    expect(note).toContain('No online booking / scheduling');
    expect(note).toContain('Slow loading times');
  });

  it('stays empty when they said nothing, rather than inventing a note', () => {
    expect(buildSalesNote([], '   ')).toBe('');
  });
});
