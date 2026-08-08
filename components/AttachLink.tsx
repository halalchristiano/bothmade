'use client';

import { useState } from 'react';
import { Link2, Plus, X } from 'lucide-react';
import {
  describeAttachment,
  MAX_ATTACHMENTS,
  normalizeAttachmentUrl,
  suggestAttachmentName,
  type Attachment,
} from '@/lib/attachments';

/**
 * Attaching something to a message, without uploading it.
 *
 * The paperclip is gone. What it did — copy a file into our bucket, then send
 * the copy — bought a second version of a document that carries on being
 * edited somewhere else, and it was the part of chat that broke: a thread
 * stuck on "Uploading…" never sends the message either, so the sender walks
 * away thinking they said something.
 *
 * Paste the link instead. It is where the work already is, it stays current,
 * and it works the same on both sides of the conversation.
 *
 * The name is optional and guessed from the URL when it is left blank,
 * because the alternative — a required field between somebody and sending a
 * message — is a field that gets filled in with "doc".
 */
export function AttachLink({
  attachments,
  onChange,
  placeholder = 'Paste a link — a Google Doc, a Figma file, a Drive folder…',
  className = '',
}: {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const full = attachments.length >= MAX_ATTACHMENTS;

  const add = () => {
    const normalized = normalizeAttachmentUrl(url);
    if (!normalized) {
      setError('That does not look like a link. It needs to start with a web address.');
      return;
    }
    if (attachments.some((a) => a.url === normalized)) {
      setError('That one is already attached.');
      return;
    }
    onChange([
      ...attachments,
      { name: name.trim() || suggestAttachmentName(normalized), url: normalized },
    ]);
    setUrl('');
    setName('');
    setError('');
    setOpen(false);
  };

  return (
    <div className={className}>
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a, i) => {
            const meta = describeAttachment(a);
            return (
              <span
                key={`${a.url}-${i}`}
                className="flex max-w-full items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-xs"
              >
                <Link2 size={12} className="shrink-0 text-white/40" />
                <span className="min-w-0">
                  <span className="block max-w-[200px] truncate text-white/80">{a.name}</span>
                  <span className="block max-w-[200px] truncate text-[10px] text-white/35">
                    {meta.typeLabel}
                    {meta.host && ` · ${meta.host}`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onChange(attachments.filter((_, j) => j !== i))}
                  aria-label={`Remove ${a.name}`}
                  className="shrink-0 text-white/35 transition-colors hover:text-white"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {open ? (
        <div className="mb-2 rounded-xl border border-white/12 bg-white/[0.03] p-3">
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
              if (e.key === 'Escape') setOpen(false);
            }}
            autoFocus
            placeholder={placeholder}
            className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-sky-400/60 focus:outline-none"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
              if (e.key === 'Escape') setOpen(false);
            }}
            placeholder="What to call it (optional)"
            className="mt-2 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-sky-400/60 focus:outline-none"
          />
          {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={add}
              className="rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90"
            >
              Attach it
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError('');
              }}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={full}
          // `py-1` for the same reason as Logout in the portal header: 12px
          // text with no vertical padding measured 18px tall, and this is a
          // control a client presses on a phone to attach the brief they were
          // asked for.
          className="inline-flex items-center gap-1.5 py-1 text-xs text-white/40 transition-colors hover:text-white/80 disabled:opacity-40"
        >
          <Plus size={12} />
          {full ? `${MAX_ATTACHMENTS} is the limit` : 'Attach a link'}
        </button>
      )}
    </div>
  );
}

/**
 * The same thing as an icon, for a composer that is a single row of controls
 * and has no room for a text button beside the send key.
 */
export function AttachLinkButton({
  onAdd,
  disabled = false,
}: {
  onAdd: (attachment: Attachment) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const add = () => {
    const normalized = normalizeAttachmentUrl(url);
    if (!normalized) {
      setError('That does not look like a link.');
      return;
    }
    onAdd({ name: name.trim() || suggestAttachmentName(normalized), url: normalized });
    setUrl('');
    setName('');
    setError('');
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-label="Attach a link"
        title="Attach a link — a Google Doc, a Figma file, a Drive folder"
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-40 ${
          open
            ? 'border-sky-400/50 bg-sky-400/10 text-sky-300'
            : 'border-white/15 text-white/60 hover:bg-white/5 hover:text-white'
        }`}
      >
        <Link2 size={16} />
      </button>

      {open && (
        <div className="absolute bottom-12 left-0 z-20 w-[min(20rem,calc(100vw-3rem))] rounded-xl border border-white/12 bg-raised p-3 shadow-2xl">
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
              if (e.key === 'Escape') setOpen(false);
            }}
            autoFocus
            placeholder="Paste a link…"
            className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-sky-400/60 focus:outline-none"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
              if (e.key === 'Escape') setOpen(false);
            }}
            placeholder="What to call it (optional)"
            className="mt-2 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-sky-400/60 focus:outline-none"
          />
          {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}
          <button
            type="button"
            onClick={add}
            className="mt-2.5 w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90"
          >
            Attach it
          </button>
        </div>
      )}
    </div>
  );
}
