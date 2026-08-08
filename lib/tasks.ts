/**
 * The studio's own to-do list — the small shared vocabulary its two routes
 * and its widget were each inventing separately.
 *
 * The routes had no tests and disagreed with each other about what a task is.
 * Creating one refused an empty title; editing one accepted it, so a PATCH
 * could blank a row that POST would never have written — leaving a checkbox
 * with nothing beside it and no way to tell which task it was. And both took
 * whatever `dueAt` arrived and handed it straight to `new Date`, so a string
 * that is not a date became an Invalid Date, which Prisma rejects, which came
 * back as "Internal server error" for what is one bad field.
 */

/** As long a title as a line in the list can usefully hold. */
export const TASK_TITLE_MAX = 200;

export type TaskTitleResult = { ok: true; title: string } | { ok: false; error: string };

/**
 * One answer to "is this a title", used by both routes.
 *
 * Trimmed, because " " is not a title and storing it makes a row that reads
 * as empty; capped, because a pasted paragraph turns one line of the list
 * into a wall and the field it is displayed in has no scrollbar.
 */
export function readTaskTitle(raw: unknown): TaskTitleResult {
  if (typeof raw !== 'string') return { ok: false, error: 'Give the task a title.' };
  const title = raw.trim();
  if (!title) return { ok: false, error: 'Give the task a title.' };
  return { ok: true, title: title.slice(0, TASK_TITLE_MAX) };
}

export type TaskDueResult = { ok: true; dueAt: Date | null } | { ok: false; error: string };

/**
 * A due date, or nothing, or a clear refusal.
 *
 * `null` and `''` both mean "no date" — the first is what the API sends, the
 * second is what an emptied date input posts — and both are a legitimate
 * thing to say. Anything that does not parse is refused with a message
 * rather than passed on as an Invalid Date, which is the value that turned
 * a typo into a 500.
 */
export function readTaskDueAt(raw: unknown): TaskDueResult {
  if (raw === null || raw === undefined || raw === '') return { ok: true, dueAt: null };
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return { ok: false, error: "That due date isn't a date." };
  }
  const dueAt = new Date(raw);
  if (Number.isNaN(dueAt.getTime())) {
    return { ok: false, error: "That due date isn't a date." };
  }
  return { ok: true, dueAt };
}

/**
 * How a due date reads on the row, and how much it should shout.
 *
 * The list has always sorted by this column and never shown it, so a task due
 * this afternoon looked exactly like one with no date at all and the ordering
 * had no visible reason. Dates are compared by day rather than by instant:
 * something due at 09:00 is still due *today* at 17:00, and calling it
 * overdue in the afternoon is the kind of nagging that gets a widget ignored.
 */
export interface TaskDueLabel {
  label: string;
  tone: 'overdue' | 'today' | 'soon' | 'later';
}

export function taskDueLabel(dueAt: Date | string | null, now: Date = new Date()): TaskDueLabel | null {
  if (!dueAt) return null;
  const due = typeof dueAt === 'string' ? new Date(dueAt) : dueAt;
  if (Number.isNaN(due.getTime())) return null;

  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(due) - startOf(now)) / 86_400_000);

  if (days < 0) {
    return {
      label: days === -1 ? 'Due yesterday' : `${Math.abs(days)} days overdue`,
      tone: 'overdue',
    };
  }
  if (days === 0) return { label: 'Due today', tone: 'today' };
  if (days === 1) return { label: 'Due tomorrow', tone: 'soon' };
  if (days <= 7) return { label: `Due in ${days} days`, tone: 'soon' };

  /*
   * The year, once it is not this one.
   *
   * Without it, a task due 8 August next year renders as "Due Aug 8" — which
   * on 8 August this year is the same words the row above it would use for
   * today. Found by looking at a screenshot of a real list rather than by
   * reading this function: every unit test for it used dates inside one year,
   * so the two cases were never on screen together.
   */
  const sameYear = due.getFullYear() === now.getFullYear();
  return {
    label: `Due ${due.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    })}`,
    tone: 'later',
  };
}
