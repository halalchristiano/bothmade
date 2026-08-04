'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { upload } from '@vercel/blob/client';
import {
  Hash,
  AlertTriangle,
  Paperclip,
  Send,
  X,
  CheckCircle2,
  RotateCcw,
  FileText,
  Users as UsersIcon,
} from 'lucide-react';
import { Kicker, inputClass } from '@/components/admin/ui';
import { useAdminSession } from '../layout';

/**
 * Team chat as a desktop app, not a card on a page.
 *
 * The old version was a 60vh box inside page padding with a single-line
 * input whose Shift+Enter handling was dead code (an <input> cannot take a
 * newline), showing the OLDEST 200 messages forever once history passed
 * 200, marking everything read from background tabs, and yanking the
 * scroll to the bottom on every poll. This one is the full viewport: a
 * view rail (everyone / DMs / flags), day-grouped thread with linkified
 * text and real attachments, a textarea composer where Shift+Enter works
 * because it can, incremental polling that appends instead of replacing,
 * read-marking only when the tab is actually visible, and autoscroll only
 * when you were already at the bottom.
 */

interface TeamUser {
  id: string;
  name: string | null;
  email: string;
  role?: string;
}

interface Attachment {
  name: string;
  url: string;
}

interface ChatMessage {
  id: string;
  content: string;
  kind: 'chat' | 'system';
  fromUserId: string;
  fromUser: { id: string; name: string | null; email: string };
  toUserId: string | null;
  relatedLeadId: string | null;
  relatedProjectId: string | null;
  urgent: boolean;
  resolved: boolean;
  attachments: Attachment[] | unknown;
  createdAt: string;
  /** Local-only flag while a send is in flight. */
  pending?: boolean;
}

type View = { type: 'all' } | { type: 'flags' } | { type: 'dm'; userId: string };

function attachmentsOf(m: ChatMessage): Attachment[] {
  if (!Array.isArray(m.attachments)) return [];
  return m.attachments.filter(
    (a): a is Attachment => typeof a === 'object' && a !== null && 'url' in a && 'name' in a
  );
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif)$/i;

