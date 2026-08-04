'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * The project's three-payment schedule, and the button that sends the next
 * one.
 *
 * Built for the moment Evan actually has: the client just approved the
 * design (or the build is finished), and the next payment needs to go out
 * *now*, with its invoice, from the page he's already on. One glance answers
 * where the money stands; one click sends the next instalment with its
 * branded invoice and personalised email. Everything else — numbering,
 * Stripe session, gate context — is the server's job.
 *
 * Legacy projects without instalment rows render nothing; the old balance
 * flow still covers them.
 */

interface InstalmentRow {
  id: string;
  index: number;
  count: number;
  label: string;
  percent: number;
  amountCents: number;
  trigger: string;
  status: 'scheduled' | 'due' | 'paid' | 'void';
  invoiceNumber: string | null;
  paymentUrl: string | null;
  dueAt: string | null;
  paidAt: string | null;
  emailSentAt: string | null;
}

const TRIGGER_LABEL: Record<string, string> = {
  signing: 'On signing',
  'design-approval': 'On design approval',
  'ready-for-launch': 'When ready to launch',
};

function money(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function InstalmentPanel({ projectId }: { projectId: string }) {
  const [instalments, setInstalments] = useState<InstalmentRow[] | null>(null);
  const [sending, setSending] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/instalments`);
      if (!res.ok) return;
      const data = await res.json();
      setInstalments(data.instalments ?? []);
    } catch {
      // The panel is additive — a fetch failure just leaves it unrendered.
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!instalments || instalments.length === 0) return null;

  const next = instalments.find((i) => i.status === 'scheduled' || i.status === 'due') ?? null;
  const paidCents = instalments
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + i.amountCents, 0);
  const totalCents = instalments.reduce((sum, i) => sum + i.amountCents, 0);

  async function send(index: number) {
    setSending(index);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/instalments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ tone: 'error', text: data.error || 'Could not send the payment.' });
      } else if (!data.emailSent) {
        setNotice({
          tone: 'error',
          text: `Invoice ${data.instalment?.invoiceNumber ?? ''} and payment link are ready, but the email didn't send${data.emailReason ? ` — ${data.emailReason}` : ''}. Copy the link and send it by hand.`,
        });
      } else {
        setNotice({ tone: 'ok', text: `${data.instalment.label} sent — invoice ${data.instalment.invoiceNumber} is in their inbox.` });
      }
      await load();
    } catch {
      setNotice({ tone: 'error', text: 'Could not send the payment — try again.' });
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="text-sm font-semibold text-white">Payment schedule</h3>
        <span className="text-xs text-white/40">
          {money(paidCents)} of {money(totalCents)} collected
        </span>
      </div>
      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-purple-500 transition-all"
          style={{ width: `${totalCents > 0 ? Math.round((paidCents / totalCents) * 100) : 0}%` }}
        />
      </div>

      <ul className="space-y-2">
        {instalments.map((inst) => {
          const isNext = next?.id === inst.id;
          return (
            <li
              key={inst.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                isNext ? 'border-sky-400/30 bg-sky-400/[0.05]' : 'border-white/[0.06]'
              }`}
            >
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  inst.status === 'paid'
                    ? 'bg-emerald-400/20 text-emerald-300'
                    : inst.status === 'due'
                    ? 'bg-sky-400/20 text-sky-300'
                    : 'bg-white/[0.06] text-white/40'
                }`}
              >
                {inst.status === 'paid' ? '✓' : inst.index}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">
                  {inst.label}
                  <span className="text-white/40"> · {money(inst.amountCents)}</span>
                </p>
                <p className="text-[11px] text-white/35 truncate">
                  {inst.status === 'paid' && inst.paidAt
                    ? `Paid ${new Date(inst.paidAt).toLocaleDateString()}`
                    : inst.status === 'due'
                    ? `Invoiced${inst.invoiceNumber ? ` ${inst.invoiceNumber}` : ''}${inst.dueAt ? ` · due ${new Date(inst.dueAt).toLocaleDateString()}` : ''}`
                    : TRIGGER_LABEL[inst.trigger] ?? inst.trigger}
                </p>
              </div>
              {inst.status !== 'paid' && isNext && (
                <button
                  onClick={() => send(inst.index)}
                  disabled={sending !== null}
                  className="shrink-0 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50"
                >
                  {sending === inst.index
                    ? 'Sending…'
                    : inst.status === 'due'
                    ? 'Re-send'
                    : `Send ${inst.label}`}
                </button>
              )}
              {inst.status === 'due' && inst.paymentUrl && (
                <button
                  onClick={() => navigator.clipboard?.writeText(inst.paymentUrl!)}
                  className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/5"
                  title="Copy payment link"
                >
                  Copy link
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {notice && (
        <p className={`mt-3 text-xs ${notice.tone === 'ok' ? 'text-emerald-300' : 'text-amber-300'}`}>
          {notice.text}
        </p>
      )}
    </div>
  );
}
