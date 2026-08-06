'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { inputClass } from '@/components/admin/ui';

/**
 * Deleting a project, with the friction the action deserves.
 *
 * Eleven tables cascade from that row — messages, updates, internal notes,
 * onboarding, instalments, payments, change orders, design feedback, the
 * design direction, the recurring offer. It is the whole record of an
 * engagement and it does not come back.
 *
 * So it is folded away rather than sitting on the page, it lists what will
 * go, and it asks for the company name typed out. A typed name is the one
 * confirmation that cannot be satisfied by clicking through on autopilot —
 * which is exactly the failure mode a red button with "Are you sure?" has.
 *
 * The server refuses outright if any payment is recorded. That check lives
 * there rather than here, because a guard the browser owns is a guard.
 */
export function DeleteProject({
  projectId,
  company,
  projectName,
}: {
  projectId: string;
  company: string;
  projectName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const matches = typed.trim().toLowerCase() === company.trim().toLowerCase();

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Could not delete it.');
        return;
      }
      router.push('/admin/projects');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-white/25 transition-colors hover:text-red-300"
      >
        Delete this project…
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-red-400/30 bg-red-400/[0.06] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-red-200">
        <AlertTriangle size={15} />
        Delete {projectName}?
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-white/60">
        This removes the project and everything on it — the message thread, every update the client
        has seen, internal notes, the onboarding answers, the instalment schedule, change orders and
        design feedback. It cannot be undone, and the client keeps no copy.
      </p>
      <p className="mt-2 text-xs text-white/40">
        A project with payments recorded against it cannot be deleted at all — those are an
        accounting record.
      </p>

      <label className="mt-3 block">
        <span className="mb-1.5 block text-xs text-white/50">
          Type <span className="font-semibold text-white/80">{company}</span> to confirm
        </span>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={company}
          autoComplete="off"
          className={`${inputClass} text-sm`}
        />
      </label>

      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={remove}
          disabled={!matches || busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/90 px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-30"
        >
          <Trash2 size={13} />
          {busy ? 'Deleting…' : 'Delete it permanently'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped('');
            setError('');
          }}
          className="rounded-lg border border-white/15 px-3.5 py-2 text-xs text-white/70 transition-colors hover:bg-white/5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
