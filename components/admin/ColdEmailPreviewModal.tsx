'use client';

import { useEffect, useState } from 'react';
import { X, Send, Loader2, UserX } from 'lucide-react';
import { buildFallbackColdEmailDraft } from '@/lib/leads';

interface PreviewLead {
  id: string;
  company: string;
  contactName: string | null;
  email: string | null;
  coldEmailDraft: string | null;
  painPoints: string;
  personalizedObservation: string | null;
}

/** Mirrors the server's splitDraft() in send-cold-drafts/route.ts so the preview matches exactly what gets sent. */
function splitDraft(draft: string, company: string): { subject: string; body: string } {
  const match = draft.match(/^Subject:\s*(.+?)\r?\n+([\s\S]*)$/i);
  if (match) return { subject: match[1].trim(), body: match[2].trim() };
  return { subject: `Thoughts on ${company}`, body: draft.trim() };
}

export function ColdEmailPreviewModal({
  leads,
  sending,
  onClose,
  onConfirm,
}: {
  leads: PreviewLead[];
  sending: boolean;
  onClose: () => void;
  onConfirm: (leadIds: string[]) => void;
}) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [senderFullName, setSenderFullName] = useState('The Bothmade Team');

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border border-white/10 bg-[#0a0812] shadow-2xl">
        <div className="flex items-start justify-between gap-3 p-6 pb-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-lg font-bold">Review before sending</h2>
            <p className="text-xs text-white/40 mt-0.5">
              Exactly what each recipient will get — uncheck any you want to skip.
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white shrink-0">
            <X size={18} />
          </button>
        </div>

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
            const { subject, body } = splitDraft(draft, lead.company);
            const firstName = lead.contactName?.split(' ')[0] || 'there';
            const personalizedBody = body
              .replace(/\[First Name\]/gi, firstName)
              .replace(/\[Sender Name\]/gi, senderFullName);

            return (
              <div
                key={lead.id}
                className={`rounded-xl border p-4 transition-opacity ${
                  isExcluded ? 'border-white/[0.06] bg-white/[0.01] opacity-40' : 'border-white/10 bg-white/[0.03]'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
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
                    title={isExcluded ? 'Include in this send' : 'Skip this one'}
                    className={`shrink-0 flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      isExcluded
                        ? 'border-white/15 text-white/40 hover:text-white hover:border-white/30'
                        : 'border-red-400/20 text-red-300/70 hover:bg-red-400/10 hover:text-red-300'
                    }`}
                  >
                    <UserX size={11} /> {isExcluded ? 'Skipped' : 'Skip'}
                  </button>
                </div>
                <p className="text-sm font-medium text-white/80 mb-1">{subject}</p>
                <p className="text-xs text-white/50 whitespace-pre-line leading-relaxed max-h-32 overflow-y-auto">
                  {personalizedBody}
                </p>
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
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {sending ? 'Sending...' : `Send ${included.length} now`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
