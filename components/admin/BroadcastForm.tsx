'use client';

import { useState } from 'react';

/**
 * "Type one message, send it to every thread, report how many it reached" —
 * the dashboard's broadcast-to-all-clients box and the client page's
 * message-all-their-projects box were the same component written twice, down
 * to the disabled-while-empty button and the emerald confirmation line. Only
 * the endpoint and the wording actually differ.
 */

export interface BroadcastResult {
  success?: boolean;
  projectsNotified?: number;
  emailsSent?: number;
}

export function BroadcastForm({
  endpoint,
  body,
  placeholder,
  submitLabel,
  sendingLabel = 'Sending...',
  rows = 3,
  /** Turns the raw response into the line shown after a successful send. */
  describeResult,
}: {
  endpoint: string;
  /** Extra fields merged into the POST body alongside `content`. */
  body?: Record<string, unknown>;
  placeholder: string;
  submitLabel: string;
  sendingLabel?: string;
  rows?: number;
  describeResult: (result: BroadcastResult) => string;
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
      const data: BroadcastResult = await response.json();
      if (!response.ok || !data.success) {
        // Previously a failed broadcast just cleared the spinner and said
        // nothing, which reads exactly like a successful silent send.
        setError("That didn't send — try again.");
        return;
      }
      setStatus(describeResult(data));
      setContent('');
    } catch {
      setError('Could not reach the server — check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={rows}
        className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder:text-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-transparent transition-all mb-3"
      />
      {status && <p className="text-sm text-emerald-300 mb-3">{status}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-300 mb-3">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleSend}
        disabled={sending || !content.trim()}
        className="rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {sending ? sendingLabel : submitLabel}
      </button>
    </>
  );
}

/** Pluralises the "sent to N projects (M emails)" line the broadcast APIs return. */
export function describeBroadcast(result: BroadcastResult): string {
  const projects = result.projectsNotified ?? 0;
  const projectPart = `Sent to ${projects} project${projects === 1 ? '' : 's'}`;
  if (typeof result.emailsSent !== 'number') return `${projectPart}.`;
  return `${projectPart} (${result.emailsSent} email${result.emailsSent === 1 ? '' : 's'} sent).`;
}
