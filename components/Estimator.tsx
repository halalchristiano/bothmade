'use client';

import { useMemo, useReducer, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  CARE_PLANS,
  CLIENT_TYPES,
  EMPTY_SELECTION,
  PROJECTS,
  TIMELINES,
  estimate,
  formatDelta,
  formatMoney,
  percentLabel,
  pruneAddOns,
  visibleGroups,
  type AddOn,
  type CarePlanId,
  type ClientTypeId,
  type ProjectId,
  type Selection,
  type TimelineId,
} from '@/lib/pricing';

/**
 * The onboarding brief. It asks what an intro call would ask, and prices the
 * answers as they arrive.
 *
 * The rule the whole component is built around: every control that changes the
 * total says what it changes it by, before it is touched. No box costs a
 * surprise. That is also why the client-type and timeline cards show live
 * dollar figures rather than bare percentages — a percentage is a promise you
 * have to do arithmetic to check, and nobody checks it.
 */

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

type Action =
  | { type: 'project'; id: ProjectId }
  | { type: 'client'; id: ClientTypeId }
  | { type: 'toggle'; id: string }
  | { type: 'quantity'; id: string; qty: number }
  | { type: 'timeline'; id: TimelineId }
  | { type: 'care'; id: CarePlanId };

function reducer(state: Selection, action: Action): Selection {
  switch (action.type) {
    // Changing what we're building, or who for, can strand add-ons that no
    // longer exist on the new path — prune rather than silently charging for
    // a checkout on an app that has no store.
    case 'project': {
      const project = action.id;
      return { ...state, project, addOns: pruneAddOns(state.addOns, project, state.client) };
    }
    case 'client': {
      const client = action.id;
      return { ...state, client, addOns: pruneAddOns(state.addOns, state.project, client) };
    }
    case 'toggle': {
      const addOns = { ...state.addOns };
      if (addOns[action.id]) delete addOns[action.id];
      else addOns[action.id] = 1;
      return { ...state, addOns };
    }
    case 'quantity': {
      const addOns = { ...state.addOns };
      if (action.qty <= 0) delete addOns[action.id];
      else addOns[action.id] = action.qty;
      return { ...state, addOns };
    }
    case 'timeline':
      return { ...state, timeline: action.id };
    case 'care':
      return { ...state, care: action.id };
  }
}

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

function Step({
  number,
  title,
  sub,
  children,
}: {
  number: string;
  title: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-white/10 py-16 md:py-20">
      <div className="mb-10 flex items-baseline gap-5">
        <span className="font-mono text-xs tabular-nums text-sky-300/60">{number}</span>
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 max-w-xl text-sm text-white/45 leading-relaxed">{sub}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** The price chip that sits on every card. One visual grammar, everywhere. */
function PriceChip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'add' | 'save';
}) {
  const styles = {
    neutral: 'border-white/15 text-white/70',
    add: 'border-sky-400/30 text-sky-200',
    save: 'border-emerald-400/30 text-emerald-300',
  }[tone];

  return (
    <span
      className={`shrink-0 rounded-full border ${styles} px-3 py-1 font-mono text-xs tabular-nums whitespace-nowrap`}
    >
      {children}
    </span>
  );
}

/**
 * A radio rendered as a card. The input is real and merely invisible, so
 * keyboard navigation, screen-reader semantics, and arrow-key group behaviour
 * all come for free instead of being reimplemented badly.
 */
