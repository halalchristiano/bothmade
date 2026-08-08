'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { upload } from '@vercel/blob/client';
import { Eye, ExternalLink, ImageIcon, Paperclip, PlayCircle, Send, StickyNote, Upload, Clock } from 'lucide-react';
import { mockupSignal, type LeadMockupDTO, type MockupStatus, mockupLinkExpiringSoon } from '@/lib/mockups';
import {
  DELIVERABLE_CONTENT_TYPES,
  DELIVERABLE_MAX_BYTES,
  MULTIPART_THRESHOLD_BYTES,
  VIDEO_CONTENT_TYPES,
  checkUpload,
  contentTypeForFile,
  formatFileSize,
} from '@/lib/uploads';
import { uploadFileInParts } from '@/lib/chunked-upload';

/**
 * Every mockup sent to one lead, as a row of buttons — "Mockup 1", the date
 * and time it landed, and the notes taken against that version.
 *
 * A deal gets more than one mockup. The single link the lead used to carry
 * meant version two overwrote version one, so on a call there was no way to
 * open the version the client had actually seen, and nowhere to write down
 * what they said about it. Each version is now its own button and its own
 * notepad, and attaching the next one is a paste or a file away.
 */

export interface LeadMockupItem {
  id: string;
  url: string;
  fileName: string | null;
  note: string;
  uploadedAt: string;
  uploadedByName: string | null;
  // The lifecycle. Optional so a payload from before mockups had one still
  // renders — it just renders as a mockup nobody has sent yet, which is what
  // an untracked mockup honestly is.
  status?: MockupStatus;
  shareToken?: string;
  sentAt?: string | null;
  firstViewedAt?: string | null;
  lastViewedAt?: string | null;
  viewCount?: number;
  expiresAt?: string | null;
  expired?: boolean;
  /** Times a client hit this link after it had already died. */
  expiredViewCount?: number;
  lastExpiredViewAt?: string | null;
  respondedAt?: string | null;
  responseNote?: string | null;
  /** Set when the last send failed — the link is live, the email is not. */
  sendFailedAt?: string | null;
  sendFailedReason?: string | null;
}

