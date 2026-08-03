'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquarePlus, Phone, Mail, StickyNote } from 'lucide-react';
import type { LeadActivityType } from '@/lib/leads';

const QUICK_TYPES: Array<{ type: LeadActivityType; label: string; icon: typeof Phone }> = [
  { type: 'call', label: 'Call', icon: Phone },
  { type: 'email', label: 'Email', icon: Mail },
  { type: 'note', label: 'Note', icon: StickyNote },
];

/**
 * Compact inline "log a touch" affordance for lead rows outside the full
 * detail page — leads list, pipeline cards, Do This Next. Posts straight to
 * the same activity endpoint the lead detail page uses.
 *
 * Portals the panel to document.body: several call sites (the leads table,
 * dashboard cards) clip overflow on an ancestor, which would otherwise cut
 * an absolutely-positioned panel off entirely.
 */
export function LogTouchPopover({ leadId, onLogged }: { leadId: string; onLogged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LeadActivityType>('call');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const panelWidth = 256;
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

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content: content.trim() }),
      });
      if (res.ok) {
        setContent('');
        setOpen(false);
        onLogged?.();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Log a touch"
        aria-label="Log a touch"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-emerald-300 transition-colors"
      >
        <MessageSquarePlus size={14} aria-hidden="true" />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Log a touch"
            onClick={(e) => e.stopPropagation()}
            // The panel is portalled out of the row, so Escape has to be
            // handled here rather than bubbling to an ancestor.
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setOpen(false);
                buttonRef.current?.focus();
              }
            }}
            style={{ position: 'absolute', top: coords.top, left: coords.left }}
            className="w-64 rounded-lg border border-white/10 bg-[#0a0a0a] shadow-2xl z-[100] p-3"
          >
            <div className="flex gap-1 mb-2">
              {QUICK_TYPES.map((t) => (
                <button
                  key={t.type}
                  onClick={() => setType(t.type)}
                  className={`flex-1 flex items-center justify-center gap-1 text-[11px] py-1.5 rounded-md border transition-colors ${
                    type === t.type ? 'border-emerald-400/40 text-emerald-300 bg-emerald-400/10' : 'border-white/10 text-white/40 hover:text-white/70'
                  }`}
                >
                  <t.icon size={12} />
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              autoFocus
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What happened?"
              rows={2}
              className="w-full px-2.5 py-2 rounded-md bg-white/[0.04] border border-white/10 text-xs text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-emerald-400/50 resize-none"
            />
            <button
              onClick={handleSave}
              disabled={saving || !content.trim()}
              className="w-full mt-2 py-1.5 rounded-md bg-emerald-400 text-black text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {saving ? 'Logging...' : 'Log it'}
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
