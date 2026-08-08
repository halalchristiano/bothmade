'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Hash,
  AlertTriangle,
  Send,
  X,
  CheckCircle2,
  RotateCcw,
  Link2,
  Users as UsersIcon,
} from 'lucide-react';
import { Kicker, inputClass } from '@/components/admin/ui';
import { AttachLinkButton } from '@/components/AttachLink';
import { AttachmentList } from '@/components/AttachmentCard';
import { describeAttachment, readAttachments, type Attachment } from '@/lib/attachments';
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
 *
 * Since then: it polls on a ten-second timer, and that timer used to run in
 * a background tab and carry on running after the session expired — every
 * request the same 401, forever, which is most of what an error rate on a
 * quiet site is made of. It idles while hidden and gives up on a 401 now.
 * Attachments are links rather than uploads; see lib/attachments.ts.
 */

interface TeamUser {
  id: string;
  name: string | null;
  email: string;
  role?: string;
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
  const router = useRouter();
  // Straight from the layout's session rather than a second /api/auth/me.
  // Fetching it again meant your own messages rendered on the left, under
  // your own name, until the round trip came back — and permanently if it
  // ever failed, which also broke every DM view.
  const { userName, userId: me } = useAdminSession();
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [view, setView] = useState<View>({ type: 'all' });
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const [draft, setDraft] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const nearBottomRef = useRef(true);
  const lastSeenRef = useRef<string | null>(null);
  /** Set once the session is gone — every later request is the same 401. */
  const deadRef = useRef(false);

