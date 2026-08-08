'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileDiff, Plus, Scale, Send, X } from 'lucide-react';
import { Badge, BrandButton, inputClass } from '@/components/admin/ui';
import { dollarsToCents } from '@/lib/billing';
import { formatCentsExact } from '@/lib/pricing';
import { committedRemovals, deltaCents, MAX_LABEL_LENGTH, type ChangeOrderItem } from '@/lib/change-orders';
import {
  CHANGE_SCALES,
  changeOrderVerdict,
  type ChangeScale,
  type ProjectStage,
} from '@/lib/change-order-verdict';

/**
 * Raise a Change Order against a project.
 *
 * This is the only way a project's price moves after it is created. Before it
 * existed, extra work was billed as a separate one-off charge and the
 * contracted total stayed wrong forever — the instalment schedule described a
 * price nobody was paying.
 *
 * It is deliberately not an edit box on the price field. Section 9: "no such
 * work begins until the Client approves the additional scope and fee in
 * writing." So this produces a document, and the client signs it.
 *
 * What it did not do was check whether the change should be billed at all.
 * The contract's answer depends on two things — how big the change is, and
 * which gate the project has passed — and both were being weighed in
 * somebody's head against clauses spread over five sections. So the change is
 * declared minor or major, the stage comes off the project, and the ruling is
 * on screen before the fee is typed. It advises rather than blocks: there are
 * real reasons to raise a change order the contract says is free, and one of
 * them is a client who insists on paying for a fourth round. Overruling it is
 * a decision a person makes, and one that now leaves a trace on the record.
 */

interface ChangeOrderRow {
  id: string;
  number: string;
  summary: string;
  deltaCents: number;
  previousTotalCents: number;
  newTotalCents: number;
  timelineExtensionDays: number;
  status: string;
  token: string;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  signerName: string | null;
  declineNote: string | null;
  /** What it was called when raised, and what the contract said at the time. */
  changeScale?: string | null;
  verdictRuling?: string | null;
  verdictStage?: string | null;
  createdBy: { name: string | null; email: string } | null;
}

interface LineDraft {
  label: string;
  /** Dollars as typed. Converted once, on submit. */
  amount: string;
  kind: 'add' | 'remove';
  workStarted: boolean;
}

const STATUS_TONE: Record<string, 'emerald' | 'amber' | 'sky' | 'red' | 'neutral'> = {
  signed: 'emerald',
  sent: 'sky',
  draft: 'amber',
  declined: 'red',
  withdrawn: 'neutral',
};

