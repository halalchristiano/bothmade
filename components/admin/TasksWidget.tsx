'use client';

import { useEffect, useState } from 'react';

interface TaskItem {
  id: string;
  title: string;
  done: boolean;
  dueAt: string | null;
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
        body: JSON.stringify({ title: newTitle }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.success) {
        setTasks((prev) => [data.task, ...prev]);
        setNewTitle('');
      } else {
        // The title stays in the box on purpose — it is the only copy.
        setError("Couldn't save that task — try again.");
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
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
      <h2 className="text-lg font-bold mb-4">My To-Dos</h2>

      <div className="flex gap-2 mb-4">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Add a task..."
          className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newTitle.trim()}
          className="px-3 py-2 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 text-black text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          Add
        </button>
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
            <label key={t.id} className="flex items-center gap-2 group text-sm py-1">
              <input type="checkbox" checked={t.done} onChange={() => handleToggle(t)} />
              <span className="flex-1">{t.title}</span>
              <button
                onClick={() => handleDelete(t.id)}
                className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-300 text-xs transition-opacity"
              >
                remove
              </button>
            </label>
          ))}
          {done.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-wide text-white/25 mt-3 mb-1">Done</p>
              {done.map((t) => (
                <label key={t.id} className="flex items-center gap-2 group text-sm py-1 opacity-40">
                  <input type="checkbox" checked={t.done} onChange={() => handleToggle(t)} />
                  <span className="flex-1 line-through">{t.title}</span>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-300 text-xs transition-opacity"
                  >
                    remove
                  </button>
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
