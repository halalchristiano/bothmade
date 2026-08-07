import { describe, expect, it } from 'vitest';
import { lostAtForStatusChange } from '@/lib/leads';

/**
 * When a deal was lost, as opposed to when its row was last touched.
 *
 * The mirror of won-at.test.ts, and the same bug seen from the other end.
 * `wonAt` fixed the revenue side; the lost side kept reading `updatedAt`, so
 * correcting a typo on a deal lost in March moved it into the current quarter
 * and its reason was counted a second time. The analytics page dates won and
 * lost together, so until this existed one ratio was built from two different
 * definitions of "decided".
 */

const MARCH = new Date('2026-03-04T15:00:00.000Z');
const NOW = new Date('2026-08-07T15:00:00.000Z');

describe('stamping a decision date', () => {
  it('stamps the moment a deal becomes lost', () => {
    expect(lostAtForStatusChange('lost', { status: 'proposal_sent', lostAt: null }, NOW)).toEqual(NOW);
  });

  it('stamps a lost lead that predates the column, when it is next written', () => {
    expect(lostAtForStatusChange(undefined, { status: 'lost', lostAt: null }, NOW)).toEqual(NOW);
  });

  it('leaves the column alone for any other status change', () => {
    expect(lostAtForStatusChange('won', { status: 'verbal_yes', lostAt: null }, NOW)).toBeUndefined();
    expect(lostAtForStatusChange('qualified', { status: 'contacted', lostAt: null }, NOW)).toBeUndefined();
  });
});

describe('re-saving a deal that is already lost', () => {
  /** The bug, stated directly. */
  it('does not re-date it', () => {
    expect(lostAtForStatusChange('lost', { status: 'lost', lostAt: MARCH }, NOW)).toBeUndefined();
  });

  it('does not re-date it when the write carries no status at all', () => {
    expect(lostAtForStatusChange(undefined, { status: 'lost', lostAt: MARCH }, NOW)).toBeUndefined();
  });

  /**
   * Matches wonAtForStatusChange: reviving a deal keeps the old stamp rather
   * than clearing it. A lead marked lost by mistake and corrected the same
   * hour is rarer than one revived and lost again, and in the second case the
   * original date is the one worth keeping. Nothing reads it while the lead is
   * active — every consumer filters on `status` first.
   */
  it('keeps the stamp when a lost deal is revived', () => {
    expect(lostAtForStatusChange('replied', { status: 'lost', lostAt: MARCH }, NOW)).toBeUndefined();
  });
});