  // ----- data -----

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.success) setTeam(d.users ?? []);
      })
      .catch(() => {});
  }, []);

  const markRead = useCallback(() => {
    if (deadRef.current || document.visibilityState !== 'visible') return;
    fetch('/api/admin/team-messages/read', { method: 'POST' }).catch(() => {});
  }, []);

  /**
   * One fetch for both the first load and every poll after it.
   *
   * They were two functions that had drifted apart: the first set the
   * "Offline" flag on failure, the second swallowed everything, so a chat
   * that had been failing to poll for an hour looked exactly like a chat with
   * nothing new in it. And neither noticed a 401 — an expired tab kept asking
   * every ten seconds, forever, and showed "No messages yet — say hi." over
   * the top of a conversation it simply was not allowed to read.
   */
  const load = useCallback(
    async (mode: 'initial' | 'poll') => {
      if (deadRef.current) return;
      const after = mode === 'poll' ? lastSeenRef.current : null;
      try {
        const res = await fetch(
          after
            ? `/api/admin/team-messages?after=${encodeURIComponent(after)}`
            : '/api/admin/team-messages'
        );
        if (res.status === 401 || res.status === 403) {
          deadRef.current = true;
          router.push('/admin/login');
          return;
        }
        if (!res.ok) {
          setLoadFailed(true);
          return;
        }
        const data = await res.json();
        if (!data?.success || !Array.isArray(data.messages)) {
          setLoadFailed(true);
          return;
        }
        setLoadFailed(false);

        /*
         * Somebody else resolving a flag is a change to a row we already
         * have, not a new one — so it never arrives through `after`, which
         * asks for newer rows by timestamp. The poll carries the current
         * state of the flagged set and this applies it, outside the
         * `messages.length > 0` branch below: a quiet ten seconds in which
         * the only thing that happened was a teammate clearing a flag is
         * exactly the case that was being missed.
         */
        if (Array.isArray(data.flags)) {
          const state = new Map<string, boolean>(
            (data.flags as Array<{ id: string; resolved: boolean }>).map((f) => [f.id, f.resolved])
          );
          setMessages((prev) =>
            prev.some((m) => state.has(m.id) && state.get(m.id) !== m.resolved)
              ? prev.map((m) =>
                  state.has(m.id) ? { ...m, resolved: state.get(m.id) as boolean } : m
                )
              : prev
          );
        }

        if (data.messages.length > 0) {
          setMessages((prev) => {
            // The initial load replaces; a poll appends what it has not seen.
            const base = mode === 'initial' ? [] : prev;
            const known = new Set(base.map((m) => m.id));
            const fresh = (data.messages as ChatMessage[]).filter((m) => !known.has(m.id));
            return fresh.length > 0 ? [...base, ...fresh] : base;
          });
          const last = data.messages[data.messages.length - 1];
          if (last) lastSeenRef.current = last.createdAt;
          markRead();
        }
      } catch {
        // A dropped connection is the next tick's problem. Only a 401 is final.
        setLoadFailed(true);
      } finally {
        if (mode === 'initial') setLoaded(true);
      }
    },
    [markRead, router]
  );

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer || deadRef.current) return;
      timer = setInterval(() => load('poll'), 10000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    load('initial');
    markRead();
    start();

    // A tab nobody is looking at does not need a ten-second refresh; it
    // catches up the moment it comes back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        load('poll');
        markRead();
        start();
      } else {
        stop();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, markRead]);

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
  }, [messages]);

  // Switching views always lands at the newest message. Carrying the previous
  // view's scroll position across put you halfway up a conversation you had
  // just opened, which reads as "the recent messages are missing".
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = true;
    el.scrollTop = el.scrollHeight;
  }, [view]);

  // ----- derived -----

  const teammates = team.filter((u) => u.id !== me);

  const visible = useMemo(() => {
    switch (view.type) {
      case 'all':
        // Broadcasts only. Direct messages used to appear here as well as in
        // their own view, and one you had sent carried no marker at all — so
        // a private message to one person sat in the room named "Everyone"
        // looking exactly like something the whole team could read. They have
        // a view each, and the rail says when one is waiting.
        return messages.filter((m) => !m.toUserId);
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

  /**
   * Who has said something you have not read, so a DM is not a room you have
   * to remember to check. Approximate on purpose — it counts what this tab
   * has received since it opened, which is exactly the case that was invisible
   * before: a message arriving while you sit in Everyone, in a view you have
   * no reason to click.
   */
  const dmActivity = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of messages) {
      if (!m.toUserId || m.fromUserId === me) continue;
      if (m.toUserId !== me) continue;
      counts[m.fromUserId] = (counts[m.fromUserId] ?? 0) + 1;
    }
    return counts;
  }, [messages, me]);

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

  async function send() {
    const content = draft.trim();
    if (!content && pendingFiles.length === 0) return;
    const toUserId = view.type === 'dm' ? view.userId : null;
    const files = pendingFiles;
    // Anything sent from the Flags board is a flag.
    //
    // It used to be whatever the toggle happened to say, which meant a
    // message typed here saved perfectly and then vanished — the view filters
    // on `urgent`, so an unflagged message is written to the database and
    // immediately filtered out of the only screen you were looking at. It
    // reads exactly like "the message didn't save", and the second one
    // always vanished because the toggle resets after every send.
    const wasUrgent = view.type === 'flags' ? true : urgent;

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
    // The textarea grows itself as you type, in an inline style that nothing
    // was putting back. Sending a five-line message left a five-line empty
    // box sitting there.
    if (composerRef.current) composerRef.current.style.height = 'auto';

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
              {/* Direct messages no longer appear in Everyone, so this is
                  what stops one arriving in a room nobody has open. */}
              {(dmActivity[t.id] ?? 0) > 0 && view.type !== 'dm' && (
                <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
              )}
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
                  const files = readAttachments(m.attachments);

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
                            <AttachmentList
                              attachments={files}
                              tone={mine && !m.urgent ? 'onGradient' : 'dark'}
                              compact
                              className={m.content ? 'mt-2' : ''}
                            />
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
              {pendingFiles.map((f, i) => {
                const meta = describeAttachment(f);
                return (
                  <span
                    key={`${f.url}-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-xs"
                  >
                    <Link2 size={12} className="shrink-0 text-white/40" />
                    <span className="min-w-0">
                      <span className="block max-w-[180px] truncate text-white/80">{f.name}</span>
                      <span className="block max-w-[180px] truncate text-[10px] text-white/35">
                        {meta.typeLabel}
                        {meta.host && ` · ${meta.host}`}
                      </span>
                    </span>
                    <button
                      onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove ${f.name}`}
                      className="shrink-0 text-white/40 hover:text-white"
                    >
                      <X size={11} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <div className="flex items-end gap-2">
            <AttachLinkButton onAdd={(a) => setPendingFiles((prev) => [...prev, a])} />
            <textarea
              ref={composerRef}
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
              // The composer changes what it is depending on where you are —
              // a DM, a flagged question, or the room — so the name follows it
              // rather than saying "message" three different times.
              aria-label={
                view.type === 'dm'
                  ? `Message ${viewTitle} privately`
                  : view.type === 'flags'
                    ? 'Ask a question that stays flagged until resolved'
                    : 'Message the team'
              }
              placeholder={
                view.type === 'dm'
                  ? `Message ${viewTitle} privately… (Shift+Enter for a new line)`
                  : view.type === 'flags'
                    ? 'Ask something that needs an answer… (it stays flagged until resolved)'
                    : 'Message the team… (Shift+Enter for a new line)'
              }
              className={`${inputClass} resize-none min-h-[40px] max-h-40 leading-relaxed`}
            />
            <button
              onClick={() => setUrgent((v) => !v)}
              disabled={view.type === 'flags'}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                urgent || view.type === 'flags'
                  ? 'border-amber-400/50 bg-amber-400/10 text-amber-300'
                  : 'border-white/15 text-white/40 hover:text-amber-300'
              } ${view.type === 'flags' ? 'cursor-default opacity-80' : ''}`}
              aria-label="Flag as needing an answer"
              aria-pressed={urgent || view.type === 'flags'}
              title={
                view.type === 'flags'
                  ? 'Anything sent from the Flags board is flagged'
                  : 'Flag it — stays on the board until someone resolves it'
              }
            >
              <AlertTriangle size={15} />
            </button>
            <button
              onClick={send}
              disabled={!draft.trim() && pendingFiles.length === 0}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-ink hover:opacity-90 disabled:opacity-40"
              aria-label="Send"
            >
              <Send size={15} />
            </button>
          </div>
          {sendError && <p className="mt-1.5 text-[11px] text-amber-300">{sendError}</p>}
        </div>
      </div>
    </div>
  );
}
