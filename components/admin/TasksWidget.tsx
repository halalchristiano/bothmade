'use client';

import { useEffect, useState } from 'react';
import { BrandButton, inputClass } from '@/components/admin/ui';
import { taskDueLabel } from '@/lib/tasks';

interface TaskItem {
  id: string;
  title: string;
  done: boolean;
  dueAt: string | null;
}

/**
 * The same order the API returns: still to do first, then by what is due
 * soonest, then newest.
 *
 * Needed here because a task added without a reload has to land where the
 * server would have put it. Nulls last — a task with no date is not more
 * urgent than one due this morning, and `undefined - number` is NaN, which
 * sorts nothing.
 */
function sortTasks(tasks: TaskItem[]): TaskItem[] {
  const due = (t: TaskItem) => (t.dueAt ? new Date(t.dueAt).getTime() : Number.POSITIVE_INFINITY);
  return tasks.slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (due(a) !== due(b)) return due(a) - due(b);
    return 0;
  });
}

/** How loudly a due date reads. Overdue is the only one that gets a colour
    people notice from across a desk. */
const DUE_TONE: Record<string, string> = {
  overdue: 'text-red-300',
  today: 'text-amber-200',
  soon: 'text-white/45',
  later: 'text-white/30',
};

/**
 * One line of the list.
 *
 * Both halves — still to do, and done — were the same eleven lines of JSX
 * written twice, which is how the due date would have ended up on one of
 * them and not the other.
 */
function Row({
  task,
  onToggle,
  onDelete,
  done = false,
}: {
  task: TaskItem;
  onToggle: (t: TaskItem) => void;
  onDelete: (id: string) => void;
  done?: boolean;
}) {
  const due = taskDueLabel(task.dueAt);
  return (
    <label className={`flex items-center gap-2 group text-sm py-1 ${done ? 'opacity-40' : ''}`}>
      <input type="checkbox" checked={task.done} onChange={() => onToggle(task)} />
      <span className={`flex-1 ${done ? 'line-through' : ''}`}>{task.title}</span>
      {/*
        The reason this row is where it is. The list has always been ordered
        by due date and never showed one, so the order looked arbitrary and a
        task due this afternoon was indistinguishable from one with no date
        at all. Hidden once a task is done — a finished job is not late.
      */}
      {due && !done && (
        <span data-numeric className={`shrink-0 text-xs ${DUE_TONE[due.tone] ?? 'text-white/30'}`}>
          {due.label}
        </span>
      )}
      <button
        onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-300 text-xs transition-opacity"
      >
        remove
      </button>
    </label>
  );
}

/**
 * `refreshSignal` is bumped by the dashboard's refresh control — the same
 * signal Today takes. This card used to fetch once on mount and never again,
 * so a page-wide refresh left it showing whatever it had when the tab was
 * opened, under a timestamp saying otherwise.
 */
export function TasksWidget({ refreshSignal = 0 }: { refreshSignal?: number } = {}) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  /**
   * A due date, which this list has sorted by since it was written and never
   * once let anybody set.
   *
   * `dueAt` is on the model, it is the second key in the GET's orderBy, and
   * the widget was the only client — so in practice every task carried null,
   * the sort did nothing, and "what is due first" was a question the to-do
   * list could not answer about itself. Optional, because most of these are
   * "ring them back" and a date box you must fill in is a box people stop
   * using.
   */
  const [newDueAt, setNewDueAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const response = await fetch('/api/admin/tasks');
      const data = await response.json();
      if (data.success) setTasks(data.tasks);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    setError('');
    try {
      const response = await fetch('/api/admin/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Sent only when there is one. An empty string is "no date" to the
        // route as well, but not sending the key at all is what a caller
        // that does not care about due dates looks like.
        body: JSON.stringify({ title: newTitle, ...(newDueAt ? { dueAt: newDueAt } : {}) }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.success) {
        // Inserted in the right place rather than at the top: the list is
        // ordered by what is due first, and a new task landing above one due
        // this morning would be the widget contradicting its own sort.
        setTasks((prev) => sortTasks([data.task, ...prev]));
        setNewTitle('');
        setNewDueAt('');
      } else {
        // The title stays in the box on purpose — it is the only copy.
        setError(data?.error ?? "Couldn't save that task — try again.");
      }
    } catch {
      setError('Could not reach the server — check your connection.');
    } finally {
      setAdding(false);
    }
  };

  /*
   * Both of these update the list first and ask the server after, which is
   * right — a checkbox that waits on a round trip feels broken.
   *
   * What was missing is the other half of that bargain. Neither looked at the
   * response, so a failed write left the screen showing the change anyway: a
   * task ticked off that was still open, or one removed that was still there,
   * and no way to tell until a reload silently put it back. A to-do list that
   * loses a tick is worse than one that is slow to take it, so a write that
   * did not land now puts the row back the way it was and says so.
   */
  const handleToggle = async (task: TaskItem) => {
    setError('');
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
    const revert = () =>
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: task.done } : t)));
    try {
      const response = await fetch(`/api/admin/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !task.done }),
      });
      if (!response.ok) {
        revert();
        setError("Couldn't update that task — put it back.");
      }
    } catch {
      revert();
      setError('Could not reach the server — check your connection.');
    }
  };

  const handleDelete = async (taskId: string) => {
    setError('');
    // Captured before the removal so a failed delete can put the row back
    // where it was rather than at the top of the list.
    const index = tasks.findIndex((t) => t.id === taskId);
    const removed = tasks[index];
    if (!removed) return;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    const revert = () =>
      setTasks((prev) => {
        if (prev.some((t) => t.id === taskId)) return prev;
        const next = prev.slice();
        next.splice(Math.min(index, next.length), 0, removed);
        return next;
      });
    try {
      const response = await fetch(`/api/admin/tasks/${taskId}`, { method: 'DELETE' });
      if (!response.ok) {
        revert();
        setError("Couldn't remove that task — put it back.");
      }
    } catch {
      revert();
      setError('Could not reach the server — check your connection.');
    }
  };

  const pending = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div className="relative rounded-2xl border border-white/[0.06] bg-surface p-6 shadow-e2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent">
      <h2 className="mb-4 text-base font-semibold">My to-dos</h2>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Add a task…"
          aria-label="Add a task"
          // The shared field style, rather than a fourth local copy of it.
          className={`${inputClass} min-w-40 flex-1`}
        />
        {/* The field that makes the sort mean something. Optional, and last,
            so the common case is still type-and-Enter. */}
        <input
          type="date"
          value={newDueAt}
          onChange={(e) => setNewDueAt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          aria-label="Due date (optional)"
          className={`${inputClass} w-36 shrink-0 [color-scheme:dark]`}
        />
        <BrandButton onClick={handleAdd} disabled={adding || !newTitle.trim()} className="shrink-0">
          Add
        </BrandButton>
      </div>

      {error && (
        <p role="status" className="text-xs text-amber-300/90 mb-3">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-white/30 text-sm">Loading...</p>
      ) : tasks.length === 0 ? (
        <p className="text-white/30 text-sm">Nothing on your list — nice.</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {pending.map((t) => (
            <Row key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} />
          ))}
          {done.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-wide text-white/25 mt-3 mb-1">Done</p>
              {done.map((t) => (
                <Row key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} done />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
