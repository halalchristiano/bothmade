'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, Check, Scale } from 'lucide-react';
import { Card, CardHeader, EmptyState, inputClass } from '@/components/admin/ui';
import { InvoiceActions } from '@/components/admin/InvoiceActions';
import { dollarsToCents } from '@/lib/billing';
import { formatCentsExact } from '@/lib/pricing';

/**
 * "If this ended today, what do they actually get back?"
 *
 * Section 8 of the contract answers it exactly, and the answer moves every
 * time the project passes a gate. Working it out by hand meant re-reading
 * four hundred words and redoing the arithmetic — usually on a call, usually
 * with the client waiting, and usually arriving at a number nobody else
 * checked.
 *
 * So this shows the derivation, not just the total. Which gates have been
 * passed, what each one earned, what has actually been paid, and which clause
 * decided it. Somebody reading this should be able to defend the figure to
 * the client without opening the contract — and should be able to see
 * immediately when the honest answer is "they owe us" rather than a refund,
 * which is a surprisingly common outcome and the one nobody expects.
 */

interface Stage {
  index: number;
  label: string;
  amountCents: number;
  triggerLabel: string;
  gatePassed: boolean;
  paid: boolean;
  earned: boolean;
}

interface RefundableInvoice {
  id: string;
  number: string;
  description: string;
  amountCents: number;
  refundedCents: number;
  status: string;
  grossReceivedCents: number;
  hasCardPayment: boolean;
  remainingCents: number;
  allocatedCents: number;
}

interface Estimate {
  project: { id: string; name: string; company: string; status: string; totalPrice: number };
  explanation: string[];
  allocation: { invoices: RefundableInvoice[]; unallocatedCents: number };
  consumer: boolean;
  agencyRateCents: number;
  adminFeeCents: number;
  entitlement: {
    stages: Stage[];
    gateEarnedCents: number;
    timeEarnedCents: number;
    agencyKeepsCents: number;
    basis: string;
    clause: string;
    paidCents: number;
    refundableCents: number;
    deductions: Array<{ label: string; amountCents: number }>;
    settlement: {
      dueFromClientCents: number;
      returnedToClientCents: number;
      lines: Array<{ label: string; amountCents: number }>;
    };
    needsHours: boolean;
    cautions: string[];
  };
}

type Scenario = 'client-cancels' | 'agency-ends';

