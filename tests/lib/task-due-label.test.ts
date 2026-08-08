import { describe, expect, it } from 'vitest';
import { readTaskDueAt, readTaskTitle, taskDueLabel, TASK_TITLE_MAX } from '@/lib/tasks';

/**
 * How a due date reads, and why it is compared by day rather than by instant.
 *
 * The list has sorted on this column since it was written and never shown it,
 * so a task due this afternoon looked exactly like one with no date at all
 * and the ordering had no visible reason. Putting the date on the row is the
 * easy half; the half worth testing is the arithmetic, because "overdue" is
 * a word that gets a widget switched off if it is used loosely.
 *
 * A task due at 09:00 is still due TODAY at 17:00. Comparing instants would
 * call it overdue from 09:01, which is nagging rather than reporting.
 */

const at = (iso: string) => new Date(iso);

describe('what a due date says', () => {
  it('says nothing at all when there is no date', () => {
    expect(taskDueLabel(null)).toBeNull();
  });

  it('is still due today in the afternoon, not overdue', () => {
    const label = taskDueLabel(at('2026-08-08T09:00:00'), at('2026-08-08T17:30:00'));

    expect(label).toEqual({ label: 'Due today', tone: 'today' });
  });

  it('is overdue the day after, not the hour after', () => {
    expect(taskDueLabel(at('2026-08-08T09:00:00'), at('2026-08-09T08:00:00'))).toEqual({
      label: 'Due yesterday',
      tone: 'overdue',
    });
  });

  it('counts the days once it has been a while', () => {
    expect(taskDueLabel(at('2026-08-01T09:00:00'), at('2026-08-08T12:00:00'))).toEqual({
      label: '7 days overdue',
      tone: 'overdue',
    });
  });

  it('says tomorrow rather than "in 1 days"', () => {
    expect(taskDueLabel(at('2026-08-09T09:00:00'), at('2026-08-08T12:00:00'))?.label).toBe('Due tomorrow');
  });

  it('counts down inside the week, then gives the date', () => {
    expect(taskDueLabel(at('2026-08-12T09:00:00'), at('2026-08-08T12:00:00'))).toEqual({
      label: 'Due in 4 days',
      tone: 'soon',
    });
    expect(taskDueLabel(at('2026-09-30T09:00:00'), at('2026-08-08T12:00:00'))?.tone).toBe('later');
  });

  it('reads a date the API sent as a string', () => {
    expect(taskDueLabel('2026-08-08T09:00:00', at('2026-08-08T17:00:00'))?.tone).toBe('today');
  });

  it('says nothing rather than "Invalid Date" when the value is rubbish', () => {
    expect(taskDueLabel('not a date' as unknown as string, at('2026-08-08T12:00:00'))).toBeNull();
  });
});

describe('what counts as a title', () => {
  it('trims it', () => {
    expect(readTaskTitle('  Ring Havisham  ')).toEqual({ ok: true, title: 'Ring Havisham' });
  });

  it('refuses nothing, spaces, and anything that is not text', () => {
    for (const raw of ['', '   ', null, undefined, 42, { title: 'x' }]) {
      expect(readTaskTitle(raw).ok, `${JSON.stringify(raw)} is not a title`).toBe(false);
    }
  });

  it('caps a pasted paragraph', () => {
    const parsed = readTaskTitle('y'.repeat(TASK_TITLE_MAX + 1));
    expect(parsed.ok && parsed.title.length).toBe(TASK_TITLE_MAX);
  });
});

describe('what counts as a due date', () => {
  it('treats null, undefined and an emptied field as no date', () => {
    for (const raw of [null, undefined, '']) {
      expect(readTaskDueAt(raw)).toEqual({ ok: true, dueAt: null });
    }
  });

  it('refuses a string that is not a date rather than passing on an Invalid Date', () => {
    const parsed = readTaskDueAt('next tuesday');

    expect(parsed.ok).toBe(false);
    // The value that used to reach Prisma and come back as a 500.
    expect(new Date('next tuesday').getTime()).toBeNaN();
  });

  it('takes a date', () => {
    const parsed = readTaskDueAt('2026-09-01');
    expect(parsed.ok && parsed.dueAt?.toISOString()).toContain('2026-09-01');
  });
});
