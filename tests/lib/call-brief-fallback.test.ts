import { describe, expect, it } from 'vitest';
import { buildLeadBrief, type CallBriefLead } from '@/lib/call-brief';

/**
 * The brief, for a lead that came in on a research CSV.
 *
 * Every lead imported from one of those files carries a written verdict on
 * the business and usually an assessment of the site it has — and the brief
 * read neither of them. It only ever looked at the numbered painPointN
 * columns, which no import has ever filled in, so a thousand researched leads
 * produced a script with an opening line, a price, and nothing in between:
 * no reason to be calling. The rep opened Call HQ, found the section blank,
 * and went back to guessing.
 *
 * What is pinned below is the precedence. A point somebody wrote and priced
 * deliberately always wins; the imported one-liner is the fallback, never the
 * override.
 */

const lead = (over: Partial<CallBriefLead> = {}): CallBriefLead => ({
  company: 'Ridgeline Roofing',
  contactName: 'Dana',
  notes: null,
  customPainPoints: null,
  essentialPoints: null,
  upsellPoints: null,
  painPoints: '',
  estimateLowCents: 850000,
  estimateHighCents: 1600000,
  personalizedObservation: null,
  currentSiteAssessment: null,
  ...over,
});

const OBSERVATION = 'No pricing anywhere and the gallery is eleven phone photos';
const ASSESSMENT = 'One page, no mobile layout, last touched in 2019.';

/** The block the whole call turns on. */
const reasonToCall = (l: CallBriefLead) =>
  buildLeadBrief(l).script.find((b) => b.heading.startsWith("Why you're calling"));

describe('a lead with nothing but the imported research', () => {
  it('opens on the observation instead of skipping the reason for the call', () => {
    const block = reasonToCall(lead({ personalizedObservation: OBSERVATION }));

    expect(block).toBeDefined();
    expect(block!.lines.join(' ').toLowerCase()).toContain('no pricing anywhere');
  });

  it('puts the site assessment underneath it as the explanation', () => {
    const brief = buildLeadBrief(
      lead({ personalizedObservation: OBSERVATION, currentSiteAssessment: ASSESSMENT })
    );

    expect(brief.pains[0].point).toBe(OBSERVATION);
    expect(brief.pains[0].explanation).toBe(ASSESSMENT);
  });

  it('uses the assessment as the point when that is all there is', () => {
    const brief = buildLeadBrief(lead({ currentSiteAssessment: ASSESSMENT }));

    expect(brief.pains[0].point).toBe(ASSESSMENT);
    // Never printed twice — it is already the headline.
    expect(brief.pains[0].explanation).toBeNull();
  });

  it('still says nothing when there is genuinely nothing', () => {
    const brief = buildLeadBrief(lead());

    expect(brief.pains).toHaveLength(0);
    expect(reasonToCall(lead())).toBeUndefined();
  });
});

describe('what the observation must never do', () => {
  /** The rule the fallback rests on: it fills a gap, it does not compete. */
  it('gives way to a pain point somebody actually wrote', () => {
    const brief = buildLeadBrief(
      lead({
        personalizedObservation: OBSERVATION,
        customPainPoints: 'No online booking: they lose the evening enquiries entirely.',
      })
    );

    expect(brief.pains[0].point).toBe('No online booking');
    expect(brief.pains.map((p) => p.point)).not.toContain(OBSERVATION);
  });

  /**
   * A checklist tag carries a scripted pitch, which is worth more than
   * improvising off a sentence — but the sentence is about THIS business, so
   * it leads and the generic tags follow as the other things noticed.
   */
  it('leads, with the checklist tags kept underneath it', () => {
    const brief = buildLeadBrief(
      lead({ personalizedObservation: OBSERVATION, painPoints: 'no-booking,not-mobile-friendly' })
    );

    expect(brief.pains[0].point).toBe(OBSERVATION);
    expect(brief.pains.length).toBeGreaterThan(1);
  });

  it('does not disturb the price, which comes from its own columns', () => {
    const brief = buildLeadBrief(lead({ personalizedObservation: OBSERVATION }));

    expect(brief.low).toBe(850000);
    expect(brief.high).toBe(1600000);
  });

  it('is trimmed, so a stray column of spaces is not a pain point', () => {
    expect(buildLeadBrief(lead({ personalizedObservation: '   ' })).pains).toHaveLength(0);
  });
});