export function ChangeOrderPanel({
  projectId,
  totalPrice,
  stage,
  onApplied,
}: {
  projectId: string;
  totalPrice: number;
  /** Where the project has got to, which is half of what decides the ruling. */
  stage: ProjectStage;
  onApplied: () => void;
}) {
  const [orders, setOrders] = useState<ChangeOrderRow[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [summary, setSummary] = useState('');
  const [days, setDays] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([
    { label: '', amount: '', kind: 'add', workStarted: false },
  ]);
  const [changeScale, setChangeScale] = useState<ChangeScale>('major');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Same function the route runs, so what is shown here and what is stored on
  // the document cannot disagree.
  const verdict = useMemo(
    () => changeOrderVerdict(changeScale, stage),
    [changeScale, stage]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/change-orders`);
      const data = await res.json();
      if (res.ok && data.success) setOrders(data.changeOrders || []);
    } catch {
      /* the panel is additive — a failed list must not take the page down */
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const items: ChangeOrderItem[] = lines
    .filter((l) => l.label.trim() && dollarsToCents(l.amount))
    .map((l) => ({
      label: l.label.trim(),
      priceCents: dollarsToCents(l.amount) as number,
      kind: l.kind,
      workStarted: l.kind === 'remove' ? l.workStarted : undefined,
    }));

  // Same function the route and the signing page use, so the number previewed
  // here and the number the client signs cannot diverge.
  const delta = deltaCents(items);
  const newTotal = totalPrice + delta;
  const committed = committedRemovals(items);

  const reset = () => {
    setSummary('');
    setDays('');
    setLines([{ label: '', amount: '', kind: 'add', workStarted: false }]);
    setChangeScale('major');
    setDrafting(false);
    setError('');
  };

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/change-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary,
          items,
          changeScale,
          timelineExtensionDays: Number(days) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      if (data.overpaidCents > 0) {
        setNotice(
          `Heads up: that takes the total below what's already been paid by ${formatCentsExact(data.overpaidCents)}. The remaining payments go to zero — the difference is a refund conversation.`
        );
      } else if (data.unbillableCents > 0) {
        // The schedule cannot carry this and must not pretend to: §9
        // recalculates later instalments, and every one of them is already
        // paid or sitting in the client's inbox. Without this line the extra
        // work is signed for and silently never invoiced.
        setNotice(
          `Heads up: every remaining payment is already paid or invoiced, so ${formatCentsExact(data.unbillableCents)} of this increase has nowhere to go on the schedule. Raise it as a one-off charge once they've signed, or it won't be billed at all.`
        );
      }
      reset();
      await load();
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const act = async (id: string, action: 'send' | 'withdraw') => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/admin/change-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      if (action === 'send' && !data.emailSent) {
        setNotice(
          `The link is live, but the email didn't go out${data.emailReason ? ` — ${data.emailReason}` : ''}. Copy the link and send it yourself.`
        );
      }
      await load();
      onApplied();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileDiff size={15} className="text-sky-300" />
          Change orders
        </h3>
        {!drafting && (
          <button
            onClick={() => setDrafting(true)}
            className="inline-flex items-center gap-1 text-[11px] text-sky-300 transition-colors hover:text-sky-200"
          >
            <Plus size={12} /> Raise one
          </button>
        )}
      </div>

      {notice && (
        <p className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/[0.07] px-3 py-2 text-xs text-amber-200">
          {notice}
        </p>
      )}

      {drafting && (
        <div className="mb-5 space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          {/* Asked first, because it is the question that decides everything
              below it. Nothing can read a request and tell you whether it is
              a nudge or a re-architecture — a person says which, and the
              contract answers from there. */}
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-white/50">
              How big is this change?
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CHANGE_SCALES.map((option) => (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                    changeScale === option.value
                      ? 'border-sky-400/60 bg-sky-400/[0.08]'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                  }`}
                >
                  <span className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="change-scale"
                      value={option.value}
                      checked={changeScale === option.value}
                      onChange={() => setChangeScale(option.value)}
                      className="mt-0.5 shrink-0 accent-sky-400"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-white/85">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-white/40">
                        {option.hint}
                      </span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* The ruling, before the fee gets typed. */}
          <div
            className={`rounded-xl border p-3.5 ${
              verdict.chargeable
                ? verdict.reworkLikely
                  ? 'border-amber-400/35 bg-amber-400/[0.07]'
                  : 'border-sky-400/30 bg-sky-400/[0.06]'
                : 'border-emerald-400/30 bg-emerald-400/[0.06]'
            }`}
          >
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/35">
              <Scale size={11} />
              {verdict.stageLabel}
            </p>
            <p
              className={`mt-1.5 flex items-start gap-1.5 text-sm font-semibold ${
                verdict.chargeable
                  ? verdict.reworkLikely
                    ? 'text-amber-200'
                    : 'text-sky-200'
                  : 'text-emerald-200'
              }`}
            >
              {!verdict.chargeable && <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
              {verdict.headline}
            </p>
            <div className="mt-2 space-y-1.5">
              {verdict.detail.map((line, i) => (
                <p key={i} className="text-[11px] leading-relaxed text-white/55">
                  {line}
                </p>
              ))}
            </div>
            {verdict.timelineNote && (
              <p className="mt-2 border-t border-white/[0.07] pt-2 text-[11px] leading-relaxed text-white/40">
                {verdict.timelineNote}
              </p>
            )}
            <p className="mt-2 text-[10px] text-white/25">{verdict.clauses.join(' · ')}</p>
          </div>

          {!verdict.chargeable && (
            <p className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-white/45">
              You can still raise one — a client who insists on paying, or a round you have agreed
              to bill by exception. It is recorded as raised against a stage where the contract said
              it was included, which is exactly what you would want on the file if it were ever
              questioned.
            </p>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/50">
              What&apos;s changing, and why?
            </label>
            <textarea
              value={summary}
              rows={3}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Adding online booking so patients can self-schedule, agreed on the call of 5 August."
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-white/30">
              This is the document. The client reads this sentence and signs under it.
            </p>
          </div>

          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                <div className="flex gap-2">
                  <select
                    value={line.kind}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, j) =>
                          j === i ? { ...l, kind: e.target.value as 'add' | 'remove' } : l
                        )
                      )
                    }
                    className={`${inputClass} w-24 shrink-0`}
                  >
                    <option value="add">Add</option>
                    <option value="remove">Remove</option>
                  </select>
                  <div className="min-w-0 flex-1">
                    <input
                      value={line.label}
                      maxLength={MAX_LABEL_LENGTH}
                      onChange={(e) =>
                        setLines((prev) => prev.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))
                      }
                      placeholder="Booking integration"
                      className={inputClass}
                    />
                  </div>
                  <div className="w-28 shrink-0">
                    <input
                      value={line.amount}
                      inputMode="decimal"
                      onChange={(e) =>
                        setLines((prev) => prev.map((l, j) => (j === i ? { ...l, amount: e.target.value } : l)))
                      }
                      placeholder="3000"
                      className={inputClass}
                    />
                  </div>
                  {lines.length > 1 && (
                    <button
                      onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                      className="px-1 text-white/30 hover:text-red-300"
                      aria-label="Remove this line"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                {/* Section 9's hinge: a removal whose work has begun keeps its
                    price. Asked here rather than assumed, because only the
                    person raising it knows the answer. */}
                {line.kind === 'remove' && (
                  <label className="mt-2 flex items-start gap-2 text-[11px] text-white/45">
                    <input
                      type="checkbox"
                      checked={line.workStarted}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, j) => (j === i ? { ...l, workStarted: e.target.checked } : l))
                        )
                      }
                      className="mt-0.5"
                    />
                    <span>
                      Work on this has already started
                      <span className="block text-white/25">
                        Then its price is committed — it comes out of scope but not off the fee.
                      </span>
                    </span>
                  </label>
                )}
              </div>
            ))}
            <button
              onClick={() =>
                setLines((prev) => [...prev, { label: '', amount: '', kind: 'add', workStarted: false }])
              }
              className="text-[11px] text-sky-300 hover:text-sky-200"
            >
              + Add a line
            </button>
          </div>

          <div className="w-40">
            <label className="mb-1.5 block text-xs font-medium text-white/50">
              Timeline extension
            </label>
            <input
              value={days}
              inputMode="numeric"
              onChange={(e) => setDays(e.target.value)}
              placeholder="Days"
              className={inputClass}
            />
          </div>

          {items.length > 0 && delta !== 0 && (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5 text-sm">
              <div className="flex justify-between text-white/45">
                <span>Total was</span>
                <span className="tabular-nums">{formatCentsExact(totalPrice)}</span>
              </div>
              <div className={`flex justify-between ${delta > 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                <span>This change</span>
                <span className="tabular-nums">
                  {delta > 0 ? '+' : '−'}
                  {formatCentsExact(Math.abs(delta))}
                </span>
              </div>
              <div className="mt-1.5 flex justify-between border-t border-white/10 pt-1.5 font-semibold">
                <span>New total</span>
                <span className="tabular-nums">{formatCentsExact(newTotal)}</span>
              </div>
              {committed.length > 0 && (
                <p className="mt-2.5 border-t border-white/[0.06] pt-2 text-[11px] text-amber-200/70">
                  {committed.map((c) => c.label).join(', ')} {committed.length === 1 ? 'is' : 'are'}{' '}
                  already started, so {committed.length === 1 ? 'its' : 'their'} price stays on the fee.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <BrandButton variant="quiet" onClick={reset}>
              Cancel
            </BrandButton>
            <BrandButton onClick={create} disabled={busy || !summary.trim() || delta === 0}>
              {busy ? 'Saving…' : 'Save as draft'}
            </BrandButton>
          </div>
        </div>
      )}

      {orders.length === 0 && !drafting ? (
        <p className="text-xs text-white/35">
          The price and scope agreed at signing still stand. Raise a change order to move either —
          the client signs it before it takes effect.
        </p>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <div key={order.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {order.number}
                    <Badge tone={STATUS_TONE[order.status] ?? 'neutral'} solid>
                      {order.status === 'sent' && order.viewedAt
                        ? 'Opened'
                        : order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </Badge>
                  </p>
                  <p className="mt-1 text-xs text-white/45 line-clamp-2">{order.summary}</p>
                  {/* What was true on the day. Six weeks on the project has
                      moved through another gate and the same call would be
                      judged differently, so the answer is kept, not redone. */}
                  {order.verdictStage && (
                    <p className="mt-1 text-[11px] text-white/30">
                      {order.changeScale === 'minor' ? 'Minor' : 'Major'} · {order.verdictStage}
                      {order.verdictRuling === 'included' && (
                        <span className="text-amber-300/70">
                          {' '}
                          · raised despite the contract including it
                        </span>
                      )}
                      {order.verdictRuling === 'change_order_with_rework' && (
                        <span className="text-amber-300/70"> · rework priced in</span>
                      )}
                    </p>
                  )}
                  {order.signedAt && order.signerName && (
                    <p className="mt-1 text-[11px] text-emerald-300/70">
                      Signed by {order.signerName} on {new Date(order.signedAt).toLocaleDateString()}
                    </p>
                  )}
                  {/* The most useful sentence in the whole record, and the one
                      nobody thinks to capture. */}
                  {order.declineNote && (
                    <p className="mt-1 text-[11px] text-red-300/70">
                      Declined: &ldquo;{order.declineNote}&rdquo;
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`text-sm font-semibold tabular-nums ${
                      order.deltaCents > 0 ? 'text-emerald-300' : 'text-amber-300'
                    }`}
                  >
                    {order.deltaCents > 0 ? '+' : '−'}
                    {formatCentsExact(Math.abs(order.deltaCents))}
                  </p>
                  <p className="text-[11px] text-white/30 tabular-nums">
                    → {formatCentsExact(order.newTotalCents)}
                  </p>
                </div>
              </div>

              {order.status !== 'signed' && order.status !== 'withdrawn' && order.status !== 'declined' && (
                <div className="mt-2.5 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-2.5 text-[11px]">
                  <button
                    onClick={() => act(order.id, 'send')}
                    disabled={busy}
                    className="inline-flex items-center gap-1 text-sky-300 transition-colors hover:text-sky-200 disabled:opacity-40"
                  >
                    <Send size={11} /> {order.status === 'sent' ? 'Send again' : 'Send for signature'}
                  </button>
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(`${window.location.origin}/change/${order.token}`)
                    }
                    className="text-white/45 transition-colors hover:text-white"
                  >
                    Copy link
                  </button>
                  <button
                    onClick={() => act(order.id, 'withdraw')}
                    disabled={busy}
                    className="text-white/45 transition-colors hover:text-red-300 disabled:opacity-40"
                  >
                    Withdraw
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
