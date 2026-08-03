'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Plus } from 'lucide-react';
import { ConfirmDialog } from '@/components/admin/Modal';
import { withRollback } from '@/components/admin/useAsyncData';
import { PROJECT_STAGES, PROJECT_STAGE_LABELS } from '@/lib/project-status';

interface Milestone {
  id: string;
  title: string;
  stage: string;
  dueAt: string;
  completedAt: string | null;
  wasLate: boolean;
  overdue: boolean;
  daysUntilDue: number;
}

function dueLabel(m: Milestone): { text: string; tone: string } {
  if (m.completedAt) {
    return m.wasLate
      ? { text: 'done, late', tone: 'text-amber-300/80' }
      : { text: 'done on time', tone: 'text-emerald-300/80' };
  }
  if (m.overdue) {
    const days = Math.abs(m.daysUntilDue);
    return { text: `${days}d overdue`, tone: 'text-red-300 font-semibold' };
  }
  if (m.daysUntilDue === 0) return { text: 'due today', tone: 'text-amber-300' };
  if (m.daysUntilDue === 1) return { text: 'due tomorrow', tone: 'text-white/50' };
  return { text: `due in ${m.daysUntilDue}d`, tone: 'text-white/40' };
}

/**
 * Dated milestones on a project.
 *
 * The only date a project carried was one estimatedCompletionDate for the
 * whole engagement, so lateness could only be judged at the very end —
 * which is exactly too late to do anything about it. Per-milestone dates
 * let a slip surface in week two, and they are what the on-time rate on the
 * analytics page is computed from.
 */
export function MilestonesPanel({ projectId }: { projectId: string }) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [stage, setStage] = useState<string>('build');
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Milestone | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setError('');
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/milestones`);
      if (res.status === 401) return;
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error ?? "Couldn't load milestones.");
        return;
      }
      setMilestones(data.milestones);
    } catch {
      setError('Could not reach the server — check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleAdd = async () => {
    setSaving(true);
    setActionError('');
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, dueAt, stage }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setActionError(data?.error ?? "Couldn't add that milestone.");
        return;
      }
      setTitle('');
      setDueAt('');
      setAdding(false);
      await load();
    } catch {
      setActionError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (m: Milestone) => {
    setActionError('');
    const snapshot = milestones;
    await withRollback({
      apply: () =>
        setMilestones((prev) =>
          prev.map((x) =>
            x.id === m.id
              ? { ...x, completedAt: x.completedAt ? null : new Date().toISOString() }
              : x
          )
        ),
      revert: () => setMilestones(snapshot),
      write: () =>
        fetch(`/api/admin/projects/${projectId}/milestones`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: m.id, completed: !m.completedAt }),
        }),
      onError: setActionError,
    });
    // Refetch so wasLate and the derived labels come from the server rather
    // than being guessed locally — the whole point of stamping it there.
    await load();
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/milestones?id=${pendingDelete.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setActionError(body?.error ?? "Couldn't remove that.");
        return;
      }
      setPendingDelete(null);
      await load();
    } catch {
      setActionError('Could not reach the server.');
    } finally {
      setDeleting(false);
    }
  };

  const inputClass =
    'px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/60 transition-colors';

  const outstanding = milestones.filter((m) => !m.completedAt);
  const overdueCount = outstanding.filter((m) => m.overdue).length;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <CalendarClock size={17} /> Milestones
        </h2>
        {overdueCount > 0 && (
          <span className="text-xs font-semibold text-red-300">{overdueCount} overdue</span>
        )}
      </div>

      <div role="alert" aria-live="polite">
        {actionError && <p className="mb-2 text-xs text-red-400">{actionError}</p>}
      </div>

      {loading ? (
        <p className="text-sm text-white/30">Loading…</p>
      ) : error ? (
        <div>
          <p className="mb-2 text-sm text-red-400">{error}</p>
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
      ) : milestones.length === 0 ? (
        <p className="text-sm text-white/40">
          Nothing dated yet. Add the dates you&apos;ve actually promised — that&apos;s what makes
          &ldquo;late&rdquo; mean something before the end of the project.
        </p>
      ) : (
        <div className="space-y-1">
          {milestones.map((m) => {
            const label = dueLabel(m);
            return (
              <div
                key={m.id}
                className={`group flex items-start gap-2 rounded-lg px-2 py-1.5 -mx-2 text-sm transition-colors ${
                  m.completedAt ? 'opacity-45' : m.overdue ? 'bg-red-500/[0.07]' : ''
                }`}
              >
                <input
                  id={`ms-${m.id}`}
                  type="checkbox"
                  checked={Boolean(m.completedAt)}
                  onChange={() => toggle(m)}
                  className="mt-1 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`ms-${m.id}`}
                    className={m.completedAt ? 'line-through' : ''}
                  >
                    {m.title}
                  </label>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                    <span className="text-white/30">
                      {PROJECT_STAGE_LABELS[m.stage as keyof typeof PROJECT_STAGE_LABELS] ?? m.stage}
                    </span>
                    <span className={label.tone}>{label.text}</span>
                    <span className="text-white/25">
                      {new Date(m.dueAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setPendingDelete(m)}
                  aria-label={`Remove milestone: ${m.title}`}
                  className="shrink-0 text-xs text-white/25 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100 focus:opacity-100"
                >
                  remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {adding ? (
        <div className="mt-4 space-y-2 rounded-xl border border-white/10 p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's being delivered?"
            aria-label="Milestone title"
            className={`w-full ${inputClass}`}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex-1">
              <span className="sr-only">Due date</span>
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className={`w-full ${inputClass}`}
              />
            </label>
            <label className="flex-1">
              <span className="sr-only">Stage</span>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className={`w-full ${inputClass}`}
              >
                {PROJECT_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setAdding(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-white/50 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !title.trim() || !dueAt}
              className="rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-2 text-sm font-semibold text-white/55 transition-colors hover:border-white/30 hover:text-white"
        >
          <Plus size={14} /> Add a milestone
        </button>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title="Remove this milestone?"
        description={`"${pendingDelete?.title ?? ''}" will be deleted, along with its record of whether it was hit on time.`}
        confirmLabel="Remove"
        busy={deleting}
      />
    </div>
  );
}
