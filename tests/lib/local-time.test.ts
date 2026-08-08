import { describe, expect, it } from 'vitest';
import { leadLocalTime } from '@/lib/local-time';

/**
 * Ringing a US lead at 4am their time burns them permanently, so the
 * callability window is worth pinning down. Every case fixes `now` — a test
 * that reads the wall clock passes all afternoon and fails overnight.
 */

/** 2026-03-10T15:00:00Z — 11:00 in New York, 08:00 in Los Angeles. */
const NOON_UTC = new Date('2026-03-10T15:00:00Z');

describe('leadLocalTime', () => {
  it('says nothing when there is no number to go on', () => {
    expect(leadLocalTime(null, NOON_UTC)).toBeNull();
    expect(leadLocalTime('', NOON_UTC)).toBeNull();
    expect(leadLocalTime('12345', NOON_UTC)).toBeNull();
  });

  it('places a US number by its area code', () => {
    const ny = leadLocalTime('(212) 555-0100', NOON_UTC);
    expect(ny?.zone).toBe('America/New_York');
    expect(ny?.hour).toBe(11);
  });

  it('reads through +1 and any punctuation', () => {
    const plain = leadLocalTime('2125550100', NOON_UTC);
    const dressed = leadLocalTime('+1 (212) 555-0100', NOON_UTC);
    expect(dressed?.zone).toBe(plain?.zone);
    expect(dressed?.hour).toBe(plain?.hour);
  });

  it('puts the west coast three hours behind the east', () => {
    const east = leadLocalTime('2125550100', NOON_UTC);
    const west = leadLocalTime('4155550100', NOON_UTC);
    expect(east!.hour - west!.hour).toBe(3);
  });

  it('refuses to guess where a toll-free number is', () => {
    const tollFree = leadLocalTime('8005550100', NOON_UTC);
    expect(tollFree?.zone).toBeNull();
    expect(tollFree?.callability).toBe('okay');
    expect(tollFree?.advice).toMatch(/toll-free/i);
  });

  it('says nothing at all for an unrecognised area code', () => {
    expect(leadLocalTime('9995550100', NOON_UTC)).toBeNull();
  });

  it('places UK and Irish numbers by country code', () => {
    expect(leadLocalTime('+44 20 7946 0000', NOON_UTC)?.zone).toBe('Europe/London');
    expect(leadLocalTime('+353 1 234 5678', NOON_UTC)?.zone).toBe('Europe/Dublin');
  });

  it('rates mid-morning and early afternoon as the windows to ring', () => {
    // 14:00 UTC is 10:00 in New York.
    expect(leadLocalTime('2125550100', new Date('2026-03-10T14:00:00Z'))?.callability).toBe('good');
    // 18:00 UTC is 14:00 in New York.
    expect(leadLocalTime('2125550100', new Date('2026-03-10T18:00:00Z'))?.callability).toBe('good');
  });

  it('rates the middle of the night as a wasted call', () => {
    // 08:00 UTC is 04:00 in New York.
    const night = leadLocalTime('2125550100', new Date('2026-03-10T08:00:00Z'));
    expect(night?.callability).toBe('bad');
    expect(night?.advice).toMatch(/too early/i);
  });

  it('rates late evening as a wasted call too', () => {
    // 03:00 UTC is 22:00 the previous day in New York.
    const late = leadLocalTime('2125550100', new Date('2026-03-11T03:00:00Z'));
    expect(late?.callability).toBe('bad');
    expect(late?.advice).toMatch(/too late/i);
  });

  it('rates the lunch hour and the end of the day as merely workable', () => {
    // March 10 is already EDT (UTC-4): 16:00 UTC is 12:00 (lunch),
    // 20:00 UTC is 16:00 (winding down).
    expect(leadLocalTime('2125550100', new Date('2026-03-10T16:00:00Z'))?.callability).toBe('okay');
    expect(leadLocalTime('2125550100', new Date('2026-03-10T20:00:00Z'))?.callability).toBe('okay');
  });

  it('always returns a printable time alongside the hour', () => {
    const result = leadLocalTime('2125550100', NOON_UTC);
    expect(result?.time).toMatch(/^\d{1,2}:\d{2}\s?(AM|PM)$/i);
    expect(result?.advice).toBeTruthy();
  });

  it('keeps Arizona off daylight saving', () => {
    // Mid-July, when Phoenix (no DST) and Denver (MDT) diverge.
    const july = new Date('2026-07-15T18:00:00Z');
    const phoenix = leadLocalTime('6025550100', july);
    const denver = leadLocalTime('3035550100', july);

    expect(phoenix?.zone).toBe('America/Phoenix');
    expect(denver?.zone).toBe('America/Denver');
    expect(phoenix?.hour).toBe(11);
    expect(denver?.hour).toBe(12);
  });
});