function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  title,
  blurb,
  chip,
  badge,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  blurb: string;
  chip: ReactNode;
  badge?: string;
  children?: ReactNode;
}) {
  return (
    <label
      className={`group relative block cursor-pointer rounded-2xl border p-6 transition-all duration-300 ${
        checked
          ? 'border-sky-400/60 bg-sky-400/[0.06] shadow-[0_0_0_1px_rgba(56,189,248,0.25)]'
          : 'border-white/12 hover:border-white/30 hover:bg-white/[0.02]'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-lg leading-tight">{title}</h3>
          <p className="mt-2 text-sm text-white/45 leading-relaxed">{blurb}</p>
        </div>
        {chip}
      </div>

      {badge && (
        <p className="mt-4 inline-block rounded-full border border-emerald-400/25 bg-emerald-400/[0.06] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300">
          {badge}
        </p>
      )}

      {children}

      {/* The selected state needs a non-colour signal too. */}
      <span
        aria-hidden="true"
        className={`absolute right-5 bottom-5 text-sky-300 transition-opacity duration-300 ${
          checked ? 'opacity-100' : 'opacity-0'
        }`}
      >
        ✓
      </span>
    </label>
  );
}

/** A checkbox add-on, or — when the add-on has a unit — a stepper. */
function AddOnCard({
  item,
  qty,
  onToggle,
  onQuantity,
}: {
  item: AddOn;
  qty: number;
  onToggle: () => void;
  onQuantity: (qty: number) => void;
}) {
  const selected = qty > 0;
  const lineTotal = item.price * Math.max(qty, 1);

  if (item.unit) {
    const max = item.unit.max;

    return (
      <div
        className={`rounded-2xl border p-6 transition-all duration-300 ${
          selected ? 'border-sky-400/60 bg-sky-400/[0.06]' : 'border-white/12'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-medium leading-tight">{item.name}</h3>
            <p className="mt-2 text-sm text-white/45 leading-relaxed">{item.desc}</p>
          </div>
          <PriceChip tone="add">
            {formatDelta(item.price)}/{item.unit.label}
          </PriceChip>
        </div>

        <div className="mt-5 flex items-center gap-4">
          <div className="flex items-center gap-1 rounded-full border border-white/15 p-1">
            <StepperButton
              label={`Remove one ${item.unit.label}`}
              disabled={qty <= 0}
              onClick={() => onQuantity(qty - 1)}
            >
              −
            </StepperButton>
            <span
              aria-live="polite"
              className="w-10 text-center font-mono text-sm tabular-nums"
            >
              {qty}
            </span>
            <StepperButton
              label={`Add one ${item.unit.label}`}
              disabled={qty >= max}
              onClick={() => onQuantity(qty + 1)}
            >
              +
            </StepperButton>
          </div>

          <span className="font-mono text-xs tabular-nums text-white/45">
            {selected ? `${qty} × ${formatMoney(item.price)} = ${formatDelta(lineTotal)}` : `Up to ${max}`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <label
      className={`group relative block cursor-pointer rounded-2xl border p-6 transition-all duration-300 ${
        selected
          ? 'border-sky-400/60 bg-sky-400/[0.06]'
          : 'border-white/12 hover:border-white/30 hover:bg-white/[0.02]'
      }`}
    >
      <input type="checkbox" checked={selected} onChange={onToggle} className="sr-only" />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-medium leading-tight">
            {item.name}
            <span
              aria-hidden="true"
              className={`ml-2 text-sky-300 transition-opacity duration-300 ${
                selected ? 'opacity-100' : 'opacity-0'
              }`}
            >
              ✓
            </span>
          </h3>
          <p className="mt-2 text-sm text-white/45 leading-relaxed">{item.desc}</p>
        </div>
        <PriceChip tone="add">{formatDelta(item.price)}</PriceChip>
      </div>
    </label>
  );
}

function StepperButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-8 w-8 rounded-full text-lg leading-none text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * The form
 * ------------------------------------------------------------------ */

export function Estimator() {
  const [selection, dispatch] = useReducer(reducer, EMPTY_SELECTION);
  const reduceMotion = useReducedMotion();

  const [contact, setContact] = useState({
    name: '',
    email: '',
    company: '',
    notes: '',
    website: '', // honeypot — hidden from humans, irresistible to bots
  });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const est = useMemo(() => estimate(selection), [selection]);
  const groups = useMemo(
    () => visibleGroups(selection.project, selection.client),
    [selection.project, selection.client]
  );

  /**
   * What the client-type and timeline cards would cost if picked — computed by
   * running the real estimator against a hypothetical selection rather than
   * duplicating the maths. Slower than a formula, correct by construction, and
   * far too cheap to matter at this size.
   */
  const previewFor = (patch: Partial<Selection>) => estimate({ ...selection, ...patch });

  const chosenCount = Object.keys(selection.addOns).length;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('sending');
    setError('');

    try {
      const response = await fetch('/api/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only the selection travels. The server recomputes the price from its
        // own catalogue, so there is nothing here worth tampering with.
        body: JSON.stringify({ ...contact, ...selection }),
      });

      if (response.ok) {
        setStatus('sent');
        setContact({ name: '', email: '', company: '', notes: '', website: '' });
      } else {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? 'Failed to send. Please try again.');
        setStatus('idle');
      }
    } catch {
      setError('An error occurred. Please try again.');
      setStatus('idle');
    }
  };

  const field =
    'w-full bg-transparent border-0 border-b border-white/20 rounded-none px-0 py-4 text-lg text-white placeholder-white/25 focus:outline-none focus:border-sky-400/70 transition-colors duration-200';

  if (status === 'sent') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-32 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.4em] text-sky-300/70">Brief received</p>
        <h2
          className="mt-8 font-bold leading-[1.05] tracking-tight"
          style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)' }}
        >
          {formatMoney(est.total)}
          {est.monthly && (
            <span className="block mt-3 text-xl font-normal text-white/50">
              then {formatMoney(est.monthly.amount)}/month
            </span>
          )}
        </h2>
        <p className="mx-auto mt-8 max-w-md text-white/50 leading-relaxed">
          A copy of this breakdown is on its way to your inbox. We read every brief
          ourselves and reply within 24 hours — including when we think you have
          over-ordered.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-4xl px-6 pb-48">
      {/* Honeypot. Hidden from sighted users and screen readers alike, and
          skipped by tab order — only a bot filling every field will trip it. */}
      <div aria-hidden="true" className="absolute w-px h-px -left-[9999px] overflow-hidden">
        <label htmlFor="est-website">Leave this field empty</label>
        <input
          id="est-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={contact.website}
          onChange={(e) => setContact((c) => ({ ...c, website: e.target.value }))}
        />
      </div>

      {/* 01 — what are we building */}
      <Step
        number="01"
        title="What are we building?"
        sub="Pick the base. Each one is a finished, shipped product on its own — not a shell that forces add-ons."
      >
        <fieldset>
          <legend className="sr-only">Choose the base build</legend>
          <div className="grid gap-4 md:grid-cols-2">
            {PROJECTS.map((p) => (
              <ChoiceCard
                key={p.id}
                name="project"
                value={p.id}
                checked={selection.project === p.id}
                onChange={() => dispatch({ type: 'project', id: p.id })}
                title={p.name}
                blurb={p.blurb}
                badge={p.badge}
                chip={<PriceChip>{formatMoney(p.base)}</PriceChip>}
              >
                <ul className="mt-5 space-y-1.5 border-t border-white/10 pt-4">
                  {p.includes.map((line) => (
                    <li key={line} className="flex gap-2.5 text-xs text-white/40 leading-relaxed">
                      <span aria-hidden="true" className="text-sky-300/50">
                        ·
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
              </ChoiceCard>
            ))}
          </div>
        </fieldset>
      </Step>

      {/* 02 — who are you */}
      <Step
        number="02"
        title="Who are we building it for?"
        sub="This changes the price, so here is exactly why: a solo founder answers a question in an hour, an enterprise routes it through legal and security for three weeks. That time is real work, and we would rather name it than hide it in the base."
      >
        <fieldset>
          <legend className="sr-only">Choose your client type</legend>
          <div className="grid gap-4 md:grid-cols-2">
            {CLIENT_TYPES.map((c) => {
              // Show the live dollar figure once there's a base to apply it to.
              const preview = previewFor({ client: c.id });
              const amount = preview.clientAdjustment?.amount ?? 0;

              return (
                <ChoiceCard
                  key={c.id}
                  name="client"
                  value={c.id}
                  checked={selection.client === c.id}
                  onChange={() => dispatch({ type: 'client', id: c.id })}
                  title={c.name}
                  blurb={c.blurb}
                  chip={
                    <PriceChip tone={amount > 0 ? 'add' : amount < 0 ? 'save' : 'neutral'}>
                      {selection.project && amount !== 0
                        ? `${percentLabel(c.multiplier)} · ${formatDelta(amount)}`
                        : percentLabel(c.multiplier)}
                    </PriceChip>
                  }
                />
              );
            })}
          </div>
        </fieldset>
      </Step>

      {/* 03 — add-ons */}
      <Step
        number="03"
        title="What does it need to do?"
        sub={
          selection.project
            ? 'Every box says what it adds. Tick nothing and the base still ships — these are the things that genuinely take more weeks, not upsells.'
            : 'Choose a base build above and the relevant options appear here.'
        }
      >
        {!selection.project ? (
          <p className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-sm text-white/35">
            Nothing to show yet.
          </p>
        ) : (
          <div className="space-y-14">
            {groups.map((group) => (
              <div key={group.id}>
                <div className="mb-6">
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.35em] text-sky-300/60">
                    {group.name}
                  </h3>
                  <p className="mt-2 text-sm text-white/35">{group.note}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {group.items.map((item) => (
                    <AddOnCard
                      key={item.id}
                      item={item}
                      qty={selection.addOns[item.id] ?? 0}
                      onToggle={() => dispatch({ type: 'toggle', id: item.id })}
                      onQuantity={(qty) => dispatch({ type: 'quantity', id: item.id, qty })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Step>

      {/* 04 — timeline */}
      <Step
        number="04"
        title="When do you need it?"
        sub="Speed is the one thing we cannot conjure for free — a rush means clearing other work and putting more hands on yours."
      >
        <fieldset>
          <legend className="sr-only">Choose a timeline</legend>
          <div className="grid gap-4 md:grid-cols-3">
            {TIMELINES.map((t) => {
              const preview = previewFor({ timeline: t.id });
              const amount = preview.timelineAdjustment?.amount ?? 0;

              return (
                <ChoiceCard
                  key={t.id}
                  name="timeline"
                  value={t.id}
                  checked={selection.timeline === t.id}
                  onChange={() => dispatch({ type: 'timeline', id: t.id })}
                  title={t.name}
                  blurb={t.blurb}
                  chip={
                    <PriceChip tone={amount > 0 ? 'add' : amount < 0 ? 'save' : 'neutral'}>
                      {selection.project && amount !== 0
                        ? `${percentLabel(t.multiplier)} · ${formatDelta(amount)}`
                        : percentLabel(t.multiplier)}
                    </PriceChip>
                  }
                />
              );
            })}
          </div>
        </fieldset>
      </Step>

      {/* 05 — care */}
      <Step
        number="05"
        title="After it ships?"
        sub="Monthly, and quoted on its own — we never fold a subscription into the build price to make the build look cheaper."
      >
        <fieldset>
          <legend className="sr-only">Choose a care plan</legend>
          <div className="grid gap-4 md:grid-cols-2">
            {CARE_PLANS.map((plan) => (
              <ChoiceCard
                key={plan.id}
                name="care"
                value={plan.id}
                checked={selection.care === plan.id}
                onChange={() => dispatch({ type: 'care', id: plan.id })}
                title={plan.name}
                blurb={plan.blurb}
                chip={
                  <PriceChip tone={plan.monthly > 0 ? 'add' : 'neutral'}>
                    {plan.monthly > 0 ? `${formatMoney(plan.monthly)}/mo` : 'Included'}
                  </PriceChip>
                }
              />
            ))}
          </div>
        </fieldset>
      </Step>

      {/* 06 — details */}
      <Step
        number="06"
        title="Where do we send it?"
        sub="You get the same breakdown in writing. We reply within 24 hours — and we will tell you if we think you have over-ordered."
      >
          <div className="grid gap-x-10 md:grid-cols-2">
            <input
              type="text"
              name="name"
              aria-label="Your name"
              autoComplete="name"
              placeholder="Name"
              value={contact.name}
              onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
              required
              className={field}
            />
            <input
              type="email"
              name="email"
              aria-label="Your email address"
              autoComplete="email"
              placeholder="Email"
              value={contact.email}
              onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
              required
              className={field}
            />
          </div>

          <input
            type="text"
            name="company"
            aria-label="Company (optional)"
            autoComplete="organization"
            placeholder="Company (optional)"
            value={contact.company}
            onChange={(e) => setContact((c) => ({ ...c, company: e.target.value }))}
            className={`${field} mt-2`}
          />

          <textarea
            name="notes"
            aria-label="Anything the boxes did not cover"
            placeholder="Anything the boxes didn't cover — the deadline behind the deadline, the thing you're worried about, the competitor you keep looking at."
            value={contact.notes}
            onChange={(e) => setContact((c) => ({ ...c, notes: e.target.value }))}
            rows={4}
            className={`${field} mt-2 resize-none`}
          />

          {/* Always mounted so assistive tech is already watching it when the
              result arrives — a live region added at the same time as its
              content is announced unreliably. */}
          <div role="status" aria-live="polite" aria-atomic="true">
            {error && (
              <p className="pt-6 font-mono text-xs uppercase tracking-[0.3em] text-red-400">
                {error}
              </p>
            )}
          </div>

          <p className="mt-10 text-xs leading-relaxed text-white/30">
            This is an estimate, not an invoice or a binding quote. It is built from
            published rates so you know the shape of the number before you talk to
            anyone. Final scope — and the final figure — get confirmed on a call, and
            it can move in either direction.
          </p>
      </Step>

      {/* Running total. Fixed, because the entire promise of this page is that
          the number is never out of sight while you are changing it. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/95 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl px-6">
          <AnimatePresence initial={false}>
            {breakdownOpen && est.base && (
              <motion.div
                initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.76, 0, 0.24, 1] }}
                className="overflow-hidden"
              >
                <dl className="max-h-[45vh] space-y-2 overflow-y-auto py-5 text-sm">
                  <BreakdownRow label={est.base.label} detail={est.base.detail} amount={est.base.amount} />

                  {est.addOns.map((line) => (
                    <BreakdownRow
                      key={line.id}
                      label={line.label}
                      detail={line.detail}
                      amount={line.amount}
                      delta
                    />
                  ))}

                  {(est.clientAdjustment || est.timelineAdjustment) && (
                    <div className="!mt-4 border-t border-white/10 pt-4 space-y-2">
                      {est.clientAdjustment && (
                        <BreakdownRow
                          label={est.clientAdjustment.label}
                          detail={est.clientAdjustment.detail}
                          amount={est.clientAdjustment.amount}
                          delta
                        />
                      )}
                      {est.timelineAdjustment && (
                        <BreakdownRow
                          label={est.timelineAdjustment.label}
                          detail={est.timelineAdjustment.detail}
                          amount={est.timelineAdjustment.amount}
                          delta
                        />
                      )}
                    </div>
                  )}

                  {est.monthly && (
                    <div className="!mt-4 border-t border-white/10 pt-4">
                      <BreakdownRow
                        label={est.monthly.label}
                        detail="billed monthly, separate from the build"
                        amount={est.monthly.amount}
                        suffix="/mo"
                      />
                    </div>
                  )}
                </dl>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Stacked on a phone — a total and a button fighting for one row is
              how you get a cramped bar and a mis-tapped submit. */}
          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setBreakdownOpen((v) => !v)}
                disabled={!est.base}
                aria-expanded={breakdownOpen}
                className="flex items-baseline gap-3 text-left disabled:cursor-default"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
                  Estimate
                </span>
                {est.base && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-300/70 underline underline-offset-4">
                    {breakdownOpen ? 'Hide breakdown' : `Show breakdown (${chosenCount + 1})`}
                  </span>
                )}
              </button>

              <p className="mt-1 flex items-baseline gap-3">
                <span className="text-3xl font-bold tabular-nums tracking-tight">
                  {est.base ? formatMoney(est.total) : '—'}
                </span>
                {est.monthly && (
                  <span className="font-mono text-xs text-white/50 tabular-nums">
                    + {formatMoney(est.monthly.amount)}/mo
                  </span>
                )}
              </p>

              {/* Narrow screens have no room beside the button, so the reason
                  the submit is disabled goes under the total instead. */}
              {!est.ready && (
                <p className="mt-1 text-xs leading-snug text-white/35 md:hidden">
                  {!selection.project ? 'Pick what we are building' : 'Tell us who you are'} to see
                  a real number.
                </p>
              )}
            </div>

            <div className="flex w-full items-center gap-4 sm:w-auto">
              {!est.ready && (
                <p className="hidden md:block max-w-[14rem] text-right text-xs leading-snug text-white/35">
                  {!selection.project ? 'Pick what we are building' : 'Tell us who you are'} to see
                  a real number.
                </p>
              )}

              <button
                type="submit"
                disabled={!est.ready || status === 'sending'}
                aria-busy={status === 'sending'}
                className="w-full rounded-full bg-white px-8 py-3.5 text-sm font-medium text-black transition-all duration-300 hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/40 sm:w-auto"
              >
                {status === 'sending' ? 'Sending…' : 'Send this brief'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

function BreakdownRow({
  label,
  detail,
  amount,
  delta = false,
  suffix = '',
}: {
  label: string;
  detail?: string;
  amount: number;
  delta?: boolean;
  suffix?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="min-w-0 text-white/60">
        <span className="truncate">{label}</span>
        {detail && <span className="ml-2 font-mono text-[10px] text-white/30">{detail}</span>}
      </dt>
      <dd
        className={`shrink-0 font-mono text-sm tabular-nums ${
          amount < 0 ? 'text-emerald-300' : 'text-white/80'
        }`}
      >
        {delta ? formatDelta(amount) : formatMoney(amount)}
        {suffix}
      </dd>
    </div>
  );
}
