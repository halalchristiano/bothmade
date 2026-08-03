import { describe, expect, it } from 'vitest';
import {
  advanceToContactedOnOutreach,
  isFurtherAlong,
  parseSalesPoints,
  painPointSentence,
} from '@/lib/leads';

describe('pipeline ordering', () => {
  it('never moves a lead backwards', () => {
    expect(isFurtherAlong('proposal_sent', 'contacted')).toBe(false);
    expect(isFurtherAlong('new', 'contract_sent')).toBe(true);
  });
  it('terminal states never advance', () => {
    expect(isFurtherAlong('won', 'contract_sent')).toBe(false);
    expect(isFurtherAlong('lost', 'contacted')).toBe(false);
  });
  it('outreach bumps only early stages', () => {
    expect(advanceToContactedOnOutreach('new')).toBe('contacted');
    expect(advanceToContactedOnOutreach('qualified')).toBe('qualified');
  });
});

describe('parseSalesPoints', () => {
  it('splits on the first colon only', () => {
    const [p] = parseSalesPoints('Booking: they lose bookings after 6pm: phone unanswered');
    expect(p.point).toBe('Booking');
    expect(p.explanation).toContain('6pm: phone unanswered');
  });
  it('keeps a colon-less line as a bare point', () => {
    expect(parseSalesPoints('Just a point')[0]).toEqual({ point: 'Just a point', explanation: null });
  });
});

describe('painPointSentence', () => {
  it('joins naturally and ignores unknown keys', () => {
    expect(painPointSentence('slow-site,not-mobile-friendly,made-up-key')).toMatch(/ and /);
    expect(painPointSentence('made-up-key')).toBeNull();
  });
});