/** How each status reads on screen, and what it should look like. */
const STATUS_STYLE: Record<MockupStatus, { label: string; classes: string }> = {
  draft: { label: 'Not sent', classes: 'border-white/15 bg-white/[0.04] text-white/50' },
  sent: { label: 'Sent', classes: 'border-sky-400/30 bg-sky-400/10 text-sky-200' },
  viewed: { label: 'Opened', classes: 'border-purple-400/30 bg-purple-400/10 text-purple-200' },
  approved: { label: 'Approved', classes: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200' },
  changes_requested: { label: 'Changes asked', classes: 'border-amber-400/30 bg-amber-400/10 text-amber-200' },
};

function asDTO(m: LeadMockupItem): LeadMockupDTO {
  return {
    id: m.id,
    url: m.url,
    fileName: m.fileName,
    note: m.note,
    uploadedAt: m.uploadedAt,
    uploadedByName: m.uploadedByName,
    status: m.status ?? 'draft',
    shareToken: m.shareToken ?? '',
    sentAt: m.sentAt ?? null,
    firstViewedAt: m.firstViewedAt ?? null,
    lastViewedAt: m.lastViewedAt ?? null,
    viewCount: m.viewCount ?? 0,
    expiresAt: m.expiresAt ?? null,
    expired: m.expired ?? false,
    // Recomputed rather than trusted from the payload: this list is rendered
    // from a lead page that may have been open for an hour, and "about to
    // expire" goes stale in a way "expired" does not.
    expiringSoon: mockupLinkExpiringSoon({ expiresAt: m.expiresAt ?? null }),
    expiredViewCount: m.expiredViewCount ?? 0,
    lastExpiredViewAt: m.lastExpiredViewAt ?? null,
    respondedAt: m.respondedAt ?? null,
    responseNote: m.responseNote ?? null,
    sendFailedAt: m.sendFailedAt ?? null,
    sendFailedReason: m.sendFailedReason ?? null,
  };
}

/** "Aug 2, 2026, 2:14 PM" — the date on its own isn't enough when two versions land the same day. */
export function formatUploadedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Old rows predate any validation, so a link that can't be opened is shown, not linked. */
function isOpenable(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * A walkthrough recording and a flat PNG are both "mockup 2", and the row
 * gives no clue which is which — worth knowing before clicking it on a call
 * with the client on the line.
 */
function isVideo(fileName: string | null, url: string): boolean {
  const type = contentTypeForFile(fileName || url.split('?')[0] || '', '');
  return type !== null && VIDEO_CONTENT_TYPES.includes(type);
}

/** The policy the token route enforces, applied here so it's known up front. */
const MOCKUP_UPLOAD_POLICY = {
  allowed: DELIVERABLE_CONTENT_TYPES,
  maxBytes: DELIVERABLE_MAX_BYTES,
};

/** What the picker offers — spelled out so video isn't greyed out on a phone. */
const MOCKUP_ACCEPT = [...VIDEO_CONTENT_TYPES, 'image/*', 'application/pdf', '.mov', '.mkv'].join(',');

/** No progress for this long and the connection has almost certainly gone. */
const STALLED_AFTER_MS = 45_000;

interface UploadState {
  name: string;
  loaded: number;
  total: number;
  percent: number;
  stalled: boolean;
}

/**
 * Holds the screen awake for the length of the upload.
 *
 * This is the difference between a phone upload finishing and not. A
 * 300MB recording takes minutes; the screen locks after one, Safari
 * suspends the tab behind it, and the upload stops where it stood. Nothing
 * about that is reported as a failure — the tab comes back to a progress
 * bar that hasn't moved, which is exactly what "it's not letting me upload"
 * looks like from the outside.
 *
 * Not supported everywhere, and no reason to care when it isn't: the upload
 * runs either way, it just wants the screen not to lock under it.
 */
async function keepScreenAwake(): Promise<{ release: () => void }> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return { release: () => {} };
  }
  try {
    const sentinel = await navigator.wakeLock.request('screen');
    return { release: () => void sentinel.release().catch(() => {}) };
  } catch {
    // Denied, or the tab wasn't visible when we asked. Upload anyway.
    return { release: () => {} };
  }
}

