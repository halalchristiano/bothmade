'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Phone, ExternalLink, ChevronRight, Clock } from 'lucide-react';
import { buildLeadBrief } from '@/lib/call-brief';
import { CALL_OUTCOMES, type CallOutcome } from '@/lib/call-outcomes';
import { OBJECTIONS } from '@/lib/objections';
import { buildFollowUpDraft, type FollowUpDraft } from '@/lib/follow-up-emails';
import { LOST_REASON_PRESETS, LEAD_STATUS_LABELS, type PainPointKey } from '@/lib/leads';
import { leadLocalTime } from '@/lib/local-time';
import { Kicker, BrandButton, inputClass } from '@/components/admin/ui';

/**
 * Call HQ — the live-call cockpit.
 *
 * The lead page keeps the full dossier, but it splits what a rep needs
 * DURING a call across two tabs: the script lives on Brief, the outcome
 * logger on The call, and flipping between them mid-conversation is exactly
 * the moment nobody has a spare hand. This screen is that moment, laid out
 * as one view: queue on the left, words to say in the middle, everything to
 * press on the right — script, objections, one-tap outcomes, lost-reason
 * chips (the API always accepted a reason; the old UI just never offered
 * one), and the pre-written follow-up the instant an outcome is logged.
 */

interface QueueLead {
  id: string;
  company: string;
  contactName: string | null;
  reason: string;
}

interface LeadDetail {
  id: string;
  company: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  customPainPoints: string | null;
  essentialPoints: string | null;
  upsellPoints: string | null;
  painPoints: PainPointKey[];
  estimateLowCents: number | null;
  estimateHighCents: number | null;
  assignedTo?: { name: string | null } | null;
  activities: { id: string; type: string; content: string; createdAt: string; createdBy?: { name: string | null } | null }[];
  mockupUrl?: string | null;
}

const REASON_LABEL: Record<string, string> = {
  replied: 'Replied',
  bounced: 'Email bounced',
  overdue: 'Overdue',
  today: 'Due today',
  'no-follow-up': 'No follow-up set',
  'never-contacted': 'Never contacted',
  scheduled: 'Scheduled',
};

