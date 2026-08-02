'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Undo2 } from 'lucide-react';

/**
 * Fixed-position "action done — undo?" toast, auto-dismissing after a few
 * seconds. Self-contained (no global toast context) — render it locally
 * wherever a quick action needs a mis-click safety net, matching the inline
 * undo banner pattern already used on the lead detail page's call-outcome
 * flow, but as a reusable component instead of one-off page state.
 */
export function UndoToast({
  message,
  onUndo,
  onDismiss,
  durationMs = 6000,
}: {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  durationMs?: number;
}) {
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    const id = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/15 bg-[#0a0a0a] shadow-2xl">
      <span className="text-sm text-white/80">{message}</span>
      <button
        onClick={async () => {
          setUndoing(true);
          await onUndo();
          onDismiss();
        }}
        disabled={undoing}
        className="inline-flex items-center gap-1 text-sm font-semibold text-sky-300 hover:text-sky-200 transition-colors disabled:opacity-50"
      >
        <Undo2 size={13} />
        {undoing ? 'Undoing…' : 'Undo'}
      </button>
    </div>,
    document.body
  );
}
