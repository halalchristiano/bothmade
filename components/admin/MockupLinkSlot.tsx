'use client';

import { useEffect, useState } from 'react';
import { Check, Eye, FolderOpen, Pencil } from 'lucide-react';
import { describeUrlProblem } from '@/lib/html';

/**
 * One of the two mockup links, with what it is for written next to it.
 *
 * A lead used to have a single mockup field, and both links went into it —
 * the Vercel preview and, sometimes, the folder. The lead page then offered
 * whatever was in there under a button reading "open the mockup we sent",
 * and the email composer pre-filled the same value as the link to send. On a
 * lead where the preview had gone in, that meant a client being sent a
 * password-protected deployment for a mockup nobody had sent them.
 *
 * Two slots, each saying which it is and what happens to it, is the fix. The
 * `tone` is not decoration: it is the difference between the link that goes
 * to a client and the link that must never leave the building.
 */
export function MockupLinkSlot({
  leadId,
  field,
  value,
  label,
  hint,
  placeholder,
  tone,
  onSaved,
}: {
  leadId: string;
  field: 'mockupFolderUrl' | 'mockupUrl';
  value: string | null;
  label: string;
  hint: string;
  placeholder: string;
  /** `send` goes to the client. `internal` never does. */
  tone: 'send' | 'internal';
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // A save elsewhere on the page reloads the lead; the box should follow it
  // rather than keep showing what was typed three minutes ago.
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  const problem = draft.trim() ? describeUrlProblem(draft) : null;
  const Icon = tone === 'send' ? FolderOpen : Eye;
  const accent =
    tone === 'send'
      ? { border: 'border-purple-400/25', text: 'text-purple-300', chip: 'bg-purple-400/15 text-purple-200' }
      : { border: 'border-white/10', text: 'text-white/70', chip: 'bg-white/[0.06] text-white/50' };

  const save = async () => {
    if (problem) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: draft.trim() }),
      });
      if (!res.ok) {
        setError("Couldn't save that — try again.");
        return;
      }
      setEditing(false);
      onSaved();
    } catch {
      setError('Could not reach the server — try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-xl border ${accent.border} bg-white/[0.02] p-3.5`}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className={`flex items-center gap-1.5 text-sm font-semibold ${accent.text}`}>
          <Icon size={14} /> {label}
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${accent.chip}`}>
          {tone === 'send' ? 'Sent to client' : 'Never sent'}
        </span>
      </div>
      <p className="text-xs text-white/40 mb-3 leading-relaxed">{hint}</p>

      {editing || !value ? (
        <div className="space-y-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder={placeholder}
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none"
          />
          {(problem || error) && <p className="text-xs text-amber-300">{problem || error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving || !draft.trim() || Boolean(problem)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/5 disabled:opacity-40 transition-colors"
            >
              <Check size={12} /> {saving ? 'Saving…' : 'Save'}
            </button>
            {value && (
              <button
                onClick={() => {
                  setDraft(value);
                  setEditing(false);
                  setError('');
                }}
                className="text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 truncate rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 hover:bg-white/[0.07] transition-colors"
          >
            {value.replace(/^https?:\/\//, '')}
          </a>
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-2 text-xs text-white/60 hover:bg-white/5 transition-colors"
          >
            <Pencil size={12} /> Edit
          </button>
        </div>
      )}
    </div>
  );
}
