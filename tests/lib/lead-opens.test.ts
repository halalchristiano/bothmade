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
 * The whole feature is a ranking. Every open puts a lead on the call sheet —
 * that argument is settled, and it is settled the generous way, because the
 * cost of ringing a business whose scanner fetched an image is one call you
 * were going to make anyway, and the cost of hiding a real reader is the best
 * moment you will ever get.
 *
 * What the bands decide is the ORDER, and what the wording must never do is
 * overclaim. The tests below pin both: repeat opens to the top, most-opened
 * first; and never the words "reading it" over a single fetch.
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
    expect(r.confirmedReader).toBe(false);
    // The wording is where the honesty lives, now that the sheet takes it.
    expect(r.headline).not.toMatch(/read/i);
    expect(r.nextStep).toMatch(/mail server/i);
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

/**
 * The line the call sheet hangs off.
 *
 * `callable` decides whether a lead is worth a dial at all, and it is drawn
 * generously on purpose: any open at all. Only total silence stays off the
 * sheet, because that is the case where there is genuinely nothing — no
 * evidence the message was ever delivered, and a dial into it is a dial into
 * an address that may not exist.
 */
describe('worth a call', () => {
  it('is false for silence — the one thing that is still off the sheet', () => {
    expect(readOpens(facts(), NOW).callable).toBe(false);
  });

  /**
   * This asserted the opposite until somebody pointed out what it costs.
   *
   * Ringing a business whose scanner opened the email is one call to a
   * business you were going to call anyway. Hiding a real reader loses the
   * best moment you will get. The second error is far more expensive, so a
   * single open goes on the sheet and the ranking sorts out how good it is.
   */
  it('is true for a fetch on delivery — an open is an open', () => {
    const r = readOpens(
      facts({ coldEmailOpens: 1, coldEmailOpenedAt: at(3000), coldEmailLastOpenedAt: at(3000) }),
      NOW
    );
    expect(r.callable).toBe(true);
    // On the sheet, but never claimed as a reader, and last in the band.
    expect(r.confirmedReader).toBe(false);
    expect(r.score).toBeLessThan(
      readOpens(
        facts({
          coldEmailOpens: 1,
          coldEmailOpenedAt: at(4 * 60 * 60 * 1000),
          coldEmailLastOpenedAt: at(4 * 60 * 60 * 1000),
        }),
        NOW
      ).score
    );
  });

  it('is true once a second fetch follows the prefetch', () => {
    const r = readOpens(
      facts({
        coldEmailOpens: 2,
        coldEmailOpenedAt: at(3000),
        coldEmailLastOpenedAt: at(2 * 60 * 60 * 1000),
      }),
      NOW
    );
    expect(r.callable).toBe(true);
  });

  it('is true for one open that arrives too late to be a machine', () => {
    const r = readOpens(
      facts({
        coldEmailOpens: 1,
        coldEmailOpenedAt: at(4 * 60 * 60 * 1000),
        coldEmailLastOpenedAt: at(4 * 60 * 60 * 1000),
      }),
      NOW
    );
    expect(r.callable).toBe(true);
  });

  it('is true for every band that puts a lead on the sheet', () => {
    for (const opens of [2, 3, 6]) {
      const r = readOpens(
        facts({
          coldEmailOpens: opens,
          coldEmailOpenedAt: at(60 * 60 * 1000),
          coldEmailLastOpenedAt: at(20 * 60 * 60 * 1000),
        }),
        NOW
      );
      expect(r.callable).toBe(true);
      expect(['engaged', 'hot']).toContain(r.band);
    }
  });

  it('is false for a lead nobody has emailed', () => {
    expect(readOpens(facts({ coldEmailSentAt: null }), NOW).callable).toBe(false);
  });
});

/**
 * The stricter line, and why there are two.
 *
 * `callable` answers "is this worth a dial", where a late single open is
 * cheap to act on and cheap to be wrong about. `confirmedReader` answers "may
 * we say the words 'is reading it' and send a notification saying them",
 * which a single open never earns however long after the send it lands — the
 * whole argument of this module is that repetition is the signal.
 *
 * These came apart in the wild: the alert fired on `callable` and sent three
 * notifications in one evening, all reading "opened once", all mail scanners.
 */
describe('confirmed reader', () => {
  const single = (delayMs: number) =>
    readOpens(
      facts({ coldEmailOpens: 1, coldEmailOpenedAt: at(delayMs), coldEmailLastOpenedAt: at(delayMs) }),
      at(delayMs + 60 * 60 * 1000)
    );

  it('is false for one open, at machine speed or hours later', () => {
    for (const delay of [1000, 5 * 60 * 1000, 4 * 60 * 60 * 1000, 30 * 60 * 60 * 1000]) {
      expect(single(delay).confirmedReader, `${delay}ms`).toBe(false);
    }
  });

  it('is stricter than callable, never looser', () => {
    const late = single(4 * 60 * 60 * 1000);
    expect(late.callable).toBe(true);
    expect(late.confirmedReader).toBe(false);
  });

  it('is true exactly for the bands the call sheet calls opened', () => {
    for (const opens of [2, 3, 6]) {
      const r = readOpens(
        facts({
          coldEmailOpens: opens,
          coldEmailOpenedAt: at(60 * 60 * 1000),
          coldEmailLastOpenedAt: at(20 * 60 * 60 * 1000),
        }),
        NOW
      );
      expect(['engaged', 'hot']).toContain(r.band);
      expect(r.confirmedReader).toBe(true);
    }
  });

  it('is false for silence and for a lead nobody emailed', () => {
    expect(readOpens(facts(), NOW).confirmedReader).toBe(false);
    expect(readOpens(facts({ coldEmailSentAt: null }), NOW).confirmedReader).toBe(false);
  });

  /** A prefetch on delivery plus one real open is a reader, and must alert. */
  it('is true once a second fetch follows the delivery prefetch', () => {
    const r = readOpens(
      facts({
        coldEmailOpens: 2,
        coldEmailOpenedAt: at(30 * 1000),
        coldEmailLastOpenedAt: at(4 * 60 * 60 * 1000),
      }),
      NOW
    );
    expect(r.confirmedReader).toBe(true);
  });
});

/**
 * Ninety seconds was measured from the send, and the scanner fetches on
 * delivery — so a queued send meant every scanner read as a person.
 */
describe('how long an open still looks like the delivery', () => {
  it('reads a send that sat in a queue for five minutes as the delivery', () => {
    const r = readOpens(
      facts({
        coldEmailOpens: 1,
        coldEmailOpenedAt: at(5 * 60 * 1000),
        coldEmailLastOpenedAt: at(5 * 60 * 1000),
      }),
      NOW
    );
    // Still on the sheet — what the window changes is the wording and the
    // ranking, not whether anybody gets to see the lead.
    expect(r.callable).toBe(true);
    expect(r.headline).toMatch(/on arrival/i);
    expect(r.score).toBe(1);
  });

  it('ranks a genuinely later single open above the delivery fetch', () => {
    const r = readOpens(
      facts({
        coldEmailOpens: 1,
        coldEmailOpenedAt: at(45 * 60 * 1000),
        coldEmailLastOpenedAt: at(45 * 60 * 1000),
      }),
      NOW
    );
    expect(r.callable).toBe(true);
    expect(r.confirmedReader).toBe(false);
    expect(r.headline).not.toMatch(/on arrival/i);
    expect(r.score).toBe(3);
  });
});
