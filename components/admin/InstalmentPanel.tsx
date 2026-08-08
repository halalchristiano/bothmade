'use client';

import { useCallback, useEffect, useState } from 'react';
import { readDelivery } from '@/lib/invoice-delivery';

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
  /** The durable link. See the GET in the instalments route for why. */
  payUrl?: string | null;
  dueAt: string | null;
  paidAt: string | null;
  emailSentAt: string | null;
  linkClickedAt: string | null;
  linkClicks: number;
  emailOpenedAt: string | null;
  emailOpens: number;
}

const TRIGGER_LABEL: Record<string, string> = {
  signing: 'On signing',
  'design-approval': 'On design approval',
  'ready-for-launch': 'When ready to launch',
};

function money(cents: number): string {
  const hasCents = cents % 100 !== 0;
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  });
}

export function InstalmentPanel({
  projectId,
  onLoaded,
}: {
  projectId: string;
  /**
   * How many rows the project turned out to have. The page around this uses
   * it to stand down its legacy "Collect Balance" button: with a schedule in
   * play that button opens a second, parallel way to take the same money,
   * and the server refuses it — so leaving it on screen offers a click whose
   * only outcome is an error.
   */
  onLoaded?: (count: number) => void;
}) {
  const [instalments, setInstalments] = useState<InstalmentRow[] | null>(null);
  const [sending, setSending] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  /*
   * A load that failed, kept apart from a project that has no schedule.
   *
   * This panel returned null on both, so a payment schedule that could not be
   * fetched looked exactly like a project that never had one — on the screen
   * where somebody decides whether Payment 2 has been sent. "Additive" is the
   * right instinct for a panel that adds detail; it is the wrong one for the
   * only place the money state is shown.
   */
  const [loadFailed, setLoadFailed] = useState(false);
  /** Which payment is waiting on a second press past its contract gate. */
  const [gateAsk, setGateAsk] = useState<{ index: number; reason: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/instalments`);
      if (!res.ok) {
        setLoadFailed(true);
        return;
      }
      const data = await res.json();
      const rows: InstalmentRow[] = data.instalments ?? [];
      setInstalments(rows);
      setLoadFailed(false);
      onLoaded?.(rows.length);
    } catch {
      setLoadFailed(true);
    }
  }, [projectId, onLoaded]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadFailed && !instalments) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-5 text-sm text-amber-100/90"
      >
        <p className="font-semibold">The payment schedule could not be loaded.</p>
        <p className="mt-1 text-xs text-white/50">
          This is a loading problem, not a project without a schedule — do not read it as nothing
          being owed.
        </p>
        <button
          type="button"
          onClick={() => load()}
          className="mt-3 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/5"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!instalments || instalments.length === 0) return null;

  const next = instalments.find((i) => i.status === 'scheduled' || i.status === 'due') ?? null;
  const paidCents = instalments
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + i.amountCents, 0);
  const totalCents = instalments.reduce((sum, i) => sum + i.amountCents, 0);

  async function send(index: number, acknowledgeGate = false) {
    setSending(index);
    setNotice(null);
    setGateAsk(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/instalments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index, ...(acknowledgeGate ? { acknowledgeGate: true } : {}) }),
      });
      const data = await res.json();
      if (res.status === 409 && data.gateNotReached) {
        // Not an error to shrug at — the client would be invoiced for a
        // milestone that has not happened. Asked, then sent on a second press.
        setGateAsk({ index, reason: data.error });
      } else if (!res.ok) {
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
          /**
           * Never landed, landed and ignored, and clicked but not finished
           * want three different responses — a corrected address, a chase, a
           * phone call — and from here they used to look identical: an unpaid
           * invoice and nothing else.
           *
           * Rendered under the row rather than inside it. This panel sits in
           * a narrow column, and a sentence squeezed into what is left beside
           * the Send button wraps into a stack of two-word lines that nobody
           * reads.
           */
          const delivery = inst.status === 'due' ? readDelivery(inst) : null;
          return (
            <li
              key={inst.id}
              className={`rounded-lg border px-3 py-2.5 ${
                isNext ? 'border-sky-400/30 bg-sky-400/[0.05]' : 'border-white/[0.06]'
              }`}
            >
              <div className="flex items-center gap-3">
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
                  className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:opacity-90 disabled:opacity-50"
                >
                  {sending === inst.index
                    ? 'Sending…'
                    : inst.status === 'due'
                    ? 'Re-send'
                    : `Send ${inst.label}`}
                </button>
              )}
              {/*
                payUrl, not paymentUrl. The latter is the Stripe checkout
                itself and is dead 24 hours after it was minted, so a link
                copied out of here and pasted into a message stopped working
                overnight. payUrl goes through /pay, which mints a live
                session when the client clicks it.
              */}
              {inst.status === 'due' && (inst.payUrl || inst.paymentUrl) && (
                <button
                  onClick={() => navigator.clipboard?.writeText((inst.payUrl || inst.paymentUrl)!)}
                  className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/5"
                  title="Copy payment link"
                >
                  Copy link
                </button>
              )}
              </div>

              {delivery && delivery.state !== 'not-sent' && (
                <div className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] leading-relaxed">
                  <p
                    className={
                      delivery.concerning
                        ? 'text-rose-300/80'
                        : delivery.state === 'clicked'
                        ? 'text-amber-300/80'
                        : 'text-white/40'
                    }
                  >
                    {delivery.headline}
                  </p>
                  {delivery.nextStep && <p className="text-white/30">{delivery.nextStep}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/*
        The second press. Phrased as what the client would receive rather than
        as a rule being broken — the person reading it is deciding whether to
        invoice somebody for something that has not happened, and that is the
        sentence they need.
      */}
      {gateAsk && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/[0.07] p-3.5"
        >
          <p className="text-xs font-semibold text-amber-100/90">{gateAsk.reason}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/50">
            Sending it now invoices them for a milestone the project has not reached. That is
            sometimes right — an agreed early payment — but it is not the routine case.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => send(gateAsk.index, true)}
              disabled={sending !== null}
              className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-400/10 disabled:opacity-50"
            >
              Send it anyway
            </button>
            <button
              type="button"
              onClick={() => setGateAsk(null)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/5"
            >
              Not yet
            </button>
          </div>
        </div>
      )}

      {notice && (
        <p className={`mt-3 text-xs ${notice.tone === 'ok' ? 'text-emerald-300' : 'text-amber-300'}`}>
          {notice.text}
        </p>
      )}
    </div>
  );
}
