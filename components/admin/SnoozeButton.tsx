'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import { UndoToast } from './UndoToast';

const SNOOZE_OPTIONS: Array<{ label: string; days: number }> = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
];

/**
 * One-click "push this follow-up out" affordance for lead rows on Do This
 * Next / the call list — avoids opening the full lead detail page just to
 * bump nextFollowUpAt by a few days. Shows an undo toast after snoozing,
 * in case of a mis-tap; `previousNextFollowUpAt` is whatever the caller
 * already had in hand (or null if unknown, in which case undo clears it).
 */
export function SnoozeButton({
  leadId,
  previousNextFollowUpAt = null,
  onSnoozed,
  onUndo,
}: {
  leadId: string;
  previousNextFollowUpAt?: string | null;
  onSnoozed?: () => void;
  onUndo?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snoozedLabel, setSnoozedLabel] = useState<string | null>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const panelWidth = 160;
      setCoords({
        top: rect.bottom + window.scrollY + 4,
        left: Math.min(rect.right + window.scrollX - panelWidth, window.scrollX + window.innerWidth - panelWidth - 8),
      });
    };
    place();

    const handleOutside = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node) || buttonRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    document.addEventListener('mousedown', handleOutside);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [open]);

  const patchFollowUp = async (nextFollowUpAt: string | null) => {
    const res = await fetch(`/api/admin/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nextFollowUpAt }),
    });
    return res.ok;
  };

  const handleSnooze = async (opt: { label: string; days: number }) => {
    setSaving(true);
    try {
      const nextFollowUpAt = new Date(Date.now() + opt.days * 24 * 60 * 60 * 1000).toISOString();
      const ok = await patchFollowUp(nextFollowUpAt);
      if (ok) {
        setOpen(false);
        setSnoozedLabel(opt.label);
        onSnoozed?.();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    const ok = await patchFollowUp(previousNextFollowUpAt);
    if (ok) onUndo?.();
  };

  return (
    <>
      {snoozedLabel && (
        <UndoToast
          message={`Snoozed to ${snoozedLabel.toLowerCase()}`}
          onUndo={handleUndo}
          onDismiss={() => setSnoozedLabel(null)}
        />
      )}
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Snooze follow-up"
        className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-amber-300 transition-colors"
      >
        <Clock size={13} />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'absolute', top: coords.top, left: coords.left }}
            className="w-40 rounded-lg border border-white/10 bg-[#0a0a0a] shadow-2xl z-[100] p-1.5"
          >
            {SNOOZE_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                onClick={() => handleSnooze(opt)}
                disabled={saving}
                className="w-full text-left text-xs px-2.5 py-1.5 rounded-md text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
