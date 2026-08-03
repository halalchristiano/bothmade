'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { ConfirmDialog } from '@/components/admin/Modal';
import { LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads';

/**
 * The "this business may be in here twice" warning, with the merge action.
 *
 * First piece carved out of the lead detail page, which had grown to one
 * 3,300-line component. This one owns its state entirely — the page only
 * supplies the duplicate list it already fetched with the lead.
 */
export function DuplicatesBanner({
  leadId,
  duplicates,
}: {
  leadId: string;
  duplicates: Array<{ id: string; company: string; status: string }>;
}) {
  const [pendingMerge, setPendingMerge] = useState<{ id: string; company: string } | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState('');

  const handleMerge = async () => {
    if (!pendingMerge) return;
    setMerging(true);
    setMergeError('');
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duplicateId: pendingMerge.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setMergeError(data?.error ?? "Couldn't merge — nothing was changed.");
        return;
      }
      setPendingMerge(null);
      // The duplicate is gone and this lead gained its history — refetch
      // rather than guessing at the merged shape locally.
      window.location.reload();
    } catch {
      setMergeError('Could not reach the server — nothing was changed.');
    } finally {
      setMerging(false);
    }
  };

  if (duplicates.length === 0) return null;

  return (
    <>
      <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.09] p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold text-amber-100">
          <AlertTriangle size={14} /> This business may already be in here twice
        </p>
        <p className="text-xs text-amber-100/70 mt-1 leading-relaxed">
          Check before you ring — someone may have spoken to them already under the other record.
        </p>
        <div className="mt-2.5 space-y-1.5">
          {duplicates.map((d) => (
            <div key={d.id} className="flex items-stretch gap-1.5">
              <Link
                href={`/admin/leads/${d.id}`}
                className="flex-1 min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/[0.08] transition-colors break-words"
              >
                {d.company} — {LEAD_STATUS_LABELS[d.status as LeadStatus] ?? d.status} →
              </Link>
              <button
                onClick={() => setPendingMerge({ id: d.id, company: d.company })}
                className="shrink-0 rounded-lg border border-amber-400/40 px-2.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/10 transition-colors"
                aria-label={`Merge ${d.company} into this lead`}
              >
                Merge in
              </button>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={pendingMerge !== null}
        onCancel={() => {
          setPendingMerge(null);
          setMergeError('');
        }}
        onConfirm={handleMerge}
        title="Merge that record into this one?"
        description={`"${pendingMerge?.company ?? ''}" will be folded into this lead: its call history moves here in full, blank fields fill in from it, and the further pipeline stage wins. The other record is then deleted. This can't be undone.`}
        confirmLabel="Merge and delete duplicate"
        tone="normal"
        busy={merging}
        error={mergeError}
      />
    </>
  );
}
