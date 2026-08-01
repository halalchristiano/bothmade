'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface TeamMessage {
  id: string;
  content: string;
  fromUserId: string;
  toUserId: string | null;
  relatedLeadId: string | null;
  relatedProjectId: string | null;
  urgent: boolean;
  resolved: boolean;
  createdAt: string;
  fromUser: { id: string; name: string | null; email: string };
}

export default function TeamChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [content, setContent] = useState('');
  const [flagUrgent, setFlagUrgent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const [meRes, msgRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch('/api/admin/team-messages'),
      ]);
      if (msgRes.status === 401) {
        router.push('/admin/login');
        return;
      }
      const me = await meRes.json().catch(() => null);
      if (me?.type === 'user') setCurrentUserId(me.user.id);
      const data = await msgRes.json();
      if (data.success) setMessages(data.messages);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    if (!content.trim()) return;
    setSending(true);
    try {
      const response = await fetch('/api/admin/team-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, urgent: flagUrgent }),
      });
      const data = await response.json();
      if (data.success) {
        setMessages((prev) => [...prev, data.message]);
        setContent('');
        setFlagUrgent(false);
      }
    } finally {
      setSending(false);
    }
  };

  const handleToggleResolved = async (message: TeamMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, resolved: !m.resolved } : m)));
    await fetch(`/api/admin/team-messages/${message.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved: !message.resolved }),
    });
  };

  const unresolvedFlags = messages.filter((m) => m.urgent && !m.resolved);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <h1 className="text-3xl font-bold mb-1">Team Chat</h1>
      <p className="text-white/40 text-sm mb-6">
        A private channel between the Bothmade team — never visible to clients or leads.
      </p>

      {unresolvedFlags.length > 0 && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 mb-6">
          <p className="text-sm font-semibold text-amber-300 mb-2">
            {unresolvedFlags.length} flagged question{unresolvedFlags.length === 1 ? '' : 's'} need{unresolvedFlags.length === 1 ? 's' : ''} resolving
          </p>
          <div className="space-y-1">
            {unresolvedFlags.map((m) => (
              <label key={m.id} className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={false} onChange={() => handleToggleResolved(m)} />
                <span className="text-white/70">{m.content}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 flex flex-col h-[60vh]">
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {messages.length === 0 && (
            <p className="text-white/30 text-sm text-center mt-10">No messages yet — say hi.</p>
          )}
          {messages.map((m) => {
            const mine = m.fromUserId === currentUserId;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.urgent
                      ? m.resolved
                        ? 'bg-white/5 border border-white/10 opacity-50'
                        : 'bg-amber-400/10 border border-amber-400/30'
                      : mine
                      ? 'bg-gradient-to-r from-sky-400 to-purple-500 text-black'
                      : 'bg-white/10 text-white'
                  }`}
                >
                  {!mine && (
                    <p className="text-[11px] font-semibold text-sky-300 mb-0.5">
                      {m.fromUser.name || m.fromUser.email}
                    </p>
                  )}
                  {m.urgent && (
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300 mb-1">
                      🚩 Flagged{m.resolved ? ' — resolved' : ''}
                    </p>
                  )}
                  <p className={`whitespace-pre-wrap ${m.urgent ? 'text-white' : ''}`}>{m.content}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className={`text-[10px] ${mine && !m.urgent ? 'text-black/50' : 'text-white/30'}`}>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {m.urgent && (
                      <button
                        onClick={() => handleToggleResolved(m)}
                        className="text-[10px] text-amber-300 hover:underline"
                      >
                        {m.resolved ? 'Reopen' : 'Mark resolved'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="pt-4 border-t border-white/10">
          <label className="flex items-center gap-2 text-xs text-white/50 mb-2 cursor-pointer">
            <input type="checkbox" checked={flagUrgent} onChange={(e) => setFlagUrgent(e.target.checked)} />
            🚩 Flag as a question needing action (not just a note)
          </label>
          <div className="flex gap-2">
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Message the team..."
              className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={sending || !content.trim()}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 text-black font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
