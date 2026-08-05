import { describe, expect, it } from 'vitest';
import { LEAD_STAGES, LEAD_STATUSES, stageForStatus, type LeadStatus } from '@/lib/leads';

/**
 * Grouping the board's columns is a change to how the pipeline is *looked at*,
 * never to what a lead's status means. These pin the one property that makes
 * that true: every status lands in exactly one column, and no status quietly
 * disappears off the board.
 */

describe('the board\'s stages', () => {
  it('covers every status exactly once', () => {
    const grouped = LEAD_STAGES.flatMap((s) => s.statuses);

    expect([...grouped].sort()).toEqual([...LEAD_STATUSES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('turns sixteen columns into something you can see at once', () => {
    expect(LEAD_STATUSES.length).toBe(16);
    expect(LEAD_STAGES.length).toBeLessThanOrEqual(6);
  });

  it('keeps pipeline order — a lead never moves backwards by moving forwards', () => {
    // The first status of each stage must appear later in LEAD_STATUSES than
    // the first status of the stage before it, or "move next" could send a
    // card left.
    const firstIndexes = LEAD_STAGES.map((s) => LEAD_STATUSES.indexOf(s.statuses[0]));
    expect(firstIndexes).toEqual([...firstIndexes].sort((a, b) => a - b));
  });

  it('keeps each stage internally contiguous', () => {
    // A stage made of non-adjacent statuses would mean a single "move next"
    // could skip a column entirely.
    for (const stage of LEAD_STAGES) {
      const indexes = stage.statuses.map((s) => LEAD_STATUSES.indexOf(s));
      for (let i = 1; i < indexes.length; i++) {
        expect(indexes[i]).toBe(indexes[i - 1] + 1);
      }
    }
  });

  it('puts won and lost together at the end', () => {
    const last = LEAD_STAGES[LEAD_STAGES.length - 1];
    expect([...last.statuses].sort()).toEqual(['lost', 'won']);
  });
});

describe('finding a status\'s column', () => {
  it('places every real status', () => {
    for (const status of LEAD_STATUSES) {
      expect(stageForStatus(status).statuses).toContain(status);
    }
  });

  it('gives an unknown status a home rather than throwing', () => {
    // A row written by an older deploy should still appear on the board.
    expect(stageForStatus('something_else' as LeadStatus)).toBe(LEAD_STAGES[0]);
  });

  it('every stage says what it means', () => {
    for (const stage of LEAD_STAGES) {
      expect(stage.label.trim().length).toBeGreaterThan(0);
      expect(stage.hint.trim().length).toBeGreaterThan(0);
    }
  });
});
