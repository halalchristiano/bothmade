import { describe, expect, it } from 'vitest';
import { wonAtForStatusChange } from '@/lib/leads';

/**
 * When a deal was won, as opposed to when its row was last touched.
 *
 * THE BUG. There was no close date, so every "won this week" figure read
 * `updatedAt`. That is the last time *anything* on the row changed — so
 * adding a note to a deal closed in March re-dated the win to today. It
 * re-entered this period's won count and revenue, and jumped to the top of
 * the commission log carrying a close date that was really a last-touched
 * date.
 *
 * Three paths mark a lead won — the lead editor, converting one into a
 * project, and the Stripe webhook. They have to agree, because what they
 * feed is a commission figure, so the rule lives here rather than three
 * times over.
 */

const MARCH = new Date('2026-03-04T15:00:00.000Z');
const NOW = new Date('2026-08-07T15:00:00.000Z');

describe('stamping a close date', () => {
  it('stamps the moment a deal becomes won', () => {
    expect(wonAtForStatusChange('won', { status: 'verbal_yes', wonAt: null }, NOW)).toEqual(NOW);
  });

  it('leaves the column alone for any other status change', () => {
    expect(wonAtForStatusChange('lost', { status: 'proposal_sent', wonAt: null }, NOW)).toBeUndefined();
    expect(wonAtForStatusChange('qualified', { status: 'contacted', wonAt: null }, NOW)).toBeUndefined();
  });

  it('leaves the column alone when the status is not changing at all', () => {
    // The common case by far: saving a note, a tag, a phone number.
    expect(wonAtForStatusChange(undefined, { status: 'contacted', wonAt: null }, NOW)).toBeUndefined();
  });

  // The regression that matters. Re-saving a won deal must not re-date it —
  // that is the original bug, and it would come straight back if any write
  // path re-stamped an already-stamped row.
  it('does not re-date a deal that is already won', () => {
    expect(wonAtForStatusChange(undefined, { status: 'won', wonAt: MARCH }, NOW)).toBeUndefined();
    expect(wonAtForStatusChange('won', { status: 'won', wonAt: MARCH }, NOW)).toBeUndefined();
  });

  it('stamps a won row that never got a close date', () => {
    // Won before the column existed and missed by the backfill. Readers fall
    // back to updatedAt meanwhile, but the first write from here fixes it.
    expect(wonAtForStatusChange(undefined, { status: 'won', wonAt: null }, NOW)).toEqual(NOW);
  });

  it('keeps the original close date when a deal is reopened', () => {
    // Reopened and re-closed is likelier than marked-won-by-mistake, and for
    // that case the first close date is the one worth keeping.
    expect(wonAtForStatusChange('verbal_yes', { status: 'won', wonAt: MARCH }, NOW)).toBeUndefined();
    expect(wonAtForStatusChange('won', { status: 'verbal_yes', wonAt: MARCH }, NOW)).toBeUndefined();
  });
});
