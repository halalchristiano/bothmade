import { describe, expect, it } from 'vitest';
import { changeOrderVerdict, readChangeScale } from '@/lib/change-order-verdict';

/**
 * The verdicts are the contract, so these assert the outcomes the clauses
 * require rather than the wording that carries them.
 */

const discovery = { status: 'discovery' };
const designFresh = {
  status: 'design',
  designPresentedAt: '2026-08-01T00:00:00Z',
  designRevisionsUsed: 0,
};
const designSpent = {
  status: 'design',
  designPresentedAt: '2026-08-01T00:00:00Z',
  designRevisionsUsed: 2,
};
const build = {
  status: 'build',
  designPresentedAt: '2026-07-01T00:00:00Z',
  designApprovedAt: '2026-07-08T00:00:00Z',
  designRevisionsUsed: 1,
};

describe('changeOrderVerdict — Discovery', () => {
  // Section 5: the scope is not fixed until Requirements Sign-off, so nothing
  // before that gate is a change to anything.
  it('charges for nothing before the scope is fixed', () => {
    for (const scale of ['minor', 'major'] as const) {
      const verdict = changeOrderVerdict(scale, discovery);
      expect(verdict.ruling).toBe('included');
      expect(verdict.chargeable).toBe(false);
      expect(verdict.clauses).toContain('Section 5');
    }
  });

  it('warns that new scope has to reach the requirements summary first', () => {
    expect(changeOrderVerdict('major', discovery).detail.join(' ')).toMatch(
      /requirements summary/i
    );
  });
});

describe('changeOrderVerdict — Design', () => {
  // Exhibit A: two rounds of revisions, included.
  it('treats a minor change as an included revision while rounds remain', () => {
    const verdict = changeOrderVerdict('minor', designFresh);
    expect(verdict.ruling).toBe('included');
    expect(verdict.chargeable).toBe(false);
    expect(verdict.clauses).toContain('Exhibit A');
  });

  it('bills a minor change once both included rounds are spent', () => {
    const verdict = changeOrderVerdict('minor', designSpent);
    expect(verdict.ruling).toBe('change_order');
    expect(verdict.chargeable).toBe(true);
    expect(verdict.clauses).toContain('Section 4');
  });

  // The allowance covers revisions of the presented design, not additions to
  // it — so an unspent allowance does not make new scope free.
  it('bills new scope even with both revision rounds untouched', () => {
    const verdict = changeOrderVerdict('major', designFresh);
    expect(verdict.ruling).toBe('change_order');
    expect(verdict.chargeable).toBe(true);
  });

  it('does not add a rework charge before anything is built', () => {
    expect(changeOrderVerdict('major', designFresh).reworkLikely).toBe(false);
  });
});

describe('changeOrderVerdict — after Design Approval', () => {
  // Section 9: "Where a Change Order requires re-architecting completed work,
  // the quote reflects that rework cost in addition to the new feature."
  it('prices rework for new scope once the design is approved', () => {
    const verdict = changeOrderVerdict('major', build);
    expect(verdict.ruling).toBe('change_order_with_rework');
    expect(verdict.reworkLikely).toBe(true);
    expect(verdict.clauses).toContain('Section 9');
  });

  it('still bills a minor change against an accepted deliverable', () => {
    const verdict = changeOrderVerdict('minor', build);
    expect(verdict.chargeable).toBe(true);
    expect(verdict.reworkLikely).toBe(false);
  });

  // Approval by lapse is approval. A project still marked "design" whose
  // review period ran out must not be judged as though nothing was accepted.
  it('follows the approval stamp rather than the status column', () => {
    const verdict = changeOrderVerdict('major', {
      status: 'design',
      designPresentedAt: '2026-07-01T00:00:00Z',
      designApprovedAt: '2026-07-08T00:00:00Z',
    });
    expect(verdict.ruling).toBe('change_order_with_rework');
  });

  // …and having reached that branch by the stamp, it must not then describe
  // the project as something it is not. Nobody has moved the dropdown here,
  // so Build has not started, and saying "implementation under way" is the
  // kind of confidently wrong sentence that stops a panel being believed.
  it('does not claim Build has started just because the design was approved', () => {
    const verdict = changeOrderVerdict('minor', {
      status: 'design',
      designApprovedAt: '2026-07-08T00:00:00Z',
    });
    expect(verdict.stageLabel).not.toMatch(/implementation under way/i);
    expect(verdict.stageLabel).toMatch(/approved/i);
  });

  it('says the launch stage out loud, because re-testing is part of the cost', () => {
    const verdict = changeOrderVerdict('minor', {
      status: 'launch',
      designApprovedAt: '2026-07-08T00:00:00Z',
    });
    expect(verdict.stageLabel).toMatch(/launch/i);
    expect(verdict.detail.join(' ')).toMatch(/re-test/i);
  });
});

describe('changeOrderVerdict — Complete', () => {
  it('points a minor change at the warranty before the fee', () => {
    const verdict = changeOrderVerdict('minor', { status: 'complete' });
    expect(verdict.clauses).toContain('Section 16');
  });

  it('prices rework for new work on shipped code', () => {
    expect(changeOrderVerdict('major', { status: 'complete' }).reworkLikely).toBe(true);
  });
});

describe('changeOrderVerdict — unknown stage', () => {
  // The cautious answer, not a guess: without a gate the allowance cannot be
  // applied, and a signed document is the outcome that keeps the fee and the
  // scope on the same page.
  it('falls back to raising one rather than inventing an allowance', () => {
    const verdict = changeOrderVerdict('minor', { status: '' });
    expect(verdict.ruling).toBe('change_order');
    expect(verdict.chargeable).toBe(true);
    expect(verdict.stageLabel).toMatch(/unclear/i);
  });
});

describe('readChangeScale', () => {
  it('only accepts the two words the contract turns on', () => {
    expect(readChangeScale('major')).toBe('major');
    expect(readChangeScale('minor')).toBe('minor');
    // Anything unrecognised is treated as a revision claim, which is the
    // reading that gets scrutinised rather than waved through.
    expect(readChangeScale('enormous')).toBe('minor');
    expect(readChangeScale(undefined)).toBe('minor');
  });
});

describe('every verdict is presentable', () => {
  const stages = [discovery, designFresh, designSpent, build, { status: 'complete' }, { status: '' }];

  it('always says where the project is and why', () => {
    for (const stage of stages) {
      for (const scale of ['minor', 'major'] as const) {
        const verdict = changeOrderVerdict(scale, stage);
        expect(verdict.stageLabel.length).toBeGreaterThan(0);
        expect(verdict.headline.length).toBeGreaterThan(0);
        expect(verdict.detail.length).toBeGreaterThan(0);
        expect(verdict.clauses.length).toBeGreaterThan(0);
        // A ruling that costs nothing must never be marked billable, and vice
        // versa — the panel colours and the stored record both read this.
        expect(verdict.chargeable).toBe(verdict.ruling !== 'included');
      }
    }
  });
});
