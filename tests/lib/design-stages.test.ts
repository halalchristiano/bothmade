import { describe, expect, it } from 'vitest';

/**
 * What each round of the design is called.
 *
 * Exhibit A gives the Design milestone "an original visual design concept for
 * review; up to two (2) rounds of revisions" — three things, and the first is
 * not a revision. The dashboard called the opening concept "revision 1 of the
 * 2 included", which tells a client they have spent half their allowance
 * before saying a word about it.
 *
 * These pin the sequence to the contract, and pin both sides of the product
 * to the same words: a client must never be told "initial design" in the
 * email and "revision 1" on the dashboard.
 */

import {
  INCLUDED_REVISIONS,
  designStage,
  nextDesignStage,
  revisionAllowanceLine,
} from '@/lib/design-stages';
import { revisionState } from '@/lib/design-feedback';

describe('the sequence', () => {
  it('opens with the concept, which is not a revision', () => {
    const first = designStage(1);

    expect(first.label).toBe('Initial design');
    expect(first.label).not.toMatch(/revision/i);
    expect(first.meaning).toMatch(/not a revision/i);
    expect(first.billable).toBe(false);
  });

  it('then counts the two included rounds from one, not from two', () => {
    expect(designStage(2).label).toBe('Revision 1');
    expect(designStage(3).label).toBe('Revision 2');
  });

  it('says on the last included round that it is the last', () => {
    expect(designStage(3).meaning).toMatch(/last/i);
    expect(designStage(2).meaning).not.toMatch(/\blast\b/i);
  });

  /** Section 9: past the allowance, work is quoted before it starts. */
  it('marks anything past the allowance as a change order', () => {
    const beyond = designStage(4);

    expect(beyond.billable).toBe(true);
    expect(beyond.meaning).toMatch(/change order/i);
    expect(beyond.meaning).toMatch(/agreed the scope and cost/i);
    expect(designStage(3).billable).toBe(false);
  });

  it('matches the contract on how many are included', () => {
    expect(INCLUDED_REVISIONS).toBe(2);
    expect(designStage(1 + INCLUDED_REVISIONS).billable).toBe(false);
    expect(designStage(2 + INCLUDED_REVISIONS).billable).toBe(true);
  });

  it('survives a round number that should not exist', () => {
    for (const bad of [0, -3, Number.NaN]) {
      expect(designStage(bad).label).toBe('Initial design');
    }
  });

  it('names what comes next, for telling a client what they are waiting for', () => {
    expect(nextDesignStage(1).label).toBe('Revision 1');
    expect(nextDesignStage(2).label).toBe('Revision 2');
  });
});

describe('what a client is told about their allowance', () => {
  /**
   * The bug in one assertion: nothing about the opening concept may claim a
   * revision has been used.
   */
  it('does not spend a round before the client has asked for anything', () => {
    const line = revisionAllowanceLine(0);

    expect(line).toMatch(/both rounds .* still available/i);
    expect(line).not.toMatch(/revision 1 of/i);
  });

  it('counts down as rounds are actually spent', () => {
    expect(revisionAllowanceLine(1)).toMatch(/one is left/i);
    expect(revisionAllowanceLine(2)).toMatch(/both .* have been used/i);
  });

  /** Past the allowance still reads as a conversation, not a refusal. */
  it('offers to read it anyway once the allowance is gone', () => {
    expect(revisionAllowanceLine(3)).toMatch(/still read/i);
    expect(revisionAllowanceLine(3)).toMatch(/quote/i);
  });

  it('is the same line the client dashboard reads, not a second version', () => {
    expect(revisionState(0).clientLine).toBe(revisionAllowanceLine(0));
    expect(revisionState(2).clientLine).toBe(revisionAllowanceLine(2));
  });
});
