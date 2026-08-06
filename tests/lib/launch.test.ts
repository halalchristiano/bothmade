import { describe, expect, it } from 'vitest';
import {
  LAUNCH_CHECKS,
  launchLane,
  launchReadiness,
  readChecklist,
  warrantyEndFrom,
  warrantyState,
  WARRANTY_DAYS,
} from '@/lib/launch';

const allDone = Object.fromEntries(LAUNCH_CHECKS.map((c) => [c.key, { done: true }]));
const paid = { finalInstalmentPaid: true, domainName: 'havis.co.uk' };

describe('readChecklist', () => {
  it('reads what was stored', () => {
    const state = readChecklist({ forms: { done: true, by: 'Kiana', at: '2026-08-01' } });
    expect(state.forms).toEqual({ done: true, by: 'Kiana', at: '2026-08-01', note: undefined });
  });

  // The list lives in code, so a renamed check leaves an orphan behind. It
  // must not go on counting towards a percentage nothing can explain.
  it('drops keys that are no longer checks', () => {
    expect(readChecklist({ 'a-check-we-deleted': { done: true } })).toEqual({});
  });

  it('survives anything that is not a checklist', () => {
    expect(readChecklist(null)).toEqual({});
    expect(readChecklist([])).toEqual({});
    expect(readChecklist('{}')).toEqual({});
    expect(readChecklist({ forms: 'yes' })).toEqual({});
  });

  it('treats anything but true as not done', () => {
    expect(readChecklist({ forms: { done: 'yes' } }).forms.done).toBe(false);
  });
});

describe('launchReadiness', () => {
  it('is ready only when every blocking check is done and the money has cleared', () => {
    const ready = launchReadiness(allDone, paid);
    expect(ready.ready).toBe(true);
    expect(ready.blockers).toEqual([]);
    expect(ready.percent).toBe(100);
  });

  // Section 7: "Nothing goes live … until it has cleared."
  it('blocks on the final payment, first', () => {
    const verdict = launchReadiness(allDone, { ...paid, finalInstalmentPaid: false });
    expect(verdict.ready).toBe(false);
    expect(verdict.blockers[0].key).toBe('payment-3');
    expect(verdict.blockers[0].reason).toMatch(/Section 7/);
  });

  // Payment is computed, never ticked — a checkbox saying the money arrived
  // is a checkbox somebody ticks optimistically on a Friday.
  it('has no check anybody can tick to claim the money arrived', () => {
    expect(LAUNCH_CHECKS.some((c) => /payment/i.test(c.key))).toBe(false);
  });

  it('does not invent a payment blocker on a project with no schedule', () => {
    const verdict = launchReadiness(allDone, {
      finalInstalmentPaid: false,
      hasSchedule: false,
      domainName: 'havis.co.uk',
    });
    expect(verdict.blockers).toEqual([]);
  });

  it('names an unrecorded domain as a blocker of its own', () => {
    const verdict = launchReadiness(allDone, { finalInstalmentPaid: true, domainName: '  ' });
    expect(verdict.blockers.map((b) => b.key)).toContain('domain-name');
  });

  it('lists the optional leftovers without stopping the launch', () => {
    const withoutOptional = Object.fromEntries(
      LAUNCH_CHECKS.filter((c) => c.blocking).map((c) => [c.key, { done: true }])
    );
    const verdict = launchReadiness(withoutOptional, paid);
    expect(verdict.ready).toBe(true);
    expect(verdict.optionalLeft.length).toBeGreaterThan(0);
    expect(verdict.line).toMatch(/optional/);
  });

  it('counts nothing as nothing', () => {
    const verdict = launchReadiness({}, { finalInstalmentPaid: false });
    expect(verdict.done).toBe(0);
    expect(verdict.percent).toBe(0);
    expect(verdict.ready).toBe(false);
  });

  // Indexing is the one that is invisible when it goes wrong: the site
  // launches, looks perfect, and never appears in search.
  it('treats leaving the preview noindex on as blocking', () => {
    expect(LAUNCH_CHECKS.find((c) => c.key === 'seo')?.blocking).toBe(true);
  });
});

describe('warranty', () => {
  it('runs thirty days from launch', () => {
    const launched = new Date('2026-08-06T12:00:00Z');
    const end = warrantyEndFrom(launched);
    expect(Math.round((end.getTime() - launched.getTime()) / 86_400_000)).toBe(WARRANTY_DAYS);
  });

  it('counts down while it is running', () => {
    const state = warrantyState('2026-08-16T12:00:00Z', new Date('2026-08-06T12:00:00Z'));
    expect(state.active).toBe(true);
    expect(state.daysLeft).toBe(10);
    expect(state.clientLine).toMatch(/no charge/);
  });

  it('says so plainly once it has run out', () => {
    const state = warrantyState('2026-08-01T12:00:00Z', new Date('2026-08-06T12:00:00Z'));
    expect(state.active).toBe(false);
    expect(state.daysLeft).toBe(0);
    expect(state.clientLine).toMatch(/support rather than a fix/);
  });

  it('has something honest to say before a launch has happened', () => {
    const state = warrantyState(null);
    expect(state.active).toBe(false);
    expect(state.clientLine).toMatch(/starts the day/);
  });
});

describe('launchLane', () => {
  it('sorts by what has actually happened, not by stage', () => {
    expect(launchLane({})).toBe('preparing');
    expect(launchLane({ readyForLaunchAt: '2026-08-01' })).toBe('ready');
    expect(launchLane({ readyForLaunchAt: '2026-08-01', liveUrl: 'https://x.com' })).toBe('live');
    // Live without the confirmation ever being recorded still reads as live —
    // the site is up, and pretending otherwise helps nobody.
    expect(launchLane({ liveUrl: 'https://x.com' })).toBe('live');
  });
});
