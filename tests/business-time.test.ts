import { describe, expect, it } from 'vitest';
import { startOfBusinessDay, startOfBusinessMonth } from '@/lib/business-time';

// The bug these guard: period boundaries were computed in the server's zone
// (UTC on Vercel), so at UTC-5 "today" began at 7pm the previous evening.
describe('business-time across zones and DST', () => {
  const NY = 'America/New_York';
  const LDN = 'Europe/London';

  it('7:30pm Jan 31 in New York is still January', () => {
    const instant = new Date('2026-02-01T00:30:00Z'); // Jan 31, 7:30pm EST
    expect(startOfBusinessMonth(instant, NY).toISOString()).toBe('2026-01-01T05:00:00.000Z');
    expect(startOfBusinessMonth(instant, 'UTC').toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(startOfBusinessDay(instant, NY).toISOString()).toBe('2026-01-31T05:00:00.000Z');
  });

  it('handles both sides of the US spring-forward', () => {
    expect(startOfBusinessDay(new Date('2026-03-08T12:00:00Z'), NY).toISOString())
      .toBe('2026-03-08T05:00:00.000Z'); // EST
    expect(startOfBusinessDay(new Date('2026-03-09T12:00:00Z'), NY).toISOString())
      .toBe('2026-03-09T04:00:00.000Z'); // EDT
  });

  it('handles BST vs GMT', () => {
    expect(startOfBusinessDay(new Date('2026-07-15T12:00:00Z'), LDN).toISOString())
      .toBe('2026-07-14T23:00:00.000Z');
    expect(startOfBusinessDay(new Date('2026-01-15T12:00:00Z'), LDN).toISOString())
      .toBe('2026-01-15T00:00:00.000Z');
    expect(startOfBusinessMonth(new Date('2026-07-15T12:00:00Z'), LDN).toISOString())
      .toBe('2026-06-30T23:00:00.000Z');
  });

  it('UTC is the identity', () => {
    expect(startOfBusinessDay(new Date('2026-07-15T12:34:56Z'), 'UTC').toISOString())
      .toBe('2026-07-15T00:00:00.000Z');
  });
});