export function RefundEstimate({
  projectId,
  onRefunded,
}: {
  projectId: string;
  onRefunded?: () => void;
}) {
  const [scenario, setScenario] = useState<Scenario>('client-cancels');
  const [hours, setHours] = useState('');
  const [processorFee, setProcessorFee] = useState('');
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) {
      setEstimate(null);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ projectId, scenario });
      if (Number(hours) > 0) params.set('hours', hours);
      const fee = dollarsToCents(processorFee);
      if (fee) params.set('processorFee', String(fee));

      const res = await fetch(`/api/admin/billing/refund-estimate?${params}`);
      const data = await res.json();
      setEstimate(res.ok && data.success ? data : null);
    } catch {
      setEstimate(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, scenario, hours, processorFee]);

  // Debounced, because the hours and fee fields are typed into and every
  // keystroke would otherwise be a request.
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const e = estimate?.entitlement;

  return (
    <Card className="p-6">
      <CardHeader
        icon={Scale}
        tone="purple"
        title="If this ended today"
        subtitle="What Section 8 entitles them to, at the stage they're actually at"
      />

      {!projectId ? (
        <EmptyState icon={Scale} text="Pick a customer above to see what a refund would come to." />
      ) : !estimate || !e ? (
        <p className="py-6 text-sm text-white/35">{loading ? 'Working it out…' : 'Nothing to show.'}</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-white/60">
              {estimate.project.company}
              <span className="text-white/30"> · {estimate.project.name}</span>
            </p>
            {estimate.consumer && (
              <span className="rounded-lg border border-sky-400/30 bg-sky-400/[0.07] px-2 py-0.5 text-[11px] text-sky-200">
                Consumer terms
              </span>
            )}
          </div>

          {/* Who is ending it changes the answer more than anything else does
              — 8(g) reverses the whole basis — so it is the first control,
              not a footnote. */}
          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
            {(
              [
                ['client-cancels', 'They cancel'],
                ['agency-ends', 'We end it, or default'],
              ] as Array<[Scenario, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setScenario(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  scenario === key ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Stage by stage — the derivation, not just the total. */}
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-white/30">
              Stage by stage
            </p>
            <div className="space-y-1.5">
              {e.stages.map((stage) => (
                <div
                  key={stage.index}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                    stage.earned
                      ? 'border-emerald-400/20 bg-emerald-400/[0.05]'
                      : 'border-white/[0.06] bg-white/[0.02]'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {stage.label}
                      <span className="ml-2 text-xs font-normal text-white/35">{stage.triggerLabel}</span>
                    </p>
                    {/* Four genuinely different situations, and the one that
                        matters most is the fourth: money paid for a gate that
                        was never reached is the refundable pot, and calling it
                        "never charged for · paid" was a contradiction on the
                        exact row somebody is looking at to find the number. */}
                    <p className="mt-0.5 text-[11px] text-white/35">
                      {stage.gatePassed ? (
                        <span className="text-emerald-300/80">
                          <Check size={9} className="mr-0.5 inline" />
                          {stage.paid
                            ? 'Gate passed — earned and paid'
                            : 'Gate passed — earned, and still payable'}
                        </span>
                      ) : stage.paid ? (
                        <span className="text-sky-300/80">Paid ahead of its gate — this is refundable</span>
                      ) : (
                        'Gate not reached — never delivered, never charged for'
                      )}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 tabular-nums ${stage.earned ? 'font-semibold text-emerald-300' : 'text-white/30'}`}
                  >
                    {formatCentsExact(stage.amountCents)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Inputs the clause actually needs. Hidden when it doesn't. */}
          {(scenario === 'agency-ends' || estimate.consumer) && (
            <div className="flex flex-wrap gap-3">
              <div className="w-40">
                <label className="mb-1.5 block text-xs font-medium text-white/50">Hours worked</label>
                <input
                  value={hours}
                  onChange={(ev) => setHours(ev.target.value)}
                  inputMode="decimal"
                  placeholder="20"
                  className={inputClass}
                />
                <p className="mt-1 text-[11px] text-white/30">
                  at {formatCentsExact(estimate.agencyRateCents)}/hr
                </p>
              </div>
              <div className="w-40">
                <label className="mb-1.5 block text-xs font-medium text-white/50">Processor fees</label>
                <input
                  value={processorFee}
                  onChange={(ev) => setProcessorFee(ev.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
            </div>
          )}
          {scenario === 'client-cancels' && !estimate.consumer && (
            <div className="w-40">
              <label className="mb-1.5 block text-xs font-medium text-white/50">Processor fees</label>
              <input
                value={processorFee}
                onChange={(ev) => setProcessorFee(ev.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className={inputClass}
              />
            </div>
          )}

          {/* The maths */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between text-white/55">
                <dt>They&apos;ve paid</dt>
                <dd className="tabular-nums">{formatCentsExact(e.paidCents)}</dd>
              </div>
              <div className="flex justify-between text-white/55">
                <dt>We&apos;ve earned</dt>
                <dd className="tabular-nums">{formatCentsExact(e.agencyKeepsCents)}</dd>
              </div>
              {e.deductions.map((d) => (
                <div key={d.label} className="flex justify-between text-white/40">
                  <dt>Less: {d.label}</dt>
                  <dd className="tabular-nums">−{formatCentsExact(d.amountCents)}</dd>
                </div>
              ))}

              {/* Section 8(l)'s two lines. Both printed even when one is zero
                  — the point of the clause is that there is no third number
                  hiding anywhere. */}
              <div
                className={`flex justify-between border-t border-white/10 pt-2 ${
                  e.settlement.dueFromClientCents > 0 ? 'font-bold text-amber-300' : 'text-white/35'
                }`}
              >
                <dt>Amount due from the client</dt>
                <dd className="tabular-nums">{formatCentsExact(e.settlement.dueFromClientCents)}</dd>
              </div>
              <div
                className={`flex justify-between ${
                  e.settlement.returnedToClientCents > 0 ? 'font-bold text-emerald-300' : 'text-white/35'
                }`}
              >
                <dt>Amount returned to the client</dt>
                <dd className="tabular-nums">{formatCentsExact(e.settlement.returnedToClientCents)}</dd>
              </div>
            </dl>

            <p className="mt-3 border-t border-white/[0.06] pt-3 text-[11px] text-white/35">
              <span className="text-white/50">Section {e.clause}:</span> {e.basis}
            </p>
          </div>

          {e.needsHours && (
            <p className="rounded-lg border border-amber-400/30 bg-amber-400/[0.07] px-3 py-2 text-xs text-amber-200">
              This clause is priced on time worked — enter the hours or the figure above is just zero,
              not an answer.
            </p>
          )}

          {e.cautions.map((caution) => (
            <p
              key={caution}
              className="flex items-start gap-2 text-[11px] leading-relaxed text-white/40"
            >
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-300/60" />
              {caution}
            </p>
          ))}

          {/* In plain English, built from this project's actual numbers.
              Never a stock paragraph: a generic explanation under a specific
              figure reads as an explanation OF that figure and gets trusted
              like one, and is wrong exactly when the situation isn't the
              common case — which is when somebody is reading it. */}
          {estimate.explanation.length > 0 && (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
              <p className="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-white/30">
                <BookOpen size={11} /> In plain English
              </p>
              <div className="space-y-2.5">
                {estimate.explanation.map((para, i) => (
                  <p key={i} className="text-sm leading-relaxed text-white/65">
                    {para}
                  </p>
                ))}
              </div>
              <p className="mt-3 border-t border-white/[0.06] pt-3 text-[11px] text-white/35">
                This comes from <span className="text-white/55">Section {e.clause}</span> of the
                agreement {estimate.project.company} signed.
              </p>
            </div>
          )}

          {/* Which invoice the money actually comes off.
              The entitlement above is one number about the whole project;
              every refund goes against one invoice. Without sharing the pot
              out first, the same $11,750 could be refunded off two invoices
              and twice that would leave the account. */}
          {estimate.allocation.invoices.length > 0 && (
            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-white/30">
                Refund it against
              </p>
              <div className="space-y-1.5">
                {estimate.allocation.invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {inv.number}
                        <span className="ml-2 font-normal text-white/40">{inv.description}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-white/35">
                        {formatCentsExact(inv.remainingCents)} left on it
                        {inv.refundedCents > 0 && ` · ${formatCentsExact(inv.refundedCents)} already back`}
                      </p>
                      {/* Part paid, and so refundable for what came in rather
                          than for what it asks for. Saying which is the
                          difference between a number that looks wrong and one
                          that explains itself. */}
                      {inv.status !== 'paid' && (
                        <p className="mt-0.5 text-[11px] text-sky-300/70">
                          Still open — {formatCentsExact(inv.grossReceivedCents)} of{' '}
                          {formatCentsExact(inv.amountCents)} came in
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums text-emerald-300">
                        {formatCentsExact(inv.allocatedCents)}
                      </span>
                      <div className="flex items-center gap-3 text-[11px]">
                        <InvoiceActions
                          invoice={{
                            id: inv.id,
                            number: inv.number,
                            description: inv.description,
                            amountCents: inv.amountCents,
                            status: inv.status,
                            refundedCents: inv.refundedCents,
                            grossReceivedCents: inv.grossReceivedCents,
                            receivedCents: inv.grossReceivedCents - inv.refundedCents,
                            hasCardPayment: inv.hasCardPayment,
                            sentToEmail: null,
                          }}
                          onDone={() => {
                            load();
                            onRefunded?.();
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-white/30">
                Each amount is capped at both what&apos;s left on that invoice and what&apos;s left of
                the entitlement, so refunding every line here comes to exactly{' '}
                {formatCentsExact(e.settlement.returnedToClientCents)} — never twice.
              </p>
            </div>
          )}

          {/* Money owed with no invoice behind it. Real on older projects,
              where the deposit predates the invoice ledger. */}
          {estimate.allocation.unallocatedCents > 0 && (
            <p className="rounded-lg border border-amber-400/30 bg-amber-400/[0.07] px-3 py-2 text-xs text-amber-200">
              {formatCentsExact(estimate.allocation.unallocatedCents)} of this has no invoice to come
              off — it was paid before the invoice ledger existed, or recorded by hand. It still has
              to go back; it just has to go back another way.
            </p>
          )}

          <p className="text-[11px] text-white/25">
            An estimate from the contract. The figures update as the project moves — nothing here
            has refunded anything until you use a button above.
          </p>
        </div>
      )}
    </Card>
  );
}
