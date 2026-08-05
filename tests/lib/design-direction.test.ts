import { describe, expect, it } from 'vitest';
import {
  DIRECTION_STATEMENT,
  MAX_ADJECTIVES,
  MAX_REFERENCES,
  MIN_REFERENCES,
  directionStatus,
  normalizeReferenceUrl,
  readDirectionDraft,
} from '@/lib/design-direction';

const ok = (over: Record<string, unknown> = {}) => ({
  likes: [
    { url: 'stripe.com', why: 'Clean, and the type is doing all the work' },
    { url: 'https://linear.app', why: 'How calm it feels' },
  ],
  dislikes: [{ url: 'example.com', why: 'Too busy' }],
  adjectives: ['calm', 'professional', 'warm'],
  untouchable: 'Our logo and the green',
  hardNos: 'No stock photography of people shaking hands',
  ...over,
});

describe('readDirectionDraft', () => {
  it('accepts a complete brief', () => {
    const r = readDirectionDraft(ok());
    expect(r.ok).toBe(true);
    expect(r.draft!.likes).toHaveLength(2);
    expect(r.draft!.adjectives).toEqual(['calm', 'professional', 'warm']);
    expect(r.draft!.untouchable).toBe('Our logo and the green');
  });

  it('insists on more than one reference — one is indistinguishable from a first click', () => {
    const r = readDirectionDraft(ok({ likes: [{ url: 'stripe.com', why: 'clean' }] }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/at least 2 sites/i);
  });

  it('insists on the reason, which is the half we design from', () => {
    const r = readDirectionDraft(
      ok({ likes: [{ url: 'a.com', why: 'clean' }, { url: 'b.com', why: '  ' }] })
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/what you like about each/i);
  });

  it('insists on all three words — they settle it when references disagree', () => {
    expect(readDirectionDraft(ok({ adjectives: ['calm', 'bold'] })).ok).toBe(false);
    expect(readDirectionDraft(ok({ adjectives: [] })).ok).toBe(false);
  });

  it('caps the references rather than refusing a long list', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ url: `s${i}.com`, why: 'nice' }));
    const r = readDirectionDraft(ok({ likes: many, dislikes: many }));
    expect(r.ok).toBe(true);
    expect(r.draft!.likes).toHaveLength(MAX_REFERENCES);
    expect(r.draft!.dislikes).toHaveLength(MAX_REFERENCES);
  });

  it('caps the words at three', () => {
    const r = readDirectionDraft(ok({ adjectives: ['a', 'b', 'c', 'd', 'e'] }));
    expect(r.draft!.adjectives).toHaveLength(MAX_ADJECTIVES);
  });

  it('drops empty rows instead of losing the whole brief', () => {
    const r = readDirectionDraft(
      ok({ dislikes: [{ url: '', why: '' }, null, 'junk', { url: 'x.com', why: 'loud' }] })
    );
    expect(r.ok).toBe(true);
    expect(r.draft!.dislikes).toHaveLength(1);
  });

  it('treats the optional fields as optional', () => {
    const r = readDirectionDraft(ok({ untouchable: '  ', hardNos: undefined, notes: null }));
    expect(r.ok).toBe(true);
    expect(r.draft!.untouchable).toBeNull();
    expect(r.draft!.hardNos).toBeNull();
  });

  it('refuses junk', () => {
    expect(readDirectionDraft(null).ok).toBe(false);
    expect(readDirectionDraft('nope').ok).toBe(false);
    expect(readDirectionDraft({}).ok).toBe(false);
  });

  it('bounds the long fields', () => {
    const r = readDirectionDraft(
      ok({ untouchable: 'x'.repeat(9000), notes: 'y'.repeat(9000) })
    );
    expect(r.draft!.untouchable!.length).toBeLessThanOrEqual(2000);
    expect(r.draft!.notes!.length).toBeLessThanOrEqual(2000);
  });
});

describe('normalizeReferenceUrl', () => {
  it('leaves a real URL alone', () => {
    expect(normalizeReferenceUrl('https://stripe.com/pricing')).toBe('https://stripe.com/pricing');
  });

  it('makes a bare domain openable — that is what people type', () => {
    expect(normalizeReferenceUrl('stripe.com')).toBe('https://stripe.com');
    expect(normalizeReferenceUrl('  linear.app/method ')).toBe('https://linear.app/method');
  });

  it('keeps something that was never a link, rather than losing the answer', () => {
    expect(normalizeReferenceUrl('the brochure you sent me')).toBe('the brochure you sent me');
  });

  it('handles empty input', () => {
    expect(normalizeReferenceUrl('   ')).toBe('');
  });
});

describe('directionStatus', () => {
  it('warns loudly when there is nothing on file, and says what it costs', () => {
    const s = directionStatus(null);
    expect(s.exists).toBe(false);
    expect(s.signed).toBe(false);
    expect(s.warning).toMatch(/present anyway/i);
    expect(s.warning).toMatch(/revision rounds/i);
  });

  it('warns differently when it is sent but unsigned', () => {
    const s = directionStatus({ signedAt: null });
    expect(s.exists).toBe(true);
    expect(s.signed).toBe(false);
    expect(s.warning).toMatch(/haven't signed/i);
  });

  it('goes quiet once it is signed', () => {
    const s = directionStatus({ signedAt: new Date() });
    expect(s.signed).toBe(true);
    expect(s.warning).toBeNull();
  });
});

describe('the signing statement', () => {
  it('names the consequence in both directions', () => {
    // A signature is only worth having if the signer understood what it
    // bought them. It buys the client free correction of a departure; it
    // buys the studio a revision round for a change of mind.
    expect(DIRECTION_STATEMENT).toMatch(/no charge/i);
    expect(DIRECTION_STATEMENT).toMatch(/change my mind/i);
    expect(DIRECTION_STATEMENT).toMatch(/revision rounds/i);
    expect(DIRECTION_STATEMENT).toMatch(/electronic signature/i);
  });

  it('is a constant, not built from anything the browser can influence', () => {
    expect(typeof DIRECTION_STATEMENT).toBe('string');
    expect(MIN_REFERENCES).toBe(2);
  });
});
