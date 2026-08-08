'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { BrandButton, inputClass } from '@/components/admin/ui';
import { bulkDeletePhrase, matchesBulkDeletePhrase } from '@/lib/deletion-guards';

interface Selected {
  id: string;
  company: string;
  name: string;
}

interface Blocked {
  company: string;
  name: string;
  reason: string;
}

/**
 * The bar that appears once projects are ticked, and the confirmation it asks
 * for before deleting them.
 *
 * A single delete asks for the company name typed out. That does not carry
 * over: across six companies, typing one of the six names proves nothing
 * about the other five. So the phrase carries the count — "delete 6 projects"
 * — which cannot be typed ahead of the selection and, more usefully, stops
 * matching the moment the selection changes. Tick a seventh row after typing
 * and the button disarms rather than quietly taking the extra one.
 *
 * The list of what is about to go is spelled out above the field rather than
 * summarised as a number, because "6 projects" is not something anyone can
 * check and six company names is.
 */
export function BulkDeleteProjects({
  selected,
  onClear,
  onDeleted,
}: {
  selected: Selected[];
  onClear: () => void;
  onDeleted: () => void;
}) {
  const [arming, setArming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState<Blocked[]>([]);

  const phrase = bulkDeletePhrase(selected.length);
  const matches = matchesBulkDeletePhrase(typed, selected.length);

  // A phrase typed for a different selection is stale the moment the
  // selection moves, and leaving it in the box makes a disabled button look
  // broken rather than deliberate.
  useEffect(() => {
    setTyped('');
    setError('');
  }, [selected.length]);

  const remove = async () => {
    setBusy(true);
    setError('');
    setBlocked([]);
    try {
      const res = await fetch('/api/admin/projects/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectIds: selected.map((p) => p.id), confirm: typed.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Could not delete those projects.');
        setBlocked(data?.blocked ?? []);
        return;
      }
      // Anything the server refused is reported here rather than vanishing
      // with the panel — a project that was ticked and is still there needs
      // to say why, or it reads as a delete that half worked.
      setBlocked(data?.blocked ?? []);
      setArming(false);
      setTyped('');
      onDeleted();
    } catch {
      setError('Could not reach the server — nothing was deleted.');
    } finally {
      setBusy(false);
    }
  };

  if (selected.length === 0 && blocked.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-sky-400/20 bg-sky-400/[0.05] p-4">
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm">
            <strong className="text-sky-300">{selected.length}</strong> selected
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                onClear();
                setArming(false);
                setError('');
              }}
              className="text-xs text-white/40 transition-colors hover:text-white"
            >
              Clear
            </button>
            {!arming && (
              <BrandButton
                variant="danger"
                onClick={() => setArming(true)}
                className="inline-flex items-center gap-2"
              >
                <Trash2 size={14} />
                Delete selected
              </BrandButton>
            )}
          </div>
        </div>
      )}

      {arming && selected.length > 0 && (
        <div className="mt-3 rounded-xl border border-red-400/30 bg-red-400/[0.06] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-200">
            <AlertTriangle size={15} />
            Delete {selected.length} project{selected.length === 1 ? '' : 's'}?
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-white/60">
            This removes each one and everything on it — the message thread, every update the client
            has seen, internal notes, onboarding answers, the instalment schedule, change orders and
            design feedback. It cannot be undone. Any project with payments or invoices against it is
            left alone and named below.
          </p>

          <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs text-white/70">
            {selected.map((p) => (
              <li key={p.id} className="truncate">
                <span className="font-medium text-white/85">{p.company}</span>
                <span className="text-white/35"> — {p.name}</span>
              </li>
            ))}
          </ul>

          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs text-white/50">
              Type <span className="font-semibold text-white/80">{phrase}</span> to confirm
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={phrase}
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
              {busy ? 'Deleting…' : 'Delete them permanently'}
            </button>
            <button
              type="button"
              onClick={() => {
                setArming(false);
                setTyped('');
                setError('');
              }}
              className="rounded-lg border border-white/15 px-3.5 py-2 text-xs text-white/70 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {blocked.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3">
          <p className="text-xs font-semibold text-amber-200">
            Left alone — payments and invoices are accounting records
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-white/60">
            {blocked.map((b) => (
              <li key={`${b.company}-${b.name}`} className="truncate">
                <span className="text-white/80">{b.company}</span> — {b.name}{' '}
                <span className="text-amber-200/80">({b.reason})</span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => setBlocked([])}
            className="mt-2 text-xs text-white/40 transition-colors hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
