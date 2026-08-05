'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { FEEDBACK_KINDS, type FeedbackKind } from '@/lib/design-feedback';

/**
 * "Not yet" — with reasons, sorted.
 *
 * The counterpart to the approve button. Until now a client who did not like
 * the design had one option: write a paragraph in the message box. A
 * paragraph is precisely the thing the studio cannot act on — it arrives as
 * an undifferentiated list of opinions with no way to tell what genuinely
 * isn't what was agreed from what is simply a preference, and those two cost
 * completely different things under the agreement.
 *
 * So the form makes the sorting happen while they write, in their own words.
 * Three things about how it is built are deliberate:
 *
 * WHAT'S WORKING COMES FIRST. Partly because the next version is better for
 * knowing what not to throw away, and partly because a form that opens with
 * "what's wrong?" produces a longer list of wrongs than one that doesn't.
 *
 * THE FREE OPTION IS LISTED FIRST. "It doesn't match what we agreed" is the
 * cheapest bucket for the client and the one they are least likely to think
 * of unprompted. A form that leads with "I'd like it changed" quietly pushes
 * free corrections into the paid allowance, which would be a way of using
 * good UI to take money.
 *
 * THE ROUND COUNT IS ON SCREEN. People prioritise when they can see the
 * budget, and nobody is ambushed later by a round they did not know they had
 * spent.
 *
 * Nothing here mentions a price. Whether new scope is absorbed or quoted is a
 * judgement about the relationship, so the studio is told and the client is
 * not pre-billed by software.
 */

interface Row {
  id: number;
  area: string;
  kind: FeedbackKind | '';
  detail: string;
}

let nextRowId = 1;
const blankRow = (): Row => ({ id: nextRowId++, area: '', kind: '', detail: '' });

export function DesignFeedbackForm({
  projectId,
  revisionLine,
  onDone,
  onCancel,
}: {
  projectId: string;
  /** "This is revision 1 of the 2 included in your project." */
  revisionLine: string;
  onDone: (acknowledgement: string) => void;
  onCancel: () => void;
}) {
  const [liked, setLiked] = useState('');
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const patch = (id: number, changes: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));

  const removeRow = (id: number) =>
    setRows((prev) => (prev.length === 1 ? [blankRow()] : prev.filter((r) => r.id !== id)));

  // A row is only worth sending once it says something AND says what kind of
  // something it is — the sorting is the entire point of the form.
  const filled = rows.filter((r) => r.detail.trim());
  const unsorted = filled.filter((r) => !r.kind);
  const canSubmit = !saving && (filled.length > 0 || note.trim().length > 0) && unsorted.length === 0;

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/design-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          liked: liked.trim() || null,
          note: note.trim() || null,
          items: filled.map((r) => ({ area: r.area.trim(), kind: r.kind, detail: r.detail.trim() })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Something went wrong — try again in a moment.');
        return;
      }
      onDone(data?.acknowledgement || "Thanks — we've got your notes.");
    } catch {
      setError('Something went wrong — try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  const field =
    'w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-sky-400/40 focus:outline-none';

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-4">
        <h4 className="text-base font-semibold text-white">Tell us what you&apos;d like changed</h4>
        <p className="mt-1 text-sm text-white/50">
          The more specific you are, the closer the next version will be. {revisionLine}
        </p>
      </div>

      <label className="mb-1.5 block text-sm font-medium text-white/80">
        First — what&apos;s working?
      </label>
      <p className="mb-2 text-xs text-white/40">
        Genuinely useful. It tells us what not to change while we&apos;re changing everything else.
      </p>
      <textarea
        value={liked}
        onChange={(e) => setLiked(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="e.g. The colours are spot on, and the homepage layout feels right"
        className={field}
      />

      <div className="mb-2 mt-6 flex items-baseline justify-between gap-3">
        <label className="block text-sm font-medium text-white/80">
          Now — what would you like changed?
        </label>
        <span className="text-xs text-white/35">One note per thing</span>
      </div>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={row.id} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-bold text-white/50">
                {index + 1}
              </span>
              <input
                value={row.area}
                onChange={(e) => patch(row.id, { area: e.target.value })}
                maxLength={120}
                placeholder="Which part? e.g. the homepage hero"
                className={`${field} flex-1`}
              />
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                aria-label="Remove this note"
                className="shrink-0 rounded-lg border border-white/10 p-2 text-white/40 hover:bg-white/5 hover:text-white/70"
              >
                <X size={14} />
              </button>
            </div>

            <textarea
              value={row.detail}
              onChange={(e) => patch(row.id, { detail: e.target.value })}
              rows={2}
              maxLength={2000}
              placeholder="What would you like instead?"
              className={field}
            />

            {/* The sorting. Only asked for once there is something to sort —
                three radio buttons above an empty box is a form nobody
                starts. */}
            {row.detail.trim() && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-medium text-white/50">Which of these is it?</p>
                {FEEDBACK_KINDS.map((spec) => (
                  <label
                    key={spec.kind}
                    className={`flex cursor-pointer gap-2.5 rounded-lg border p-2.5 transition-colors ${
                      row.kind === spec.kind
                        ? 'border-sky-400/40 bg-sky-400/[0.07]'
                        : 'border-white/[0.07] hover:bg-white/[0.02]'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`kind-${row.id}`}
                      checked={row.kind === spec.kind}
                      onChange={() => patch(row.id, { kind: spec.kind })}
                      className="mt-0.5 shrink-0 accent-sky-400"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-white/85">{spec.label}</span>
                      <span className="block text-xs text-white/40">{spec.help}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, blankRow()])}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
      >
        <Plus size={12} />
        Add another note
      </button>

      <label className="mb-1.5 mt-6 block text-sm font-medium text-white/80">
        Anything else?
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="Anything that didn't fit above — or ask us to call, if it's easier to talk through"
        className={field}
      />

      {unsorted.length > 0 && (
        <p className="mt-4 text-xs text-amber-300/80">
          {unsorted.length === 1
            ? 'One of your notes still needs you to pick which kind it is.'
            : `${unsorted.length} of your notes still need you to pick which kind they are.`}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? 'Sending…' : 'Send this to Bothmade'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-white/50 hover:text-white/80"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
