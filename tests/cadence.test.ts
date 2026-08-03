import { describe, expect, it } from 'vitest';
import { OUTREACH_CADENCE, cadenceStepFor } from '@/lib/cadence';

describe('cadence positioning', () => {
  it('no emails sent means no cadence — cold outreach comes first', () => {
    expect(cadenceStepFor(0)).toBeNull();
  });
  it('walks bump → new angle → break-up', () => {
    expect(cadenceStepFor(1)?.templateId).toBe('followup_1');
    expect(cadenceStepFor(2)?.templateId).toBe('followup_2');
    expect(cadenceStepFor(3)?.templateId).toBe('followup_3');
  });
  it('stays on the break-up note rather than inventing a fourth touch', () => {
    expect(cadenceStepFor(9)?.templateId).toBe('followup_3');
  });
  it('the schedule is finite and ordered', () => {
    expect(OUTREACH_CADENCE.length).toBe(3);
    expect(OUTREACH_CADENCE.every((s) => s.afterDays > 0)).toBe(true);
  });
});