function money(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function CallCockpit() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.leadId as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [queue, setQueue] = useState<QueueLead[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Outcome state
  const [pendingOutcome, setPendingOutcome] = useState<CallOutcome | null>(null);
  const [outcomeDate, setOutcomeDate] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Post-outcome follow-up
  const [draft, setDraft] = useState<FollowUpDraft | null>(null);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [sendingDraft, setSendingDraft] = useState(false);
  const [draftDone, setDraftDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`);
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await res.json();
      if (data?.success) setLead(data.lead);
      else setLoadError(true);
    } catch {
      setLoadError(true);
    }
  }, [leadId, router]);

  useEffect(() => {
    load();
    fetch('/api/admin/leads/call-list')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) setQueue(data.callable ?? []);
      })
      .catch(() => {});
  }, [load]);

  // Local-time chip stays honest across a long session.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const brief = useMemo(() => (lead ? buildLeadBrief(lead) : null), [lead]);
  const local = lead ? leadLocalTime(lead.phone, now) : null;

  const positionInQueue = queue.findIndex((q) => q.id === leadId);
  const nextInQueue = positionInQueue >= 0 ? queue[positionInQueue + 1] : queue[0];

  async function logOutcome(outcome: CallOutcome) {
    if (!lead) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}/call-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome: outcome.key,
          note: note.trim() || undefined,
          followUpAt: outcomeDate || undefined,
          // The route always took a reason; the old UI never sent one, so
          // every phone loss was recorded as a generic shrug.
          lostReason: outcome.status === 'lost' ? lostReason || undefined : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || 'Could not log the call — it has NOT been saved.');
        return;
      }
      setPendingOutcome(null);
      setNote('');
      setOutcomeDate('');
      setLostReason('');
      const followUp = buildFollowUpDraft(outcome.key, {
        company: lead.company,
        contactName: lead.contactName,
        senderName: lead.assignedTo?.name ?? null,
        essentials: brief?.essentials ?? [],
        low: brief?.low ?? null,
        high: brief?.high ?? null,
      });
      if (followUp && lead.email) {
        setDraft(followUp);
        setDraftSubject(followUp.subject);
        setDraftBody(followUp.body);
        setDraftDone(null);
      }
      await load();
    } catch {
      setActionError('Could not log the call — it has NOT been saved.');
    } finally {
      setSaving(false);
    }
  }

  async function sendFollowUp() {
    if (!lead) return;
    setSendingDraft(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: draftSubject, body: draftBody }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || "The follow-up didn't send.");
        return;
      }
      setDraft(null);
      setDraftDone('Follow-up sent.');
      await load();
    } catch {
      setActionError("The follow-up didn't send.");
    } finally {
      setSendingDraft(false);
    }
  }

  if (loadError) {
    return <p className="p-8 text-amber-300 text-sm">Couldn&apos;t load this lead — refresh to retry.</p>;
  }
  if (!lead || !brief) {
    return <p className="p-8 text-white/40 text-sm">Loading the call…</p>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Queue rail */}
      <aside className="hidden xl:flex w-64 shrink-0 flex-col border-r border-white/[0.08]">
        <div className="px-4 py-4 border-b border-white/[0.08]">
          <Kicker>Call queue</Kicker>
          <p className="text-sm text-white/50 mt-1.5">{queue.length} to call</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {queue.map((q, i) => (
            <Link
              key={q.id}
              href={`/admin/call/${q.id}`}
              className={`block px-4 py-3 border-b border-white/[0.04] transition-colors ${
                q.id === leadId ? 'bg-white/[0.05] border-l-2 border-l-sky-400' : 'hover:bg-white/[0.03]'
              }`}
            >
              <p className="text-sm font-medium truncate">{q.company}</p>
              <p className="text-[11px] text-white/35">
                {i + 1} · {REASON_LABEL[q.reason] ?? q.reason}
              </p>
            </Link>
          ))}
          {queue.length === 0 && <p className="px-4 py-6 text-xs text-white/30">Queue is empty.</p>}
        </div>
      </aside>

      {/* Main: header + script + actions */}
      <div className="flex-1 min-w-0">
        {/* Header — who, where, when, and the dial button. */}
        <div className="sticky top-0 z-20 bg-ink/95 backdrop-blur border-b border-white/[0.08] px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{lead.company}</h1>
              <p className="text-xs text-white/40 truncate">
                {lead.contactName || 'No named contact'} · {LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS] ?? lead.status}
                {brief.low > 0 && (
                  <>
                    {' '}
                    · quoting {money(brief.low)}–{money(brief.high)}
                  </>
                )}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {local && (
                <span
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                    local.callability === 'good'
                      ? 'border-emerald-400/30 text-emerald-300'
                      : local.callability === 'okay'
                      ? 'border-amber-400/30 text-amber-300'
                      : 'border-red-400/30 text-red-300'
                  }`}
                >
                  <Clock size={11} />
                  {local.time} their time
                </span>
              )}
              {lead.phone ? (
                <a
                  href={`tel:${lead.phone}`}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
                >
                  <Phone size={15} />
                  {lead.phone}
                </a>
              ) : (
                <span className="text-xs text-amber-300">No phone on file</span>
              )}
              <Link
                href={`/admin/leads/${lead.id}`}
                className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-xs text-white/70 hover:bg-white/5"
              >
                Full lead
                <ExternalLink size={12} />
              </Link>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-0">
          {/* The script */}
          <div className="px-5 py-6 space-y-6 min-w-0">
            <Kicker>The words</Kicker>
            {brief.script.map((block, i) => (
              <div key={i}>
                <h2 className="text-[13px] font-semibold text-white/80 mb-2">{block.heading}</h2>
                {block.kind === 'spoken' ? (
                  <div className="space-y-2">
                    {block.lines.map((line, j) => (
                      <p key={j} className="text-[15px] leading-relaxed text-white border-l-2 border-sky-400/40 pl-3">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {block.lines.map((line, j) => (
                      <p key={j} className="text-[13px] leading-relaxed text-white/45 italic pl-3">
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Objections, in reach without leaving the screen */}
            <div className="pt-2">
              <Kicker className="mb-3">When they push back</Kicker>
              <div className="space-y-2">
                {OBJECTIONS.map((o) => (
                  <details key={o.slug} className="group rounded-lg border border-white/[0.07] bg-white/[0.02]">
                    <summary className="flex cursor-pointer items-center justify-between px-3 py-2.5 text-sm text-white/70 hover:text-white list-none">
                      <span>&ldquo;{o.trigger}&rdquo;</span>
                      <ChevronRight size={14} className="transition-transform group-open:rotate-90 text-white/30" />
                    </summary>
                    <div className="px-3 pb-3 space-y-2 text-[13px]">
                      <p className="text-white/40 italic">{o.meaning}</p>
                      <p className="text-white border-l-2 border-emerald-400/40 pl-3">{o.response}</p>
                      <p className="text-white/40">{o.thenWhat}</p>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </div>

          {/* The actions */}
          <div className="border-l border-white/[0.08] px-5 py-6 space-y-5">
            <div>
              <Kicker className="mb-3">How did it go?</Kicker>
              <div className="grid grid-cols-2 gap-2">
                {CALL_OUTCOMES.map((o) => (
                  <button
                    key={o.key}
                    onClick={() => {
                      setPendingOutcome((prev) => (prev?.key === o.key ? null : o));
                      setActionError(null);
                    }}
                    className={`rounded-lg border px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
                      pendingOutcome?.key === o.key
                        ? 'border-sky-400/50 bg-sky-400/10 text-white'
                        : o.tone === 'good'
                        ? 'border-emerald-400/20 text-emerald-200 hover:bg-emerald-400/5'
                        : o.tone === 'bad'
                        ? 'border-red-400/20 text-red-200 hover:bg-red-400/5'
                        : 'border-white/10 text-white/70 hover:bg-white/5'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {pendingOutcome && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
                  <p className="text-xs text-white/50">{pendingOutcome.hint}</p>

                  {pendingOutcome.status === 'lost' && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-white/40 mb-1.5">Why? (goes on the record)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {LOST_REASON_PRESETS.map((r) => (
                          <button
                            key={r}
                            onClick={() => setLostReason((prev) => (prev === r ? '' : r))}
                            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                              lostReason === r
                                ? 'border-red-400/50 bg-red-400/10 text-red-200'
                                : 'border-white/15 text-white/50 hover:text-white'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(pendingOutcome.askForDate || pendingOutcome.followUpDays !== null) && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-white/40 mb-1.5">
                        {pendingOutcome.askForDate ? 'When? (required)' : 'Next follow-up'}
                      </p>
                      <input type="date" value={outcomeDate} onChange={(e) => setOutcomeDate(e.target.value)} className={inputClass} />
                      {!pendingOutcome.askForDate && pendingOutcome.followUpDays !== null && (
                        <p className="text-[11px] text-white/35 mt-1">
                          Leave blank and it&apos;ll set one for {pendingOutcome.followUpDays} days&apos; time.
                        </p>
                      )}
                    </div>
                  )}

                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Anything worth remembering from the call (optional)"
                    rows={2}
                    className={inputClass}
                  />

                  <BrandButton
                    onClick={() => logOutcome(pendingOutcome)}
                    disabled={saving || (pendingOutcome.askForDate === true && !outcomeDate)}
                    className="w-full"
                  >
                    {saving ? 'Saving…' : `Log it — ${pendingOutcome.label.toLowerCase()}`}
                  </BrandButton>
                </div>
              )}

              {actionError && <p className="mt-2 text-xs text-amber-300">{actionError}</p>}
              {draftDone && !draft && <p className="mt-2 text-xs text-emerald-300">{draftDone}</p>}
            </div>

            {/* The follow-up, offered the moment it's relevant */}
            {draft && (
              <div className="rounded-xl border border-sky-400/25 bg-sky-400/[0.04] p-3 space-y-2.5">
                <div>
                  <p className="text-[13px] font-semibold text-white">Send the follow-up now?</p>
                  <p className="text-[11px] text-white/40 mt-0.5">{draft.why}</p>
                </div>
                <input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} className={inputClass} aria-label="Follow-up subject" />
                <textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={7} className={`${inputClass} font-mono text-[12px]`} aria-label="Follow-up body" />
                <div className="flex gap-2">
                  <BrandButton onClick={sendFollowUp} disabled={sendingDraft} className="flex-1">
                    {sendingDraft ? 'Sending…' : `Send to ${lead.email}`}
                  </BrandButton>
                  <BrandButton variant="quiet" onClick={() => setDraft(null)}>
                    Skip
                  </BrandButton>
                </div>
              </div>
            )}

            {/* What happened last time — in view before the dial, not five cards deep. */}
            <div>
              <Kicker className="mb-3">Last time</Kicker>
              <div className="space-y-2.5">
                {lead.activities.slice(0, 5).map((a) => (
                  <div key={a.id} className="text-[12px] leading-relaxed">
                    <p className="text-white/30">
                      {new Date(a.createdAt).toLocaleDateString()} · {a.createdBy?.name ?? 'System'}
                    </p>
                    <p className="text-white/65 whitespace-pre-wrap line-clamp-3">{a.content}</p>
                  </div>
                ))}
                {lead.activities.length === 0 && (
                  <p className="text-xs text-white/30">First contact — no history yet.</p>
                )}
              </div>
            </div>

            {nextInQueue && nextInQueue.id !== leadId && (
              <Link
                href={`/admin/call/${nextInQueue.id}`}
                className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 transition-colors"
              >
                <span>
                  Next: <span className="text-white">{nextInQueue.company}</span>
                </span>
                <ChevronRight size={15} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
