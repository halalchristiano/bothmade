import { describe, expect, it } from 'vitest';
import {
  ACTIVE_LEAD_STATUSES,
  LEAD_ACTIVITY_SEEN_BY_LEAD,
  LEAD_ACTIVITY_TYPES,
  LEAD_STATUSES,
  LEAD_STATUS_COLORS,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_SHORT_LABELS,
  PAIN_POINTS,
  QUICK_ADD_STATUSES,
  advanceToContactedOnOutreach,
  buildFallbackColdEmailDraft,
  isFurtherAlong,
  leadActivityIsInternal,
  isLeadActivityType,
  isLeadStatus,
  isPainPointKey,
  painPointSentence,
  parseSalesPoints,
  formatSalesPoints,
} from '@/lib/leads';

/**
 * The lead pipeline is the sales side of the money path: a stage that moves
 * backwards, or a won deal that gets quietly re-opened by a routine email,
 * is a deal someone stops chasing.
 */

describe('isFurtherAlong', () => {
  it('is true only when the target is later in the pipeline', () => {
    expect(isFurtherAlong('new', 'contacted')).toBe(true);
    expect(isFurtherAlong('contacted', 'new')).toBe(false);
    expect(isFurtherAlong('qualified', 'qualified')).toBe(false);
  });

  it('never re-opens a closed deal', () => {
    // Generating a contract for a won lead must not drag it back to
    // "contract sent", and a lost lead stays lost.
    expect(isFurtherAlong('won', 'contract_sent')).toBe(false);
    expect(isFurtherAlong('lost', 'contract_sent')).toBe(false);
    expect(isFurtherAlong('won', 'lost')).toBe(false);
  });

  it('treats an unrecognised current status as behind everything', () => {
    // indexOf returns -1, so any real target is "further along" — the safe
    // direction, since the alternative is silently refusing to advance.
    expect(isFurtherAlong('garbage', 'contacted')).toBe(true);
  });

  it('can advance to won from any active stage', () => {
    for (const status of ACTIVE_LEAD_STATUSES) {
      expect(isFurtherAlong(status, 'won'), status).toBe(true);
    }
  });
});

describe('advanceToContactedOnOutreach', () => {
  it('moves an untouched lead to contacted when outreach goes out', () => {
    expect(advanceToContactedOnOutreach('new')).toBe('contacted');
    expect(advanceToContactedOnOutreach('researched')).toBe('contacted');
  });

  it('never drags a further-along lead backwards', () => {
    for (const status of ['replied', 'qualified', 'proposal_sent', 'won', 'lost']) {
      expect(advanceToContactedOnOutreach(status), status).toBe(status);
    }
  });
});

describe('painPointSentence', () => {
  it('returns null when nothing is tagged', () => {
    expect(painPointSentence('')).toBeNull();
    expect(painPointSentence('not-a-real-key')).toBeNull();
  });

  it('reads as one clause for a single point', () => {
    expect(painPointSentence('slow-site')).toBe('slow loading times');
  });

  it('joins two with "and", and three with an Oxford comma', () => {
    expect(painPointSentence('slow-site,poor-seo')).toBe('slow loading times and poor / no seo');
    expect(painPointSentence('slow-site,poor-seo,no-app')).toBe(
      'slow loading times, poor / no seo, and no mobile app'
    );
  });

  it('tolerates whitespace and skips unknown keys', () => {
    expect(painPointSentence(' slow-site , nonsense , no-app ')).toBe(
      'slow loading times and no mobile app'
    );
  });
});

describe('buildFallbackColdEmailDraft', () => {
  const base = { company: 'Linpotia Cafe', painPoints: '', personalizedObservation: null };

  it('always produces a parseable Subject line', () => {
    expect(buildFallbackColdEmailDraft(base).startsWith('Subject: Thoughts on Linpotia Cafe')).toBe(true);
  });

  it('leaves the personalization tokens for send time to resolve', () => {
    const draft = buildFallbackColdEmailDraft(base);
    expect(draft).toContain('[First Name]');
    expect(draft).toContain('[Sender Name]');
  });

  it('prefers a hand-written observation over the pain-point list', () => {
    const draft = buildFallbackColdEmailDraft({
      ...base,
      painPoints: 'slow-site',
      personalizedObservation: 'your booking form 404s on mobile',
    });

    expect(draft).toContain('your booking form 404s on mobile');
    expect(draft).not.toContain('slow loading times');
  });

  it('falls back to the pain points when there is no observation', () => {
    const draft = buildFallbackColdEmailDraft({ ...base, painPoints: 'slow-site,poor-seo' });
    expect(draft).toContain('slow loading times and poor / no seo');
  });

  it('still writes a usable email with no personalization at all', () => {
    const draft = buildFallbackColdEmailDraft(base);
    expect(draft).toContain('Linpotia Cafe');
    expect(draft).not.toContain('undefined');
    expect(draft).not.toContain('null');
  });
});