/**
 * The edges of the window, which is where the window actually is.
 *
 * The cases above each pick an hour comfortably inside a band — 10:00 for
 * "good", 04:00 for "bad", 12:00 for "workable" — and every one of them keeps
 * passing while the boundaries move. Two mutations proved it: widening the
 * mid-morning window from 11:00 to 12:00, and dropping the start of the
 * working day from 08:00 to 06:00 so the queue would tell a rep it is fine to
 * ring a business at six in the morning. Neither failed a single test.
 *
 * This is the one number on a call row a rep acts on without checking, and
 * the comment at the top of this file says why: ringing a US lead at 4am
 * burns them permanently. A band that can silently grow by two hours in
 * either direction is not pinned down.
 *
 * New York, on a date well inside US daylight saving, so each UTC hour maps
 * to exactly one local hour.
 */
describe('the edges of the callable day', () => {
  const NY = '2125550100';
  /** 2026-03-10 is EDT, UTC-4 — so local hour h is (h + 4):00 UTC. */
  const atLocalHour = (h: number) =>
    leadLocalTime(NY, new Date(`2026-03-10T${String(h + 4).padStart(2, '0')}:30:00Z`));

  it('maps the fixture hours the way this test assumes', () => {
    for (const h of [7, 8, 9, 10, 12, 13, 15, 16, 17, 18, 19]) {
      expect(atLocalHour(h)?.hour, `local ${h}:30`).toBe(h);
    }
  });

  it('will not call it workable before 8am', () => {
    expect(atLocalHour(7)?.callability).toBe('bad');
    expect(atLocalHour(7)?.advice).toMatch(/too early/i);
    expect(atLocalHour(8)?.callability).toBe('okay');
  });

  it('opens the mid-morning window at 9 and closes it at 11', () => {
    expect(atLocalHour(8)?.callability).toBe('okay');
    expect(atLocalHour(9)?.callability).toBe('good');
    expect(atLocalHour(10)?.callability).toBe('good');
    expect(atLocalHour(11)?.callability).toBe('okay');
  });

  it('opens the afternoon window at 1 and closes it at 4', () => {
    expect(atLocalHour(12)?.callability).toBe('okay');
    expect(atLocalHour(13)?.callability).toBe('good');
    expect(atLocalHour(15)?.callability).toBe('good');
    expect(atLocalHour(16)?.callability).toBe('okay');
  });

  /**
   * 17:00 stays workable but stops being about an office — the row says so,
   * and a rep reads the sentence rather than the colour.
   */
  it('hands 5pm over to the trades, and gives up at 7', () => {
    expect(atLocalHour(16)?.advice).toMatch(/winding down/i);
    expect(atLocalHour(17)?.callability).toBe('okay');
    expect(atLocalHour(17)?.advice).toMatch(/trade/i);
    expect(atLocalHour(18)?.callability).toBe('okay');
    expect(atLocalHour(19)?.callability).toBe('bad');
    expect(atLocalHour(19)?.advice).toMatch(/too late/i);
  });

  it('names the reason it is only workable, band by band', () => {
    expect(atLocalHour(8)?.advice).toMatch(/only just be in/i);
    expect(atLocalHour(12)?.advice).toMatch(/lunch/i);
    expect(atLocalHour(16)?.advice).toMatch(/winding down/i);
  });
});
