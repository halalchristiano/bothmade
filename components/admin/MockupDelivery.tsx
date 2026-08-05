'use client';

import { useState } from 'react';

/**
 * "Paste the finished mockup link, press the button, the lead is marked
 * delivered" — the same three lines of state and the same PATCH, written out
 * on the dashboard widget, the mockup queue, and the lead detail page. The
 * three copies had drifted on the parts that matter: two silently did
 * nothing when the save failed, and only one cleared the field afterwards.
 */

async function deliverMockup(leadId: string, mockupUrl: string): Promise<boolean> {
  const res = await fetch(`/api/admin/leads/${leadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mockupUrl }),
  });
  return res.ok;
}

export function MockupDeliveryForm({
  leadId,
  onDelivered,
  placeholder = 'yourcompany.bothmade.studio',
  submitLabel = 'Mark Delivered',
  autoFocus = false,
  /** The three call sites sit in different-sized boxes, so the control scales. */
  size = 'md',
}: {
  leadId: string;
  onDelivered: () => void;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  size?: 'sm' | 'md';
}) {
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setSaving(true);
    setError('');
    try {
      if (!(await deliverMockup(leadId, trimmed))) {
        setError("Couldn't save that link — try again.");
        return;
      }
      setUrl('');
      onDelivered();
    } catch {
      setError('Could not reach the server — check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const fieldPad = size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-3 py-2 text-sm';
  const buttonPad = size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm';

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            // Pasting a link and pressing Enter is the whole interaction —
            // reaching for the mouse to confirm it is pure friction.
            if (e.key === 'Enter') handleSave();
          }}
          placeholder={placeholder}
          aria-label="Mockup link"
          autoFocus={autoFocus}
          className={`flex-1 min-w-0 ${fieldPad} rounded-lg bg-white/[0.04] border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50`}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !url.trim()}
          className={`shrink-0 ${buttonPad} rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 text-black font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity whitespace-nowrap`}
        >
          {saving ? 'Saving...' : submitLabel}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-300 mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
}
