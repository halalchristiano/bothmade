'use client';

import { useState } from 'react';

/**
 * "Here's the mockup" — one implementation.
 *
 * This existed three times: the mockup queue, the dashboard widget, and the
 * lead detail page, each with its own URL input, its own PATCH, and its own
 * idea of what to do when the write fails. The queue's copy ignored
 * failures entirely and removed the row from the list regardless, so a
 * failed save looked exactly like a successful one and the mockup silently
 * never reached the client.
 *
 * Delivering a mockup also resolves the team flag and moves the lead's
 * stage server-side, so having three call sites that could each drift was
 * three chances to get a stage transition subtly wrong.
 */
export function useDeliverMockup(onDelivered?: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const deliver = async (leadId: string, rawUrl: string): Promise<boolean> => {
    const url = rawUrl.trim();
    setError('');

    if (!url) {
      setError('Paste the mockup link first.');
      return false;
    }
    // A link the client can't open is worse than no link: they're told it's
    // ready, click, and get nothing.
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setError('That needs to be a full link, starting with https://');
      return false;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockupUrl: url }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Couldn't save that link — try again.");
        return false;
      }

      onDelivered?.();
      return true;
    } catch {
      setError('Could not reach the server — the link was not saved.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { deliver, saving, error, setError };
}

/** The input + button pair, for the two places that render it inline. */
export function DeliverMockupForm({
  leadId,
  onDelivered,
  placeholder = 'Paste the mockup link…',
  compact = false,
}: {
  leadId: string;
  onDelivered?: () => void;
  placeholder?: string;
  compact?: boolean;
}) {
  const [url, setUrl] = useState('');
  const { deliver, saving, error } = useDeliverMockup(onDelivered);

  const submit = async () => {
    const ok = await deliver(leadId, url);
    if (ok) setUrl('');
  };

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={placeholder}
          aria-label="Mockup link"
          aria-invalid={Boolean(error)}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/60 transition-colors"
        />
        <button
          onClick={submit}
          disabled={saving || !url.trim()}
          aria-busy={saving}
          className="px-3 py-2 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 text-black text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity shrink-0"
        >
          {saving ? 'Saving…' : 'Deliver'}
        </button>
      </div>
      <div role="alert" aria-live="polite">
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
