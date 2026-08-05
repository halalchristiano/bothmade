'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  DIRECTION_PROMPTS,
  MAX_ADJECTIVES,
  MAX_REFERENCES,
  MIN_REFERENCES,
} from '@/lib/design-direction';

/**
 * Ten minutes that save a fortnight.
 *
 * Nearly every expensive restart on a design project is a direction problem
 * discovered a week after the direction was set — and set, usually, from a
 * sentence on a call. This asks for it in writing, before anyone opens a
 * design tool, and the client signs it.
 *
 * Two things about the shape of it. It asks for the REASON beside every
 * reference, because a link on its own is unusable: two clients can send the
 * same site meaning opposite things by it, and the one who said "I like how
 * calm it is" wants something very different from the one who said "I like
 * the big photos". And it asks for three words, because those settle it when
 * the references disagree with each other, which they usually do.
 *
 * The signing statement names the consequence in both directions on purpose.
 * A signature is only worth having if the signer understood what it bought
 * them — and what it buys the client is the right to call a departure from
 * this brief our mistake, fixed free.
 */

interface Row {
  id: number;
  url: string;
  why: string;
}

let nextId = 1;
const blank = (): Row => ({ id: nextId++, url: '', why: '' });

export function DesignDirectionForm({
  projectId,
  statement,
  onSigned,
}: {
  projectId: string;
  statement: string;
  onSigned: () => void;
}) {
  const [likes, setLikes] = useState<Row[]>([blank(), blank()]);
  const [dislikes, setDislikes] = useState<Row[]>([blank()]);
  const [adjectives, setAdjectives] = useState<string[]>(['', '', '']);
  const [untouchable, setUntouchable] = useState('');
  const [hardNos, setHardNos] = useState('');
  const [notes, setNotes] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const field =
    'w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-sky-400/40 focus:outline-none';

  const patch = (
    set: typeof setLikes,
    id: number,
    changes: Partial<Row>
  ) => set((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));

  const remove = (set: typeof setLikes, id: number, floor: number) =>
    set((prev) => (prev.length <= floor ? prev : prev.filter((r) => r.id !== id)));

  const filled = (rows: Row[]) => rows.filter((r) => r.url.trim());
  const readyLikes = filled(likes).filter((r) => r.why.trim());
  const wordsDone = adjectives.filter((a) => a.trim()).length === MAX_ADJECTIVES;
  const canSign =
    !saving && agreed && signerName.trim().length > 1 && readyLikes.length >= MIN_REFERENCES && wordsDone;

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/design-direction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          likes: filled(likes).map((r) => ({ url: r.url.trim(), why: r.why.trim() })),
          dislikes: filled(dislikes).map((r) => ({ url: r.url.trim(), why: r.why.trim() })),
          adjectives: adjectives.map((a) => a.trim()).filter(Boolean),
          untouchable: untouchable.trim() || null,
          hardNos: hardNos.trim() || null,
          notes: notes.trim() || null,
          sign: true,
          signerName: signerName.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Something went wrong — try again in a moment.');
        return;
      }
      onSigned();
    } catch {
      setError('Something went wrong — try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  const refBlock = (
    rows: Row[],
    set: typeof setLikes,
    floor: number,
    prompt: { label: string; help: string },
    placeholder: string
  ) => (
    <div className="mt-6">
      <label className="block text-sm font-medium text-white/80">{prompt.label}</label>
      <p className="mb-2 mt-0.5 text-xs text-white/40">{prompt.help}</p>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <input
                value={row.url}
                onChange={(e) => patch(set, row.id, { url: e.target.value })}
                maxLength={300}
                placeholder={placeholder}
                className={field}
              />
              {row.url.trim() && (
                <input
                  value={row.why}
                  onChange={(e) => patch(set, row.id, { why: e.target.value })}
                  maxLength={500}
                  placeholder="What is it about this one?"
                  className={field}
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => remove(set, row.id, floor)}
              aria-label="Remove"
              className="h-9 shrink-0 rounded-lg border border-white/10 px-2 text-white/40 hover:bg-white/5 hover:text-white/70"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      {rows.length < MAX_REFERENCES && (
        <button
          type="button"
          onClick={() => set((prev) => [...prev, blank()])}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
        >
          <Plus size={12} />
          Add another
        </button>
      )}
    </div>
  );

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <h4 className="text-base font-semibold text-white">Before we design: what should it feel like?</h4>
      <p className="mt-1 text-sm text-white/50">
        About ten minutes, and it&apos;s the most useful ten minutes of the whole project. We build
        the first design to this — so if what we show you doesn&apos;t match what you write here,
        that&apos;s ours to put right at no charge.
      </p>

      {refBlock(likes, setLikes, 2, DIRECTION_PROMPTS.likes, 'e.g. stripe.com')}
      {refBlock(dislikes, setDislikes, 1, DIRECTION_PROMPTS.dislikes, "A site you'd hate us to copy")}

      <div className="mt-6">
        <label className="block text-sm font-medium text-white/80">
          {DIRECTION_PROMPTS.adjectives.label}
        </label>
        <p className="mb-2 mt-0.5 text-xs text-white/40">{DIRECTION_PROMPTS.adjectives.help}</p>
        <div className="flex flex-wrap gap-2">
          {adjectives.map((word, i) => (
            <input
              key={i}
              value={word}
              onChange={(e) =>
                setAdjectives((prev) => prev.map((w, j) => (j === i ? e.target.value : w)))
              }
              maxLength={40}
              placeholder={['calm', 'professional', 'warm'][i]}
              className={`${field} w-32 flex-none`}
            />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <label className="block text-sm font-medium text-white/80">
          {DIRECTION_PROMPTS.untouchable.label}
        </label>
        <p className="mb-2 mt-0.5 text-xs text-white/40">{DIRECTION_PROMPTS.untouchable.help}</p>
        <textarea
          value={untouchable}
          onChange={(e) => setUntouchable(e.target.value)}
          rows={2}
          maxLength={2000}
          className={field}
        />
      </div>

      <div className="mt-6">
        <label className="block text-sm font-medium text-white/80">
          {DIRECTION_PROMPTS.hardNos.label}
        </label>
        <p className="mb-2 mt-0.5 text-xs text-white/40">{DIRECTION_PROMPTS.hardNos.help}</p>
        <textarea
          value={hardNos}
          onChange={(e) => setHardNos(e.target.value)}
          rows={2}
          maxLength={2000}
          className={field}
        />
      </div>

      <div className="mt-6">
        <label className="mb-2 block text-sm font-medium text-white/80">Anything else?</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={2000}
          className={field}
        />
      </div>

      {/* The affirmative act. The sentence comes from the server, so what the
          record says they agreed to is never something the browser supplied. */}
      <div className="mt-7 rounded-xl border border-sky-400/25 bg-sky-400/[0.05] p-4">
        <label className="flex cursor-pointer gap-2.5">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 shrink-0 accent-sky-400"
          />
          <span className="text-sm leading-relaxed text-white/75">{statement}</span>
        </label>
        <input
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          maxLength={120}
          placeholder="Type your full name"
          className={`${field} mt-3`}
        />
      </div>

      {!wordsDone && <p className="mt-3 text-xs text-amber-300/80">All three words, please.</p>}
      {readyLikes.length < MIN_REFERENCES && (
        <p className="mt-2 text-xs text-amber-300/80">
          At least {MIN_REFERENCES} sites you like, each with a line on why.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={!canSign}
        className="mt-4 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Agree the direction'}
      </button>
    </div>
  );
}
