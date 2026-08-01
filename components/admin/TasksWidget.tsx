'use client';

import { useEffect, useState } from 'react';

interface TaskItem {
  id: string;
  title: string;
  done: boolean;
  dueAt: string | null;
}

export function TasksWidget() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

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
  }, []);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const response = await fetch('/api/admin/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      const data = await response.json();
      if (data.success) {
        setTasks((prev) => [data.task, ...prev]);
        setNewTitle('');
      }
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (task: TaskItem) => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
    await fetch(`/api/admin/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !task.done }),
    });
  };

  const handleDelete = async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    await fetch(`/api/admin/tasks/${taskId}`, { method: 'DELETE' });
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
