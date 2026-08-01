'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { LOST_REASON_PRESETS } from '@/lib/leads';

/**
 * Shared "why did this deal die" picker — replaces window.prompt everywhere
 * a lead moves to 'lost', so the reason is structured enough to actually
 * roll up into the Lost Reasons dashboard widget instead of free-text noise.
 */
export function LostReasonModal({
  companyName,
  onConfirm,
  onCancel,
}: {
  companyName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [custom, setCustom] = useState('');

  const handleConfirm = () => {
    const reason = selected === 'Other' ? custom.trim() : selected;
    onConfirm(reason || 'No reason recorded');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0812] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-1">
          <h2 className="text-lg font-bold">Mark {companyName} as lost</h2>
          <button onClick={onCancel} className="text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-white/40 mb-4">Why didn't this one work out? Helps spot patterns later.</p>

        <div className="space-y-1.5 mb-3">
          {LOST_REASON_PRESETS.map((reason) => (
            <label
              key={reason}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-sm transition-colors ${
                selected === reason ? 'border-sky-400/50 bg-sky-400/10' : 'border-white/10 hover:border-white/25'
              }`}
            >
              <input
                type="radio"
                name="lost-reason"
                checked={selected === reason}
                onChange={() => setSelected(reason)}
              />
              {reason}
            </label>
          ))}
          <label
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-sm transition-colors ${
              selected === 'Other' ? 'border-sky-400/50 bg-sky-400/10' : 'border-white/10 hover:border-white/25'
            }`}
          >
            <input type="radio" name="lost-reason" checked={selected === 'Other'} onChange={() => setSelected('Other')} />
            Other
          </label>
        </div>

        {selected === 'Other' && (
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="What happened?"
            autoFocus
            className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder:text-white/30 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
          />
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-medium hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected}
            className="flex-1 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 text-sm font-semibold text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            Mark as Lost
          </button>
        </div>
      </div>
    </div>
  );
}