function MockupRow({
  mockup,
  index,
  leadId,
  onNoteSaved,
  onSent,
}: {
  mockup: LeadMockupItem;
  index: number;
  leadId: string;
  onNoteSaved: (note: string) => void;
  onSent?: (mockup: LeadMockupItem) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendNotice, setSendNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [note, setNote] = useState(mockup.note);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // A note saved elsewhere (another tab, the lead page) shouldn't be clobbered
  // by stale state here — but never overwrite what's being typed right now.
  useEffect(() => {
    if (!notesOpen) setNote(mockup.note);
  }, [mockup.note, notesOpen]);

  const handleSaveNote = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/mockups/${mockup.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        setError("Couldn't save that note — try again.");
        return;
      }
      onNoteSaved(note);
      setSaved(true);
    } catch {
      setError('Could not reach the server — check your connection.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Send it, on a link the studio can see through. Replaces the old ritual of
   * copying a URL into an email nobody logged — which is why "have they even
   * looked at it?" was unanswerable.
   */
  const handleSend = async () => {
    setSending(true);
    setSendNotice(null);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/mockups/${mockup.id}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setSendNotice({ tone: 'warn', text: data.error || 'Could not send it.' });
        return;
      }
      onSent?.({ ...mockup, ...data.mockup });
      setSendNotice(
        data.sent
          ? { tone: 'ok', text: 'Sent. You will see it here when they open it.' }
          : { tone: 'warn', text: `Link is ready but the email did not send${data.reason ? ` — ${data.reason}` : ''}. Copy it and send it yourself.` }
      );
    } catch {
      setSendNotice({ tone: 'warn', text: 'Could not reach the server — try again.' });
    } finally {
      setSending(false);
    }
  };

  const status: MockupStatus = mockup.status ?? 'draft';
  // A send that failed overrides the badge. The row says "sent" — it is
  // stamped before the send, so the tracked link works — and a badge that
  // agreed with it would be the only thing on screen still claiming this
  // reached anybody.
  const style = mockup.sendFailedAt
    ? { label: 'Failed to send', classes: 'border-red-400/40 bg-red-400/10 text-red-200' }
    : STATUS_STYLE[status];
  const signal = mockupSignal(asDTO(mockup));
  const trackedUrl = mockup.shareToken
    ? `${typeof window === 'undefined' ? '' : window.location.origin}/m/${mockup.shareToken}`
    : null;

  const label = `Mockup ${index}`;
  const uploadedAt = formatUploadedAt(mockup.uploadedAt);
  const video = isVideo(mockup.fileName, mockup.url);
  const RowIcon = video ? PlayCircle : ImageIcon;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {isOpenable(mockup.url) ? (
          <a
            href={mockup.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-400/20 transition-colors"
          >
            <RowIcon size={14} className="shrink-0" />
            <span className="truncate">{video ? `${label} (video)` : label}</span>
            <ExternalLink size={11} className="shrink-0 opacity-60" />
          </a>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/50">
            <RowIcon size={14} /> {label} — link can&apos;t be opened
          </span>
        )}

        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${style.classes}`}
        >
          {status === 'viewed' && <Eye size={10} />}
          {style.label}
        </span>

        <span className="text-xs text-white/40">
          {uploadedAt ? `Uploaded ${uploadedAt}` : 'Uploaded'}
          {mockup.uploadedByName ? ` · ${mockup.uploadedByName}` : ''}
          {mockup.fileName ? ` · ${mockup.fileName}` : ''}
        </span>

        <button
          type="button"
          onClick={() => setNotesOpen((v) => !v)}
          aria-expanded={notesOpen}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
            mockup.note.trim()
              ? 'border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20'
              : 'border-white/15 text-white/50 hover:bg-white/5'
          }`}
        >
          <StickyNote size={12} />
          {mockup.note.trim() ? `Notes on ${label.toLowerCase()}` : `Add notes to ${label.toLowerCase()}`}
        </button>
      </div>

      {/* The one line that changes what the rep does next: opened four times
          today is a reason to ring now, sent six days ago and never opened is
          a reason to try another channel. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`text-xs ${
            mockup.viewCount && mockup.viewCount > 0 ? 'text-purple-200/90 font-medium' : 'text-white/40'
          }`}
        >
          {signal}
        </span>

        {(status === 'draft' || mockup.expired) && (
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            <Send size={12} />
            {sending ? 'Sending…' : mockup.expired ? 'Re-send to client' : 'Send to client'}
          </button>
        )}

        {trackedUrl && status !== 'draft' && (
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(trackedUrl)}
            title="Copy the tracked link"
            className="ml-auto rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/60 hover:bg-white/5 transition-colors"
          >
            Copy tracked link
          </button>
        )}
      </div>

      {mockup.responseNote && (
        <p className="mt-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs italic leading-relaxed text-white/70">
          &ldquo;{mockup.responseNote}&rdquo;
          <span className="not-italic text-white/30"> — the client</span>
        </p>
      )}

      {sendNotice && (
        <p className={`mt-2 text-xs ${sendNotice.tone === 'ok' ? 'text-emerald-300' : 'text-amber-300'}`}>
          {sendNotice.text}
        </p>
      )}

      {/* The note is the point of keeping versions apart — show it without a click. */}
      {!notesOpen && mockup.note.trim() && (
        <p className="mt-2 text-xs leading-relaxed text-white/60 whitespace-pre-wrap break-words">
          {mockup.note}
        </p>
      )}

      {notesOpen && (
        <div className="mt-2">
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setSaved(false);
            }}
            rows={3}
            aria-label={`Notes on ${label.toLowerCase()}`}
            placeholder="What you showed them, what came back, what to change next time..."
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveNote}
              disabled={saving}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {saving ? 'Saving...' : 'Save notes'}
            </button>
            <button
              type="button"
              onClick={() => {
                setNote(mockup.note);
                setNotesOpen(false);
              }}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 hover:bg-white/5 transition-colors"
            >
              Close
            </button>
            {saved && <span className="text-xs text-emerald-300">Saved</span>}
          </div>
          {error && (
            <p role="alert" className="mt-1.5 text-xs text-red-300">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function MockupAttachments({
  leadId,
  mockups,
  onChanged,
}: {
  leadId: string;
  mockups: LeadMockupItem[];
  /** Called with the full new list whenever anything is attached or edited. */
  onChanged: (mockups: LeadMockupItem[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A video takes minutes, and a button reading "Attaching..." with nothing
  // moving behind it is the same picture as a button that has hung.
  const [uploading, setUploading] = useState<UploadState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastProgressAt = useRef(0);

  const isUploading = uploading !== null;

  /**
   * For as long as bytes are moving: hold the screen on, object to the tab
   * being closed, and watch for the upload going quiet. A percentage that
   * has stopped climbing is indistinguishable from one that never started,
   * so the quiet gets named rather than left to be interpreted.
   */
  useEffect(() => {
    if (!isUploading) return;

    const warnBeforeLeaving = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warnBeforeLeaving);

    let wakeLock: { release: () => void } | null = null;
    let cancelled = false;
    void keepScreenAwake().then((lock) => {
      if (cancelled) lock.release();
      else wakeLock = lock;
    });

    const stallCheck = setInterval(() => {
      if (Date.now() - lastProgressAt.current < STALLED_AFTER_MS) return;
      setUploading((prev) => (prev && !prev.stalled ? { ...prev, stalled: true } : prev));
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(stallCheck);
      window.removeEventListener('beforeunload', warnBeforeLeaving);
      wakeLock?.release();
    };
  }, [isUploading]);

  const nextIndex = mockups.length + 1;
  // Version one is a delivery from design; everything after it is the rep
  // bringing in the next round, which is what "import" means here.
  const attachLabel = mockups.length === 0 ? 'Attach mockup 1' : `Import mockup ${nextIndex}`;

  const attach = async (body: { url: string; fileName?: string }) => {
    const res = await fetch(`/api/admin/leads/${leadId}/mockups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.mockup) {
      setError(data?.error || "Couldn't attach that mockup — try again.");
      return false;
    }
    if (data.alreadyAttached) {
      setError(`That link is already attached as mockup ${data.index}.`);
      return false;
    }
    onChanged([...mockups, data.mockup as LeadMockupItem]);
    return true;
  };

  const handleAttachLink = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      if (await attach({ url: trimmed })) {
        setUrl('');
        setOpen(false);
      }
    } catch {
      setError('Could not reach the server — check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const clearInput = () => {
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Answered here rather than after the upload finishes — see checkUpload.
    const checked = checkUpload(file, MOCKUP_UPLOAD_POLICY);
    if ('error' in checked) {
      setError(checked.error);
      clearInput();
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    lastProgressAt.current = Date.now();

    setBusy(true);
    setError('');
    setUploading({ name: file.name, loaded: 0, total: file.size, percent: 0, stalled: false });
    try {
      const handleUploadUrl = `/api/admin/leads/${leadId}/mockups/upload`;
      const onProgress = (loaded: number) => {
        lastProgressAt.current = Date.now();
        setUploading({
          name: file.name,
          loaded,
          total: file.size,
          percent: file.size > 0 ? Math.round((loaded / file.size) * 100) : 0,
          stalled: false,
        });
      };

      // Anything big enough to be worth chunking goes through our own
      // uploader, which keeps the file on disk and re-sends a part that
      // stops moving. Below that a single request is simpler and fine.
      const blob =
        file.size > MULTIPART_THRESHOLD_BYTES
          ? await uploadFileInParts({
              file,
              contentType: checked.contentType,
              handleUploadUrl,
              abortSignal: controller.signal,
              onProgress,
            })
          : await upload(file.name, file, {
              access: 'public',
              handleUploadUrl,
              // Blob otherwise infers the type from the file name, which is
              // how a video the browser didn't label ends up refused.
              // checkUpload has already worked out what this is; send that.
              contentType: checked.contentType,
              abortSignal: controller.signal,
              onUploadProgress: ({ loaded }) => onProgress(loaded),
            });

      if (await attach({ url: blob.url, fileName: file.name })) setOpen(false);
    } catch (err) {
      // Stopping it yourself isn't a failure worth a red line.
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setUploading(null);
      clearInput();
    }
  };

  const cancelUpload = () => {
    abortRef.current?.abort();
  };

  return (
    <div className="space-y-2">
      {mockups.map((m, i) => (
        <MockupRow
          key={m.id}
          mockup={m}
          index={i + 1}
          leadId={leadId}
          onNoteSaved={(note) =>
            onChanged(mockups.map((existing) => (existing.id === m.id ? { ...existing, note } : existing)))
          }
          onSent={(sent) =>
            onChanged(mockups.map((existing) => (existing.id === m.id ? { ...existing, ...sent } : existing)))
          }
        />
      ))}

      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setError('');
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm text-white/70 hover:bg-white/5 transition-colors"
        >
          <Paperclip size={14} /> {attachLabel}
        </button>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="mb-2 text-xs font-semibold text-white/60">{attachLabel}</p>
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAttachLink();
              }}
              autoFocus
              placeholder="yourcompany.bothmade.studio"
              aria-label={`Link for mockup ${nextIndex}`}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
            />
            <button
              type="button"
              onClick={handleAttachLink}
              disabled={busy || !url.trim()}
              className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {isUploading ? 'Uploading' : busy ? 'Attaching...' : 'Attach'}
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors">
              <Upload size={12} />
              or upload the file — image, PDF or video
              <input
                ref={fileInputRef}
                type="file"
                accept={MOCKUP_ACCEPT}
                onChange={handleUploadFile}
                disabled={busy}
                className="hidden"
              />
            </label>
            {/* Closing the panel mid-upload used to leave the upload running
                with nothing on screen to show for it. While bytes are moving
                this stops them instead. */}
            <button
              type="button"
              onClick={() => {
                if (isUploading) {
                  cancelUpload();
                  return;
                }
                setOpen(false);
                setUrl('');
                setError('');
              }}
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              {isUploading ? 'Cancel upload' : 'Cancel'}
            </button>
          </div>

          {uploading && (
            <div className="mt-2" role="status">
              {/* Bytes as well as a percentage: "0%" alone doesn't say
                  whether this is starting or stuck, and on a 300MB file the
                  first percent takes a while to arrive. */}
              <p className="text-xs text-white/50">
                Uploading {uploading.name} — {formatFileSize(uploading.loaded)} of{' '}
                {formatFileSize(uploading.total)} ({uploading.percent}%)
              </p>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-[width] duration-200 ${
                    uploading.stalled
                      ? 'bg-amber-400/60'
                      : 'bg-gradient-to-r from-sky-400 to-purple-500'
                  }`}
                  style={{ width: `${Math.max(uploading.percent, 2)}%` }}
                />
              </div>
              {uploading.stalled ? (
                <p className="mt-1.5 text-xs text-amber-200">
                  Nothing has moved for a while. Parts that stop are re-sent automatically, so give
                  it a moment — if the bar still doesn&apos;t climb, cancel and send this one from a
                  computer.
                </p>
              ) : (
                uploading.total > MULTIPART_THRESHOLD_BYTES && (
                  <p className="mt-1.5 text-xs text-white/40">
                    A file this size takes a few minutes. Keep this tab open and in front — the
                    upload stops if the phone locks.
                  </p>
                )
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="mt-2 text-xs text-red-300">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface MockupLeadRow {
  id: string;
  company: string;
  mockupRequested: boolean;
  mockupRequestedAt: string | null;
  mockups: LeadMockupItem[];
}

/** Whole days a lead has been waiting on its first mockup. */
function daysWaiting(requestedAt: string | null): number | null {
  if (!requestedAt) return null;
  const ms = Date.now() - new Date(requestedAt).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/**
 * The dashboard card: every live deal of mine that has a mockup or is
 * waiting on one, so the answer to "what have we shown this business" is on
 * the front page rather than three clicks into the lead.
 */
/**
 * `refreshSignal` is bumped by the dashboard's refresh control — the same
 * signal Today takes. This card used to fetch once on mount and never again,
 * so a page-wide refresh left it showing whatever it had when the tab was
 * opened, under a timestamp saying otherwise.
 */
export function MockupsCard({ refreshSignal = 0 }: { refreshSignal?: number } = {}) {
  const [leads, setLeads] = useState<MockupLeadRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/leads/mockups');
        const data = await res.json();
        if (!cancelled && data.success) setLeads(data.leads);
      } catch {
        // Leave the card empty rather than breaking the dashboard around it.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSignal]);

  const updateLead = (leadId: string, mockups: LeadMockupItem[]) =>
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, mockups } : l)));

  const totalMockups = leads.reduce((sum, l) => sum + l.mockups.length, 0);

  return (
    <div className="relative rounded-2xl border border-white/[0.06] bg-surface p-6 shadow-e2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ImageIcon size={18} /> Mockups
        </h2>
        <Link href="/admin/mockup-queue" className="text-xs text-sky-300/70 hover:text-sky-300">
          Queue →
        </Link>
      </div>
      <p className="mb-4 text-xs text-white/40">
        {loading
          ? 'Loading...'
          : totalMockups === 0
            ? 'Nothing sent over yet — attach one as soon as it exists.'
            : `${totalMockups} mockup${totalMockups === 1 ? '' : 's'} across ${leads.length} ${
                leads.length === 1 ? 'deal' : 'deals'
              }. Open one, note what came back, import the next version.`}
      </p>

      {!loading && leads.length === 0 && (
        <p className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/35">
          No mockups on your live deals yet. Request one from a lead&apos;s page and it&apos;ll show up here.
        </p>
      )}

      <div className="space-y-4">
        {leads.map((lead) => {
          const waiting = lead.mockups.length === 0 ? daysWaiting(lead.mockupRequestedAt) : null;
          return (
            <div key={lead.id} className="rounded-xl border border-white/[0.08] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/admin/leads/${lead.id}`}
                  className="text-sm font-bold text-white/90 hover:underline"
                >
                  {lead.company}
                </Link>
                {lead.mockups.length > 0 ? (
                  <span className="text-xs text-white/35">
                    {lead.mockups.length} version{lead.mockups.length === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
                    <Clock size={11} />
                    {waiting === null
                      ? 'With design'
                      : waiting === 0
                        ? 'Requested today'
                        : `With design ${waiting}d`}
                  </span>
                )}
              </div>
              <MockupAttachments
                leadId={lead.id}
                mockups={lead.mockups}
                onChanged={(mockups) => updateLead(lead.id, mockups)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The same list, fetching for one lead — used on the lead's own page where
 * there's no dashboard payload to hand it.
 */
export function LeadMockupsPanel({
  leadId,
  onChanged,
}: {
  leadId: string;
  /** The lead itself caches its newest mockup, so its page wants to know too. */
  onChanged?: () => void;
}) {
  const [mockups, setMockups] = useState<LeadMockupItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/leads/${leadId}/mockups`);
        const data = await res.json();
        if (!cancelled && data.success) setMockups(data.mockups);
      } catch {
        // An unreachable list shouldn't take the lead page down with it.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (loading) return <p className="text-xs text-white/30">Loading mockups...</p>;

  return (
    <MockupAttachments
      leadId={leadId}
      mockups={mockups}
      onChanged={(next) => {
        setMockups(next);
        onChanged?.();
      }}
    />
  );
}