/** Plain text with clickable links — chat messages are full of URLs that rendered inert. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-300 underline decoration-sky-300/40 hover:decoration-sky-300 break-all"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function TeamChatPage() {
  const { userName } = useAdminSession();
  const [me, setMe] = useState('');
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [view, setView] = useState<View>({ type: 'all' });
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const [draft, setDraft] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const lastSeenRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ----- data -----

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.type === 'user') setMe(d.user?.id ?? '');
      })
      .catch(() => {});
    fetch('/api/admin/users')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.success) setTeam(d.users ?? []);
      })
      .catch(() => {});
  }, []);

  const markRead = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    fetch('/api/admin/team-messages/read', { method: 'POST' }).catch(() => {});
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/team-messages');
      const data = await res.json();
      if (data?.success) {
        setMessages(data.messages);
        const last = data.messages[data.messages.length - 1];
        if (last) lastSeenRef.current = last.createdAt;
        setLoadFailed(false);
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const after = lastSeenRef.current;
      const res = await fetch(
        after ? `/api/admin/team-messages?after=${encodeURIComponent(after)}` : '/api/admin/team-messages'
      );
      const data = await res.json();
      if (!data?.success || !Array.isArray(data.messages) || data.messages.length === 0) return;
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const fresh = (data.messages as ChatMessage[]).filter((m) => !known.has(m.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
      const last = data.messages[data.messages.length - 1];
      if (last) lastSeenRef.current = last.createdAt;
      if (document.visibilityState === 'visible') markRead();
    } catch {
      // A failed poll is the next poll's problem, not an unhandled rejection.
    }
  }, [markRead]);

  useEffect(() => {
    loadAll();
    markRead();
    const interval = setInterval(poll, 10000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        poll();
        markRead();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadAll, poll, markRead]);

  // ----- scroll behaviour -----

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Container-scoped scrolling — scrollIntoView could drag the page.
    if (nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, view]);

  // ----- derived -----

  const teammates = team.filter((u) => u.id !== me);

  const visible = useMemo(() => {
    switch (view.type) {
      case 'all':
        return messages.filter((m) => !m.toUserId || m.toUserId === me || m.fromUserId === me);
      case 'flags':
        // Server already scopes to broadcasts + my DMs; keep the same rule
        // here so a flagged DM never surfaces outside its two parties.
        return messages.filter(
          (m) => m.urgent && (!m.toUserId || m.toUserId === me || m.fromUserId === me)
        );
      case 'dm':
        return messages.filter(
          (m) =>
            (m.fromUserId === me && m.toUserId === view.userId) ||
            (m.fromUserId === view.userId && m.toUserId === me)
        );
    }
  }, [messages, view, me]);

  const openFlags = messages.filter((m) => m.urgent && !m.resolved).length;

  const grouped = useMemo(() => {
    const groups: { day: string; items: ChatMessage[] }[] = [];
    for (const m of visible) {
      const day = dayLabel(m.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(m);
      else groups.push({ day, items: [m] });
    }
    return groups;
  }, [visible]);

  // ----- actions -----

  async function attachFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setUploading(true);
    setSendError(null);
    try {
      for (const file of Array.from(list).slice(0, 5)) {
        const blob = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/admin/team-chat/upload',
        });
        setPendingFiles((prev) => [...prev, { name: file.name, url: blob.url }]);
      }
    } catch {
      setSendError("Couldn't upload that file — check the type and size (25MB max).");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function send() {
    const content = draft.trim();
    if ((!content && pendingFiles.length === 0) || uploading) return;
    const toUserId = view.type === 'dm' ? view.userId : null;
    const files = pendingFiles;
    const wasUrgent = urgent;

    // Optimistic append, rolled back on failure — the poll appends by id,
    // so the temp row is swapped for the real one on success.
    const tempId = `tmp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      content,
      kind: 'chat',
      fromUserId: me,
      fromUser: { id: me, name: userName || 'Me', email: '' },
      toUserId,
      relatedLeadId: null,
      relatedProjectId: null,
      urgent: wasUrgent,
      resolved: false,
      attachments: files,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    setUrgent(false);
    setPendingFiles([]);
    setSendError(null);
    nearBottomRef.current = true;

    try {
      const res = await fetch('/api/admin/team-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, toUserId, urgent: wasUrgent, attachments: files }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'send failed');
      // The poll owns the cursor. Advancing it from the POST skipped every
      // teammate message created in the seconds before the send — silently,
      // until a reload. The id-dedupe below makes the real row idempotent
      // whether it arrives here or via the next poll.
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return withoutTemp.some((m) => m.id === data.message.id)
          ? withoutTemp
          : [...withoutTemp, { ...data.message }];
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      // Merge, don't clobber: anything typed or attached while the send was
      // in flight survives the rollback.
      setDraft((cur) => (cur ? `${content}\n${cur}` : content));
      setPendingFiles((cur) => [...files, ...cur.filter((f) => !files.some((g) => g.url === f.url))]);
      setUrgent(wasUrgent);
      setSendError(
        err instanceof Error && err.message !== 'send failed'
          ? err.message
          : "Didn't send — your message is still in the box."
      );
    }
  }

  async function toggleResolved(m: ChatMessage) {
    const nextValue = !m.resolved;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, resolved: nextValue } : x)));
    try {
      const res = await fetch(`/api/admin/team-messages/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: nextValue }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Roll back — an optimistic flip that failed must not lie.
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, resolved: m.resolved } : x)));
    }
  }

  const viewTitle =
    view.type === 'all'
      ? 'Everyone'
      : view.type === 'flags'
      ? 'Flagged questions'
      : teammates.find((t) => t.id === view.userId)?.name || 'Direct message';

  // ----- render -----

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen">
      {/* View rail */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-white/[0.08]">
        <div className="px-4 py-4 border-b border-white/[0.08]">
          <Kicker>Studio</Kicker>
          <p className="text-sm text-white/60 mt-1.5">Team chat</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          <button
            onClick={() => setView({ type: 'all' })}
            className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
              view.type === 'all' ? 'text-white bg-white/[0.05]' : 'text-white/50 hover:text-white'
            }`}
          >
            <Hash size={15} />
            Everyone
          </button>
          <button
            onClick={() => setView({ type: 'flags' })}
            className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
              view.type === 'flags' ? 'text-white bg-white/[0.05]' : 'text-white/50 hover:text-white'
            }`}
          >
            <AlertTriangle size={15} className={openFlags > 0 ? 'text-amber-300' : ''} />
            Flags
            {openFlags > 0 && (
              <span className="ml-auto rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                {openFlags}
              </span>
            )}
          </button>
          <div className="px-4 pt-4 pb-1.5">
            <Kicker>Direct</Kicker>
          </div>
          {teammates.map((t) => (
            <button
              key={t.id}
              onClick={() => setView({ type: 'dm', userId: t.id })}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                view.type === 'dm' && view.userId === t.id
                  ? 'text-white bg-white/[0.05]'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-sky-400/40 text-sky-300 text-[10px] font-bold">
                {(t.name || t.email)[0]?.toUpperCase()}
              </span>
              <span className="truncate">{t.name || t.email}</span>
            </button>
          ))}
          {teammates.length === 0 && (
            <p className="px-4 py-2 text-xs text-white/25 flex items-center gap-1.5">
              <UsersIcon size={12} /> Just you so far
            </p>
          )}
        </nav>
      </aside>

      {/* Thread */}
      <div className="flex flex-1 min-w-0 flex-col">
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-3.5">
          <h1 className="text-sm font-semibold">{viewTitle}</h1>
          {view.type === 'dm' && (
            <span className="text-[11px] text-white/30">Only the two of you see this</span>
          )}
          {loadFailed && <span className="ml-auto text-xs text-amber-300">Offline — retrying</span>}
        </div>

        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-4">
          {!loaded && <p className="text-sm text-white/30">Loading the conversation…</p>}
          {loaded && visible.length === 0 && (
            <p className="text-sm text-white/30">
              {view.type === 'flags' ? 'Nothing flagged. Good.' : 'No messages yet — say hi.'}
            </p>
          )}

          {grouped.map((group) => (
            <div key={group.day}>
              <div className="sticky top-0 z-10 flex justify-center py-2">
                <span className="rounded-full border border-white/10 bg-raised px-3 py-0.5 text-[10px] uppercase tracking-wide text-white/40">
                  {group.day}
                </span>
              </div>
              <div className="space-y-3 pb-2">
                {group.items.map((m) => {
                  const mine = m.fromUserId === me;
                  const files = attachmentsOf(m);

                  if (m.kind === 'system') {
                    // The app narrating — a timeline row, not a person talking.
                    return (
                      <div key={m.id} className="flex justify-center">
                        <div className="max-w-[85%] rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-center">
                          <p className="text-[12px] text-white/50 whitespace-pre-wrap">
                            <Linkified text={m.content} />
                          </p>
                          <p className="text-[10px] text-white/25 mt-0.5">{timeLabel(m.createdAt)}</p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] ${m.pending ? 'opacity-60' : ''}`}>
                        <div
                          className={`rounded-2xl px-3.5 py-2.5 ${
                            m.urgent
                              ? `border ${
                                  m.resolved
                                    ? 'border-white/10 bg-white/[0.03] opacity-60'
                                    : 'border-amber-400/30 bg-amber-400/10'
                                }`
                              : mine
                              ? 'bg-gradient-to-r from-sky-400 to-purple-500 text-black'
                              : 'bg-white/[0.07]'
                          }`}
                        >
                          {!mine && (
                            <p
                              className={`text-[11px] font-semibold mb-0.5 ${
                                m.urgent ? 'text-amber-300' : 'text-sky-300'
                              }`}
                            >
                              {m.fromUser?.name || m.fromUser?.email}
                              {m.toUserId && <span className="text-white/40 font-normal"> · direct</span>}
                            </p>
                          )}
                          {m.content && (
                            <p
                              className={`text-sm whitespace-pre-wrap break-words ${
                                mine && !m.urgent ? 'text-black' : 'text-white'
                              }`}
                            >
                              <Linkified text={m.content} />
                            </p>
                          )}
                          {files.length > 0 && (
                            <div className={`flex flex-wrap gap-2 ${m.content ? 'mt-2' : ''}`}>
                              {files.map((f, i) =>
                                IMAGE_RE.test(f.url) ? (
                                  <a key={i} href={f.url} target="_blank" rel="noopener noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={f.url}
                                      alt={f.name}
                                      className="max-h-44 rounded-lg border border-white/10 object-cover"
                                    />
                                  </a>
                                ) : (
                                  <a
                                    key={i}
                                    href={f.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                                      mine && !m.urgent
                                        ? 'border-black/20 text-black hover:bg-black/10'
                                        : 'border-white/15 text-white/80 hover:bg-white/5'
                                    }`}
                                  >
                                    <FileText size={12} />
                                    <span className="max-w-[180px] truncate">{f.name}</span>
                                  </a>
                                )
                              )}
                            </div>
                          )}
                          {(m.relatedLeadId || m.relatedProjectId) && (
                            <div className="mt-2 flex gap-1.5">
                              {m.relatedLeadId && (
                                <Link
                                  href={`/admin/leads/${m.relatedLeadId}`}
                                  className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
                                >
                                  Open lead →
                                </Link>
                              )}
                              {m.relatedProjectId && (
                                <Link
                                  href={`/admin/projects/${m.relatedProjectId}`}
                                  className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
                                >
                                  Open project →
                                </Link>
                              )}
                            </div>
                          )}
                        </div>
                        <div
                          className={`mt-1 flex items-center gap-2 text-[10px] text-white/30 ${
                            mine ? 'justify-end' : ''
                          }`}
                        >
                          <span>{timeLabel(m.createdAt)}</span>
                          {m.urgent && (
                            <button
                              onClick={() => toggleResolved(m)}
                              className="flex items-center gap-1 text-amber-300/80 hover:text-amber-200"
                            >
                              {m.resolved ? (
                                <>
                                  <RotateCcw size={10} /> Reopen
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 size={10} /> Mark resolved
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Composer */}
        <div className="border-t border-white/[0.08] px-5 py-4">
          {pendingFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pendingFiles.map((f, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/70"
                >
                  <FileText size={12} />
                  <span className="max-w-[160px] truncate">{f.name}</span>
                  <button
                    onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove ${f.name}`}
                    className="text-white/40 hover:text-white"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => attachFiles(e.target.files)}
              aria-label="Attach files"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-40"
              aria-label="Attach a file"
              title="Attach a file (PDFs, images, docs — 25MB max)"
            >
              <Paperclip size={16} />
            </button>
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={
                view.type === 'dm'
                  ? `Message ${viewTitle} privately… (Shift+Enter for a new line)`
                  : 'Message the team… (Shift+Enter for a new line)'
              }
              className={`${inputClass} resize-none min-h-[40px] max-h-40 leading-relaxed`}
            />
            <button
              onClick={() => setUrgent((v) => !v)}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                urgent
                  ? 'border-amber-400/50 bg-amber-400/10 text-amber-300'
                  : 'border-white/15 text-white/40 hover:text-amber-300'
              }`}
              aria-label="Flag as needing an answer"
              aria-pressed={urgent}
              title="Flag it — stays on the board until someone resolves it"
            >
              <AlertTriangle size={15} />
            </button>
            <button
              onClick={send}
              disabled={uploading || (!draft.trim() && pendingFiles.length === 0)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 text-black hover:opacity-90 disabled:opacity-40"
              aria-label="Send"
            >
              <Send size={15} />
            </button>
          </div>
          {uploading && <p className="mt-1.5 text-[11px] text-white/40">Uploading…</p>}
          {sendError && <p className="mt-1.5 text-[11px] text-amber-300">{sendError}</p>}
        </div>
      </div>
    </div>
  );
}
