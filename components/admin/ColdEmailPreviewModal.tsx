'use client';

import { useEffect, useState } from 'react';
import { Send, Loader2, UserX, Undo2, AlertTriangle } from 'lucide-react';
import { buildFallbackColdEmailDraft } from '@/lib/leads';
import { FALLBACK_SENDER_NAME, renderColdEmail } from '@/lib/cold-email';
import { Modal, ModalCloseButton } from './Modal';

interface PreviewLead {
  id: string;
  company: string;
  contactName: string | null;
  email: string | null;
  coldEmailDraft: string | null;
  painPoints: string;
  personalizedObservation: string | null;
}

export function ColdEmailPreviewModal({
  leads,
  sending,
  gmailConnected,
  onClose,
  onConfirm,
}: {
  leads: PreviewLead[];
  sending: boolean;
  gmailConnected?: boolean | null;
  onClose: () => void;
  onConfirm: (leadIds: string[]) => void;
}) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [senderFullName, setSenderFullName] = useState(FALLBACK_SENDER_NAME);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        const name = data?.user?.name as string | undefined;
        if (name) setSenderFullName(name);
      })
      .catch(() => {});
  }, []);

  const toggleExclude = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const included = leads.filter((l) => !excluded.has(l.id));

  return (
    <Modal
      title="Review before sending"
      subtitle="Exactly what each recipient will get — uncheck any you want to skip."
      onClose={onClose}
      size="max-w-2xl"
      panelClassName="max-h-[88vh] flex flex-col"
      showHeader={false}
      // Mid-review the selection of who to skip is real work; a stray click
      // on the backdrop shouldn't throw it away.
      closeOnBackdrop={false}
    >
      <>
        <div className="flex items-start justify-between gap-3 p-6 pb-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-lg font-bold">Review before sending</h2>
            <p className="text-xs text-white/40 mt-0.5">
              Exactly what each recipient will get — uncheck any you want to skip.
            </p>
          </div>
          <ModalCloseButton onClose={onClose} />
        </div>

        {gmailConnected === false && (
          <div className="flex items-start gap-2 mx-6 mt-4 p-3 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-300/90 text-xs">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              Your Gmail isn't connected — these will send from a shared address instead of yours, and won't
              show up in your Sent folder. Connect it in Settings first if that matters to you.
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-3">
          {leads.map((lead) => {
            const isExcluded = excluded.has(lead.id);
            const isGeneric = !lead.coldEmailDraft;
            const draft =
              lead.coldEmailDraft ||
              buildFallbackColdEmailDraft({
                company: lead.company,
                painPoints: lead.painPoints,
                personalizedObservation: lead.personalizedObservation,
              });
            // Same call the send route makes, so this preview is the send.
            const { subject, body } = renderColdEmail(draft, lead, senderFullName);

            return (
              <div
                key={lead.id}
                className={`rounded-xl border p-4 transition-colors ${
                  isExcluded ? 'border-white/[0.06] bg-white/[0.01]' : 'border-white/10 bg-white/[0.03]'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  {/* Only the preview dims when skipped — the button that undoes it
                      has to stay legible, or the card looks broken rather than off. */}
                  <div className={`min-w-0 transition-opacity ${isExcluded ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold truncate">{lead.company}</p>
                      {isGeneric && (
                        <span className="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-sky-400/10 text-sky-300 border border-sky-400/20">
                          Generic
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/40 truncate">To: {lead.email}</p>
                  </div>
                  <button
                    onClick={() => toggleExclude(lead.id)}
                    aria-pressed={isExcluded}
                    title={isExcluded ? 'Include in this send' : 'Skip this one'}
                    // Fixed width: the label swaps on click, and a resizing button
                    // shoves the row around under the cursor.
                    className={`shrink-0 w-24 whitespace-nowrap flex items-center justify-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      isExcluded
                        ? 'border-white/20 text-white/70 hover:bg-white/5 hover:text-white hover:border-white/35'
                        : 'border-red-400/20 text-red-300/70 hover:bg-red-400/10 hover:text-red-300'
                    }`}
                  >
                    {isExcluded ? <Undo2 size={11} aria-hidden="true" /> : <UserX size={11} aria-hidden="true" />}
                    {isExcluded ? 'Undo skip' : 'Skip'}
                  </button>
                </div>
                <div className={`transition-opacity ${isExcluded ? 'opacity-40' : ''}`}>
                  <p
                    className={`text-sm font-medium text-white/80 mb-1 ${isExcluded ? 'line-through decoration-white/30' : ''}`}
                  >
                    {subject}
                  </p>
                  <p className="text-xs text-white/50 whitespace-pre-line leading-relaxed max-h-32 overflow-y-auto">
                    {body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 p-6 pt-4 border-t border-white/[0.06]">
          <p className="text-xs text-white/40">
            {included.length} of {leads.length} will send
            {excluded.size > 0 ? ` (${excluded.size} skipped)` : ''}.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(included.map((l) => l.id))}
              disabled={sending || included.length === 0}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {sending ? (
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              ) : (
                <Send size={15} aria-hidden="true" />
              )}
              {sending ? 'Sending...' : `Send ${included.length} now`}
            </button>
          </div>
        </div>
      </>
    </Modal>
  );
}
