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
