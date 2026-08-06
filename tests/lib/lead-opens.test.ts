import { describe, expect, it } from 'vitest';
import {
  DISTINCT_OPEN_GAP_MS,
  MACHINE_OPEN_WINDOW_MS,
  SILENCE_CONCERNING_AFTER_MS,
  leadOpenPixelUrl,
  readOpens,
} from '@/lib/lead-opens';

/**
 * What the pixel is allowed to mean.
 *
 * The whole feature is a ranking: the leads at the top of Call HQ are chosen
 * by these bands, so an over-generous reading doesn't just mislabel a row, it
 * sends a rep to ring somebody whose mail server fetched an image. The tests
 * below pin the two claims that must never be made — that one open is a
 * reader, and that a fast open is a person — and the one that must always be
 * made: repeat opens go to the top, most-opened first.
 */

const SENT = new Date('2026-08-06T09:00:00.000Z');
const at = (ms: number) => new Date(SENT.getTime() + ms);
const NOW = at(3 * 60 * 60 * 1000);

const facts = (over: Partial<Parameters<typeof readOpens>[0]> = {}) => ({
  coldEmailSentAt: SENT,
  coldEmailOpens: 0,
  coldEmailOpenedAt: null,
  coldEmailLastOpenedAt: null,
  ...over,
});

describe('what a single open is worth', () => {
  it('does not call a fetch on delivery a reader', () => {
    const r = readOpens(
      facts({
        coldEmailOpens: 1,
        coldEmailOpenedAt: at(MACHINE_OPEN_WINDOW_MS - 1000),
        coldEmailLastOpenedAt: at(MACHINE_OPEN_WINDOW_MS - 1000),
      }),
      NOW
    );

    expect(r.band).toBe('delivered');
    expect(r.headline).not.toMatch(/read/i);
    expect(r.nextStep).toMatch(/mailbox/i);
  });

  it('still calls one slow open only an open', () => {
    const r = readOpens(
      facts({
        coldEmailOpens: 1,
        coldEmailOpenedAt: at(4 * 60 * 60 * 1000),
        coldEmailLastOpenedAt: at(4 * 60 * 60 * 1000),
      }),
      NOW
    );

    expect(r.band).toBe('delivered');
    expect(r.score).toBeLessThan(5);
  });

  /** The absence is the stronger signal, and it runs the other way. */
  it('treats a day of total silence as a probable non-delivery', () => {
    const early = readOpens(facts(), at(SILENCE_CONCERNING_AFTER_MS - 1000));
    expect(early.band).toBe('silent');
    expect(early.nextStep).toBeNull();

    const late = readOpens(facts(), at(SILENCE_CONCERNING_AFTER_MS + 1000));
    expect(late.band).toBe('silent');
    expect(late.nextStep).toMatch(/never landed/i);
  });

  it('says nothing at all about a lead nobody has emailed', () => {
    const r = readOpens(facts({ coldEmailSentAt: null, coldEmailOpens: 4 }), NOW);
    expect(r.band).toBe('silent');
    expect(r.opens).toBe(0);
    expect(r.score).toBe(0);
  });
});

describe('what repetition is worth', () => {
  it('promotes a lead that came back to it hours later', () => {
    const r = readOpens(
      facts({
        coldEmailOpens: 3,
        coldEmailOpenedAt: at(30 * 60 * 1000),
        coldEmailLastOpenedAt: at(2 * 60 * 60 * 1000),
      }),
      NOW
    );

    expect(r.band).toBe('hot');
    expect(r.headline).toContain('3 times');
    expect(r.nextStep).toMatch(/today/i);
  });

  /**
   * The discount that matters: a privacy proxy fetched on delivery and the
   * person opened it once. Two rows in the database, one reader — and it must
   * not outrank a lead a person opened twice.
   */
  it('discounts the automatic first open when banding', () => {
    const proxied = readOpens(
      facts({
        coldEmailOpens: 2,
        coldEmailOpenedAt: at(2000),
        coldEmailLastOpenedAt: at(2500),
      }),
      NOW
    );
    expect(proxied.band).toBe('delivered');

    const human = readOpens(
      facts({
        coldEmailOpens: 2,
        coldEmailOpenedAt: at(60 * 60 * 1000),
        coldEmailLastOpenedAt: at(61 * 60 * 1000),
      }),
      NOW
    );
    expect(human.band).toBe('engaged');
    expect(human.score).toBeGreaterThan(proxied.score);
  });

  it('does not count a scroll as a second read', () => {
    const r = readOpens(
      facts({
        coldEmailOpens: 2,
        coldEmailOpenedAt: at(60 * 60 * 1000),
        coldEmailLastOpenedAt: at(60 * 60 * 1000 + DISTINCT_OPEN_GAP_MS - 1000),
      }),
      NOW
    );
    // Two opens still qualify on count; what must not happen is the gap being
    // read as "came back to it" when it is one sitting.
    expect(r.headline).not.toMatch(/came back/i);
  });

  it('ranks more opens above fewer, which is what the queue sorts on', () => {
    const scoreFor = (opens: number) =>
      readOpens(
        facts({
          coldEmailOpens: opens,
          coldEmailOpenedAt: at(60 * 60 * 1000),
          coldEmailLastOpenedAt: at(20 * 60 * 60 * 1000),
        }),
        NOW
      ).score;

    expect(scoreFor(6)).toBeGreaterThan(scoreFor(3));
    expect(scoreFor(3)).toBeGreaterThan(scoreFor(2));
    // Every genuine reader outranks every mere delivery.
    expect(scoreFor(2)).toBeGreaterThan(
      readOpens(
        facts({ coldEmailOpens: 1, coldEmailOpenedAt: at(1000), coldEmailLastOpenedAt: at(1000) }),
        NOW
      ).score
    );
  });

  /** A mail client stuck in a loop is not the best lead in the book. */
  it('stops rewarding opens past the point of belief', () => {
    const many = readOpens(
      facts({
        coldEmailOpens: 400,
        coldEmailOpenedAt: at(60 * 60 * 1000),
        coldEmailLastOpenedAt: at(20 * 60 * 60 * 1000),
      }),
      NOW
    );
    const lots = readOpens(
      facts({
        coldEmailOpens: 12,
        coldEmailOpenedAt: at(60 * 60 * 1000),
        coldEmailLastOpenedAt: at(20 * 60 * 60 * 1000),
      }),
      NOW
    );

    expect(many.score).toBe(lots.score);
    // The real count is still reported — it is only the ranking that is capped.
    expect(many.opens).toBe(400);
  });
});

describe('the pixel address', () => {
  it('is short, and survives a trailing slash', () => {
    expect(leadOpenPixelUrl('https://bothmade.studio', 'lead_1')).toBe(
      'https://bothmade.studio/o/lead_1'
    );
    expect(leadOpenPixelUrl('https://bothmade.studio/', 'lead_1')).toBe(
      'https://bothmade.studio/o/lead_1'
    );
  });

  it('encodes an id that would otherwise change the path', () => {
    expect(leadOpenPixelUrl('https://x.dev', 'a/b?c')).toBe('https://x.dev/o/a%2Fb%3Fc');
  });
});
