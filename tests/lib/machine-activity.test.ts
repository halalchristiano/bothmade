import { describe, expect, it } from 'vitest';
import {
  LEAD_ACTIVITY_MANUAL_TYPES,
  LEAD_ACTIVITY_TYPES,
  isLeadActivityType,
  isMachineActivityType,
} from '@/lib/leads';

/**
 * The one entry in a lead's history nobody gets to write.
 *
 * A dial is recorded as the phone app takes the screen — nothing to press, no
 * way to skip it — which is the only reason the dashboard can say "14
 * dialled, 3 written up" and have that mean anything.
 *
 * Adding `dial` to the activity types made it a hand-writable one: it appeared
 * in the picker on the lead page as a button reading "Number dialled", and the
 * activity endpoint accepted it like any other. A number anybody can add to by
 * hand answers nothing, which would have quietly undone the whole point of
 * recording dials rather than asking about them.
 */

describe('what a person may write by hand', () => {
  it('offers every ordinary type', () => {
    for (const type of ['note', 'email', 'call', 'loom', 'proposal', 'objection']) {
      expect(LEAD_ACTIVITY_MANUAL_TYPES, type).toContain(type);
    }
  });

  it('does not offer a dial', () => {
    expect(LEAD_ACTIVITY_MANUAL_TYPES).not.toContain('dial');
  });

  /**
   * Every type is either writable or machine-recorded. A new one added
   * without a decision falls into the writable set, which is the safe
   * direction — but it should be a decision, not an omission.
   */
  it('accounts for every type one way or the other', () => {
    for (const type of LEAD_ACTIVITY_TYPES) {
      expect(
        LEAD_ACTIVITY_MANUAL_TYPES.includes(type) || isMachineActivityType(type),
        type
      ).toBe(true);
    }
  });
});

describe('the machine-only rule', () => {
  it('names the dial and nothing else', () => {
    expect(isMachineActivityType('dial')).toBe(true);
    for (const type of LEAD_ACTIVITY_MANUAL_TYPES) {
      expect(isMachineActivityType(type), type).toBe(false);
    }
  });

  /**
   * A dial is still a real activity type — it renders in the timeline with a
   * label like any other. It simply cannot be authored. Excluding it from the
   * type guard as well would break reading what the app itself wrote.
   */
  it('leaves a recorded dial readable', () => {
    expect(isLeadActivityType('dial')).toBe(true);
  });
});
