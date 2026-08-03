'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ConfirmDialog } from '@/components/admin/Modal';
import { withRollback } from '@/components/admin/useAsyncData';

interface TaskItem {
  id: string;
  title: string;
  done: boolean;
  dueAt: string | null;
  assignedToId: string;
  assigneeName: string | null;
  assignedToMe: boolean;
  relatedLabel: string | null;
  relatedHref: string | null;
}

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
}

/** Local midnight — a task due today is not overdue until tomorrow. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dueState(dueAt: string | null): 'overdue' | 'today' | 'upcoming' | 'none' {
  if (!dueAt) return 'none';
  const due = new Date(dueAt);
  const today = startOfToday();
  const tomorrow = new Date(today.getTime() + 86400000);
  if (due < today) return 'overdue';
  if (due < tomorrow) return 'today';
  return 'upcoming';
}

function formatDue(dueAt: string): string {
  const due = new Date(dueAt);
  const state = dueState(dueAt);
  if (state === 'today') return 'today';
  const days = Math.round((due.getTime() - startOfToday().getTime()) / 86400000);
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days < 7) return `in ${days}d`;
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * The to-do list, upgraded from a flat checkbox list.
 *
 * The underlying Task model always had a due date, an assignee, and links
 * to a lead or project — the widget just never exposed any of it, so every
 * task was an undated, unassignable, contextless line of text and nothing
 * could be chased or delegated. It also removed tasks on a single click
 * with no confirmation, and updated optimistically with no rollback, so a
 * failed write left the screen disagreeing with the database until reload.
 */
export function TasksWidget() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const [newTitle, setNewTitle] = useState('');
  const [newDueAt, setNewDueAt] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [adding, setAdding] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<TaskItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setError('');
    try {
      const [tasksRes, usersRes] = await Promise.all([
        fetch('/api/admin/tasks'),
        fetch('/api/admin/users'),
      ]);
      if (tasksRes.status === 401) return;

      const tasksData = await tasksRes.json().catch(() => null);
      if (!tasksRes.ok || !tasksData?.success) {
        setError(tasksData?.error ?? "Couldn't load your tasks.");
        return;
      }
      setTasks(tasksData.tasks);

      const usersData = await usersRes.json().catch(() => null);
      if (usersRes.ok && usersData?.success) setTeam(usersData.users ?? []);
    } catch {
      setError('Could not reach the server — check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    setActionError('');
    try {
      const response = await fetch('/api/admin/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          dueAt: newDueAt || null,
          assignedToId: newAssignee || undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setActionError(data?.error ?? "Couldn't add that task.");
        return;
      }
      setNewTitle('');
      setNewDueAt('');
      setNewAssignee('');
      setShowDetail(false);
      // Refetch rather than splicing: the create response carries no
      // assignee name or related label, and a half-populated row reads as
      // a bug.
      await load();
    } catch {
      setActionError('Could not reach the server — the task was not added.');
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (task: TaskItem) => {
    setActionError('');
    const snapshot = tasks;
    await withRollback({
      apply: () =>
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t))),
      revert: () => setTasks(snapshot),
      write: () =>
        fetch(`/api/admin/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ done: !task.done }),
        }),
      onError: setActionError,
    });
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setActionError('');
    try {
      const res = await fetch(`/api/admin/tasks/${pendingDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setActionError(body?.error ?? "Couldn't remove that task.");
        return;
      }
      setTasks((prev) => prev.filter((t) => t.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch {
      setActionError('Could not reach the server — nothing was removed.');
    } finally {
      setDeleting(false);
    }
  };

  const { pending, done, overdueCount } = useMemo(() => {
    const pendingTasks = tasks.filter((t) => !t.done);
    return {
      pending: pendingTasks,
      done: tasks.filter((t) => t.done),
      overdueCount: pendingTasks.filter((t) => dueState(t.dueAt) === 'overdue').length,
    };
  }, [tasks]);

  const inputClass =
    'px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors';

  const renderRow = (t: TaskItem) => {
    const state = dueState(t.dueAt);
    return (
      <div
        key={t.id}
        className={`group flex items-start gap-2 text-sm py-1.5 px-2 -mx-2 rounded-lg transition-colors ${
          t.done ? 'opacity-40' : state === 'overdue' ? 'bg-red-500/[0.07]' : ''
        }`}
      >
        <input
          id={`task-${t.id}`}
          type="checkbox"
          checked={t.done}
          onChange={() => handleToggle(t)}
          className="mt-1 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <label htmlFor={`task-${t.id}`} className={t.done ? 'line-through' : ''}>
            {t.title}
          </label>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px]">
            {t.dueAt && (
              <span
                className={
                  state === 'overdue'
                    ? 'text-red-300 font-semibold'
                    : state === 'today'
                    ? 'text-amber-300'
                    : 'text-white/35'
                }
              >
                {state === 'overdue' && <span aria-hidden="true">⚠ </span>}
                {formatDue(t.dueAt)}
              </span>
            )}
            {!t.assignedToMe && t.assigneeName && (
              <span className="text-purple-300/70">→ {t.assigneeName}</span>
            )}
            {t.relatedHref && t.relatedLabel && (
              <Link href={t.relatedHref} className="text-sky-300/70 hover:text-sky-300 truncate">
                {t.relatedLabel}
              </Link>
            )}
          </div>
        </div>
        <button
          onClick={() => setPendingDelete(t)}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-white/30 hover:text-red-300 text-xs transition-opacity shrink-0"
          aria-label={`Remove task: ${t.title}`}
        >
          remove
        </button>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-bold">My To-Dos</h2>
        {overdueCount > 0 && (
          <span className="text-xs font-semibold text-red-300">{overdueCount} overdue</span>
        )}
      </div>

      <div className="flex gap-2 mb-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Add a task..."
          aria-label="New task title"
          className={`flex-1 ${inputClass}`}
        />
        <button
          onClick={() => setShowDetail((v) => !v)}
          aria-expanded={showDetail}
          aria-label="Set due date and assignee"
          title="Due date and assignee"
          className="px-3 py-2 rounded-lg border border-white/15 text-white/50 hover:text-white text-sm transition-colors"
        >
          ⋯
        </button>
        <button
          onClick={handleAdd}
          disabled={adding || !newTitle.trim()}
          className="px-3 py-2 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 text-black text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          Add
        </button>
      </div>

      {showDetail && (
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <label className="flex-1">
            <span className="sr-only">Due date</span>
            <input
              type="date"
              value={newDueAt}
              onChange={(e) => setNewDueAt(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </label>
          <label className="flex-1">
            <span className="sr-only">Assign to</span>
            <select
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
              className={`w-full ${inputClass}`}
            >
              <option value="">Assign to me</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.email}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div role="alert" aria-live="polite">
        {actionError && <p className="text-xs text-red-400 mb-2">{actionError}</p>}
      </div>

      {loading ? (
        <p className="text-white/30 text-sm">Loading…</p>
      ) : error ? (
        <div className="py-3">
          <p className="text-sm text-red-400 mb-2">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              void load();
            }}
            className="text-xs font-semibold text-sky-300 hover:underline"
          >
            Try again
          </button>
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-white/30 text-sm">Nothing on your list — nice.</p>
      ) : (
        <div className="space-y-0.5 max-h-64 overflow-y-auto pr-1">
          {pending.map(renderRow)}
          {done.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-wide text-white/25 mt-3 mb-1">Done</p>
              {done.map(renderRow)}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title="Remove this task?"
        description={`"${pendingDelete?.title ?? ''}" will be deleted. This can't be undone.`}
        confirmLabel="Remove task"
        busy={deleting}
      />
    </div>
  );
}
