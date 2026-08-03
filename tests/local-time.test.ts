import { describe, expect, it } from 'vitest';
import { leadLocalTime } from '@/lib/local-time';

// Importing the module at all proves the table has no duplicate area codes:
// assign() now throws on a collision, which is how 347 (Manhattan) once
// silently resolved to Chicago.
describe('area-code timezone table', () => {
  const zoneOf = (phone: string) => leadLocalTime(phone)?.zone ?? null;

  it.each([
    ['+1 347 555 0100', 'America/New_York'],   // was Chicago
    ['+1 838 555 0100', 'America/New_York'],   // was Los Angeles
    ['+1 628 555 0100', 'America/Los_Angeles'], // was Eastern catch-all
    ['+1 612 555 0100', 'America/Chicago'],     // Minneapolis, was Eastern
    ['+1 615 555 0100', 'America/Chicago'],     // Nashville, was Eastern
    ['+1 602 555 0100', 'America/Phoenix'],
    ['+1 907 555 0100', 'America/Anchorage'],
  ])('%s → %s', (phone, zone) => {
    expect(zoneOf(phone)).toBe(zone);
  });

  it('toll-free numbers get advice, not a guessed zone', () => {
    const r = leadLocalTime('+1 800 555 0100');
    expect(r?.zone).toBeNull();
    expect(r?.advice).toMatch(/toll-free/i);
  });
});
