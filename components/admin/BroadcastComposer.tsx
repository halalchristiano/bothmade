'use client';

import { useState } from 'react';
import { Loader2, Megaphone } from 'lucide-react';

/**
 * One broadcast composer.
 *
 * The dashboard ("all active clients") and the client detail page ("this
 * client's projects") each hand-rolled their own textarea, send handler,
 * and result copy — same behaviour, two drifting implementations, and
 * neither reported a failed send: the catch-less fetch left the spinner to
 * stop and the message to silently not go anywhere. The endpoint differs
 * per call site; everything else is shared here.
 */
export function BroadcastComposer({
  endpoint,
  body,
  title,
  warning,
  compact = false,
}: {
  endpoint: string;
  /** Extra fields merged into the POST body alongside `content`. */
  body?: Record<string, unknown>;
  title: string;
  /** What the reader should know before hitting send. */
  warning: string;
  compact?: boolean;
}) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!content.trim()) return;
    setSending(true);
    setStatus('');
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, ...body }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(data?.error ?? "That didn't send — nothing went out.");
        return;
      }
      setStatus(
        `Sent to ${data.projectsNotified} project${data.projectsNotified === 1 ? '' : 's'}${
          data.emailsSent !== undefined
            ? ` (${data.emailsSent} email${data.emailsSent === 1 ? '' : 's'})`
            : ''
        }.`
      );
      setContent('');
    } catch {
      setError('Could not reach the server — nothing went out.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      {!compact && (
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Megaphone size={14} /> {title}
        </p>
      )}
      <p className="mb-2 text-xs text-white/40 leading-relaxed">{warning}</p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        placeholder="What does everyone need to know?"
        aria-label={title}
        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/60 transition-colors resize-none"
      />
      <div role="status" aria-live="polite" className="min-h-[1.25rem] mt-1">
        {status && <p className="text-xs text-emerald-300">{status}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
      <button
        onClick={handleSend}
        disabled={sending || !content.trim()}
        aria-busy={sending}
        className="mt-1 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {sending ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />}
        {sending ? 'Sending…' : 'Send broadcast'}
      </button>
    </div>
  );
}
