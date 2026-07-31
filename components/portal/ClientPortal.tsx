'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  estimate,
  formatDelta,
  formatMoney,
  getCarePlan,
  getProject,
  getTimeline,
} from '@/lib/pricing';
import { PHASES, phaseIndex, type PortalClient } from '@/lib/portal';
import { sectionsFor, formStats } from '@/lib/onboarding';
import { OnboardingForm } from '@/components/portal/OnboardingForm';

/**
 * The client's home for the whole project: what they bought, what they owe,
 * what we need from them, and where the build has got to.
 *
 * One page rather than an app with navigation. A client visits this a handful
 * of times over three months and should never have to remember where anything
 * lives — the four things they care about are stacked in the order they will
 * need them.
 */

export function ClientPortal({
  client,
  token,
  paid,
  cancelled,
}: {
  client: PortalClient;
  token: string;
  /** Verified server-side against Stripe — never inferred from the URL. */
  paid: boolean;
  cancelled: boolean;
}) {
  const est = estimate(client.selection);
  const project = getProject(client.selection.project);
  const timeline = getTimeline(client.selection.timeline);
  const care = getCarePlan(client.selection.care);
  const sections = sectionsFor(client.selection.project);
  const stats = formStats(client.selection.project);

  const deposit = Math.round((est.total * client.depositPercent) / 100);
  const balance = est.total - deposit;
  const current = phaseIndex(client.phase);

  return (
    <div className="mx-auto max-w-4xl px-6 pb-40">
      {/* Header */}
      <header className="pt-40 md:pt-48">
        <p className="font-mono text-xs uppercase tracking-[0.4em] text-sky-300/60">
          Your project
        </p>
        <h1
          className="mt-8 font-bold leading-[1.02] tracking-tight"
          style={{ fontSize: 'clamp(2.25rem, 6vw, 4rem)' }}
        >
          {client.name}
          {client.company && <span className="block text-white/40">{client.company}</span>}
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-white/50">
          Everything for this build lives here — what you&apos;re getting, what we still need
          from you, and how far along it is. This page stays up to date; bookmark it.
        </p>
      </header>

      {paid && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-14 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] px-6 py-5"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-emerald-300">
            Deposit received
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            Thank you — your slot is booked and your receipt is in your inbox. The remaining{' '}
            {formatMoney(balance)} is due before launch, and nothing else is owed until then.
          </p>
        </motion.div>
      )}

      {cancelled && !paid && (
        <div className="mt-14 rounded-2xl border border-white/15 bg-white/[0.03] px-6 py-5">
          <p className="text-sm leading-relaxed text-white/50">
            Payment cancelled — nothing was charged. The button below is still here whenever
            you&apos;re ready, and you can always ask us for a bank transfer instead.
          </p>
        </div>
      )}

      {/* 01 — Scope */}
      <Panel number="01" title="What you're getting" sub="Locked at the moment you signed up. If anything here looks wrong, tell us before we start — it's free to change now and expensive to change in week six.">
        <div className="rounded-3xl border border-white/12 p-7 md:p-9">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <h3 className="text-xl font-semibold">{project?.name}</h3>
              <p className="mt-1.5 font-mono text-xs text-white/40">
                {timeline.name} timeline · {care.name === 'No plan' ? 'no care plan' : `${care.name} care`}
              </p>
            </div>
            <p className="text-3xl font-bold tabular-nums tracking-tight">
              {formatMoney(est.total)}
            </p>
          </div>

          <dl className="space-y-2.5 py-6 text-sm">
            {est.base && <Row label={est.base.label} detail="base build" amount={formatMoney(est.base.amount)} />}
            {est.addOns.map((line) => (
              <Row key={line.id} label={line.label} detail={line.detail} amount={formatDelta(line.amount)} />
            ))}
            {est.clientAdjustment && (
              <Row
                label={est.clientAdjustment.label}
                detail={est.clientAdjustment.detail}
                amount={formatDelta(est.clientAdjustment.amount)}
              />
            )}
            {est.timelineAdjustment && (
              <Row
                label={est.timelineAdjustment.label}
                detail={est.timelineAdjustment.detail}
                amount={formatDelta(est.timelineAdjustment.amount)}
              />
            )}
          </dl>

          {project && (
            <div className="border-t border-white/10 pt-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/35">
                Included in the base
              </p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {project.includes.map((line) => (
                  <li key={line} className="flex gap-2.5 text-sm text-white/50">
                    <span aria-hidden="true" className="text-sky-300/50">·</span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {est.monthly && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
              <p className="text-sm text-white/60">
                <span className="font-medium text-white">{est.monthly.label}</span> —{' '}
                {formatMoney(est.monthly.amount)}/month, starting the month after launch.
                Billed separately from the build, and cancellable any time.
              </p>
            </div>
          )}
        </div>
      </Panel>

      {/* 02 — Deposit */}
      <Panel
        number="02"
        title={paid ? 'Payment' : 'Deposit'}
        sub={
          paid
            ? 'Where the money stands.'
            : `We hold your dates once this clears — and not before, which is the only honest way to run a schedule. The balance is due before launch.`
        }
      >
        <DepositPanel
          token={token}
          total={est.total}
          deposit={deposit}
          balance={balance}
          percent={client.depositPercent}
          paid={paid}
        />
      </Panel>

      {/* 03 — Onboarding */}
      <Panel
        number="03"
        title="What we need from you"
        sub={`${stats.questions} questions across ${stats.sections} sections — about ${stats.minutes} minutes if you do it in one sitting, and you don't have to. ${stats.required} are genuinely required; the rest make the build better. Every question says why we're asking, and if a reason doesn't convince you, skip it and we'll talk it through instead.`}
      >
        <OnboardingForm sections={sections} token={token} clientName={client.name.split(' ')[0]} />
      </Panel>

      {/* 04 — Progress */}
      <Panel number="04" title="Where we're up to" sub="Updated as we go. Whoever's turn it is, it says so.">
        <ol className="relative">
          {PHASES.map((phase, i) => {
            const state = i < current ? 'done' : i === current ? 'active' : 'upcoming';

            return (
              <li key={phase.id} className="relative flex gap-6 pb-10 last:pb-0">
                {/* Connector */}
                {i < PHASES.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-[11px] top-7 h-full w-px ${
                      state === 'done' ? 'bg-sky-400/40' : 'bg-white/10'
                    }`}
                  />
                )}

                <span
                  aria-hidden="true"
                  className={`relative z-10 mt-1 h-[23px] w-[23px] shrink-0 rounded-full border-2 ${
                    state === 'done'
                      ? 'border-sky-400/60 bg-sky-400/30'
                      : state === 'active'
                        ? 'border-sky-300 bg-sky-300/20 shadow-[0_0_0_5px_rgba(56,189,248,0.12)]'
                        : 'border-white/15 bg-transparent'
                  }`}
                />

                <div className={state === 'upcoming' ? 'opacity-40' : ''}>
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h3 className="text-lg font-semibold">{phase.name}</h3>
                    {state === 'active' && (
                      <span className="rounded-full border border-sky-400/40 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-sky-300">
                        Now
                      </span>
                    )}
                    {state === 'done' && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">
                        Done
                      </span>
                    )}
                  </div>

                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/45">
                    {phase.studio}
                  </p>

                  {phase.client && (
                    <p className="mt-3 max-w-xl border-l-2 border-sky-400/30 pl-4 text-sm leading-relaxed text-white/60">
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-300/70">
                        Your turn ·{' '}
                      </span>
                      {phase.client}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Panel>

      <footer className="mt-24 border-t border-white/10 pt-10">
        <p className="text-sm leading-relaxed text-white/35">
          Questions about any of this? Reply to any email from us — it reaches a person, not
          a ticketing system. This link is personal to you; please don&apos;t forward it.
        </p>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Panel({
  number,
  title,
  sub,
  children,
}: {
  number: string;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-24 border-t border-white/10 pt-14">
      <div className="mb-10 flex items-baseline gap-5">
        <span className="font-mono text-xs tabular-nums text-sky-300/60">{number}</span>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45">{sub}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Row({ label, detail, amount }: { label: string; detail?: string; amount: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="min-w-0 text-white/55">
        {label}
        {detail && <span className="ml-2 font-mono text-[10px] text-white/30">{detail}</span>}
      </dt>
      <dd className="shrink-0 font-mono text-sm tabular-nums text-white/75">{amount}</dd>
    </div>
  );
}

function DepositPanel({
  token,
  total,
  deposit,
  balance,
  percent,
  paid,
}: {
  token: string;
  total: number;
  deposit: number;
  balance: number;
  percent: number;
  paid: boolean;
}) {
  const [status, setStatus] = useState<'idle' | 'starting' | 'unavailable'>('idle');
  const [error, setError] = useState('');

  const pay = async () => {
    setStatus('starting');
    setError('');

    try {
      const response = await fetch('/api/portal/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await response.json().catch(() => null);

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      // Card payments simply aren't switched on — say so plainly rather than
      // showing a client a broken button and an error code.
      if (data?.unavailable) {
        setStatus('unavailable');
        return;
      }

      setError(data?.error ?? 'Could not start checkout.');
      setStatus('idle');
    } catch {
      setError('Something went wrong. Try again, or ask us for a bank transfer.');
      setStatus('idle');
    }
  };

  return (
    <div className="rounded-3xl border border-white/12 p-7 md:p-9">
      <div className="grid gap-6 sm:grid-cols-3">
        <Figure label={`Deposit (${percent}%)`} value={formatMoney(deposit)} strong={!paid} done={paid} />
        <Figure label="Balance before launch" value={formatMoney(balance)} />
        <Figure label="Total" value={formatMoney(total)} />
      </div>

      {!paid && (
        <div className="mt-8 border-t border-white/10 pt-8">
          {status === 'unavailable' ? (
            <p className="text-sm leading-relaxed text-white/55">
              Card payment isn&apos;t switched on yet — we&apos;ll send you an invoice with bank
              details instead. Nothing for you to do here; it&apos;ll be in your inbox shortly.
            </p>
          ) : (
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-sm text-xs leading-relaxed text-white/35">
                Paid securely through Stripe. We never see or store your card details. Prefer a
                bank transfer? Just reply to any email and we&apos;ll invoice you instead.
              </p>

              <button
                type="button"
                onClick={pay}
                disabled={status === 'starting'}
                aria-busy={status === 'starting'}
                className="w-full shrink-0 rounded-full bg-white px-9 py-4 text-sm font-medium text-black transition-all duration-300 hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/40 sm:w-auto"
              >
                {status === 'starting' ? 'Opening Stripe…' : `Pay ${formatMoney(deposit)} deposit`}
              </button>
            </div>
          )}

          <div role="status" aria-live="polite" aria-atomic="true">
            {error && <p className="mt-5 text-sm text-red-300">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  strong = false,
  done = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  done?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">{label}</p>
      <p
        className={`mt-2 tabular-nums tracking-tight ${
          strong ? 'text-3xl font-bold' : 'text-2xl font-semibold text-white/70'
        } ${done ? 'text-emerald-300 line-through decoration-emerald-300/40' : ''}`}
      >
        {value}
      </p>
    </div>
  );
}