describe('parseSalesPoints', () => {
  const unpriced = { priceCents: null, isCustom: false };

  it('splits on the first colon only', () => {
    expect(parseSalesPoints('Booking: they lose bookings after 6pm: nobody answers')).toEqual([
      { point: 'Booking', explanation: 'they lose bookings after 6pm: nobody answers', ...unpriced },
    ]);
  });

  it('keeps a colonless line as a point with no explanation', () => {
    expect(parseSalesPoints('No online booking')).toEqual([
      { point: 'No online booking', explanation: null, ...unpriced },
    ]);
  });

  it('recovers from a leading colon rather than emitting an empty point', () => {
    expect(parseSalesPoints(': the whole line is really the point')).toEqual([
      { point: 'the whole line is really the point', explanation: null, ...unpriced },
    ]);
  });

  it('drops blank lines and trims the rest', () => {
    expect(parseSalesPoints('  A: one  \n\n  B: two  ')).toEqual([
      { point: 'A', explanation: 'one', ...unpriced },
      { point: 'B', explanation: 'two', ...unpriced },
    ]);
  });

  it('returns nothing for empty input', () => {
    expect(parseSalesPoints(null)).toEqual([]);
    expect(parseSalesPoints(undefined)).toEqual([]);
    expect(parseSalesPoints('')).toEqual([]);
  });

  // The price is what a rep reads out; getting it off the line and out of the
  // explanation is the difference between quoting $900 and quoting "$900".
  it('reads a trailing price off the line without swallowing the explanation', () => {
    expect(parseSalesPoints('Booking: they lose the after-hours calls | $900')).toEqual([
      {
        point: 'Booking',
        explanation: 'they lose the after-hours calls',
        priceCents: 90000,
        isCustom: false,
      },
    ]);
  });

  it('marks a price as custom when the line says so', () => {
    expect(parseSalesPoints('Drone photography: nobody local offers it | custom $1,500')).toEqual([
      {
        point: 'Drone photography',
        explanation: 'nobody local offers it',
        priceCents: 150000,
        isCustom: true,
      },
    ]);
  });

  it('leaves a pipe that is not a price alone', () => {
    const [point] = parseSalesPoints('Hours: open Mon | Wed | Fri');
    expect(point.priceCents).toBeNull();
    expect(point.explanation).toBe('open Mon | Wed | Fri');
  });

  it('round-trips through formatSalesPoints', () => {
    const source = 'Booking: after-hours calls | $900\nDrone: nobody offers it | custom $1,500';
    expect(formatSalesPoints(parseSalesPoints(source))).toBe(source);
  });

  it('formats a point with no price as a plain line', () => {
    expect(formatSalesPoints(parseSalesPoints('No online booking'))).toBe('No online booking');
  });
});

describe('status vocabulary', () => {
  it('labels, short labels and colors cover every status', () => {
    for (const status of LEAD_STATUSES) {
      expect(LEAD_STATUS_LABELS[status], status).toBeTruthy();
      expect(LEAD_STATUS_SHORT_LABELS[status], status).toBeTruthy();
      expect(LEAD_STATUS_COLORS[status], status).toBeTruthy();
    }
  });

  it('excludes the terminal states from the active pipeline', () => {
    expect(ACTIVE_LEAD_STATUSES).not.toContain('won');
    expect(ACTIVE_LEAD_STATUSES).not.toContain('lost');
    expect(ACTIVE_LEAD_STATUSES).toHaveLength(LEAD_STATUSES.length - 2);
  });

  it('offers only early stages when quick-adding', () => {
    const deepStages = LEAD_STATUSES.indexOf('discovery_scheduled');
    for (const status of QUICK_ADD_STATUSES) {
      expect(LEAD_STATUSES.indexOf(status), status).toBeLessThan(deepStages);
    }
  });
});

describe('type guards', () => {
  it('accepts real values', () => {
    expect(isLeadStatus('qualified')).toBe(true);
    expect(isLeadActivityType('call')).toBe(true);
    expect(isPainPointKey('slow-site')).toBe(true);
  });

  it('rejects made-up values and prototype properties', () => {
    expect(isLeadStatus('extremely_qualified')).toBe(false);
    expect(isLeadActivityType('telepathy')).toBe(false);
    expect(isPainPointKey('not-a-pain')).toBe(false);
    expect(isPainPointKey('toString')).toBe(false);
    expect(isPainPointKey('constructor')).toBe(false);
  });

  it('labels every pain point it claims to know', () => {
    for (const [key, label] of Object.entries(PAIN_POINTS)) {
      expect(isPainPointKey(key)).toBe(true);
      expect(label).toBeTruthy();
    }
  });
});

describe('leadActivityIsInternal', () => {
  // The question is not "does the lead know this happened" but "could I read
  // this text out to them". A call log is our summary of what they said, in
  // our words — so it is internal even though they were on the call.
  it('treats our own write-ups as internal', () => {
    expect(leadActivityIsInternal('note')).toBe(true);
    expect(leadActivityIsInternal('call')).toBe(true);
    expect(leadActivityIsInternal('objection')).toBe(true);
  });

  it('treats what was actually sent to them as theirs', () => {
    expect(leadActivityIsInternal('email')).toBe(false);
    expect(leadActivityIsInternal('proposal')).toBe(false);
    expect(leadActivityIsInternal('loom')).toBe(false);
  });

  // Erring this way hides something on a screen only we can see. Erring the
  // other way is how a private note gets quoted back to a customer.
  it('calls an unrecognised type internal rather than guessing', () => {
    expect(leadActivityIsInternal('whatever')).toBe(true);
    expect(leadActivityIsInternal('')).toBe(true);
  });

  it('covers every activity type, so a new one cannot default silently', () => {
    for (const type of LEAD_ACTIVITY_TYPES) {
      expect(typeof LEAD_ACTIVITY_SEEN_BY_LEAD[type]).toBe('boolean');
    }
  });
});
