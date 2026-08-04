'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Repeat } from 'lucide-react';
import { formatCents, type AddOnKey } from '@/lib/pricing';
import {
  DISCOUNT_MONTHS,
  MAX_RECURRING_DISCOUNT_PERCENT,
  buildSchedule,
  monthlyRateCents,
  planLabel,
  scheduleLines,
  validateDiscount,
  type DiscountCheck,
  type DiscountType,
} from '@/lib/recurring';

interface CatalogueItem {
  key: AddOnKey;
  label: string;
  description: string;
  benefit: string;
  price: number;
}

interface Offer {
  id: string;
  addOns: AddOnKey[];
  planLabel: string;
  monthlyCents: number;
  discountedCents: number;
  discountType: string;
  discountValue: number;
  freeMonths: number;
  discountMonths: number;
  firstYearSavings: number;
  standardRateFromMonth: number;
  scheduleLines: Array<{ period: string; detail: string }>;
  status: string;
  note: string | null;
  offerUrl: string;
  sentAt: string;
  acceptedAt: string | null;
  canceledAt: string | null;
  paidToDate: number;
  paymentCount: number;
  lastPaidAt: string | null;
}

interface PanelData {
  alreadyInScope: AddOnKey[];
  catalogue: CatalogueItem[];
  defaults: { addOns: AddOnKey[]; discountMonths: number; freeMonths: number; maxPercent: number };
  offers: Offer[];
}

const STATUS_STYLES: Record<string, string> = {
  sent: 'border-sky-400/40 bg-sky-400/10 text-sky-200',
  active: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  declined: 'border-white/15 bg-white/5 text-white/50',
  canceled: 'border-white/15 bg-white/5 text-white/50',
};

const STATUS_LABELS: Record<string, string> = {
  sent: 'Offer out',
  active: 'Active',
  declined: 'Withdrawn',
  canceled: 'Canceled',
};

/**
 * Selling the monthly plan — the thing worth raising once the build is nearly
 * done, whether or not they took it at the start.
 *
 * Rendered as a band across the top of the project page rather than a card in
 * a column, and it says its own state in the header whether or not anyone
 * opens it: what's in scope, what it's worth, where the offer has got to. The
 * point is that someone scanning the page for something else still registers
 * that this exists and hasn't been done — the upsell has a window that closes
 * when the project ends, so a panel that only speaks when clicked is a panel
 * that gets missed until it's too late to matter.
 *
 * The body is collapsed by default: it's a composer, not a status readout, and
 * it shouldn't push the whole project under a fold on every visit.
 *
 * The discount is a decision made here, per client, and the schedule is
 * visible before anything sends. A rate that's introductory only if somebody
 * remembers to change it later isn't a discount, it's a mistake with a delay
 * on it — so the preview always shows all three phases, including the month
 * the standard rate resumes.
 *
 * Every action here is open to any staff account, including stopping a plan
 * that's already billing — the ops-only tier that used to guard project money
 * came down at the owner's request. See lib/authz.ts.
 */
export function RecurringCarePanel({ projectId }: { projectId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<AddOnKey[]>([]);
  const [discountType, setDiscountType] = useState<DiscountType>('percent');
  // Kept as a string so the field can be emptied while typing rather than
  // snapping back to 0 on every keystroke.
  const [discountInput, setDiscountInput] = useState('15');
  const [freeMonths, setFreeMonths] = useState(0);
  const [note, setNote] = useState('');

  const load = async () => {
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/recurring`);
      const payload = await res.json();
      if (payload.success) {
        setData(payload);
        setSelected(payload.defaults.addOns);
        setFreeMonths(payload.defaults.freeMonths);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const monthlyCents = useMemo(
    () =>
      (data?.catalogue ?? [])
        .filter((item) => selected.includes(item.key))
        .reduce((sum, item) => sum + item.price, 0),
    [data, selected]
  );

  // Percentage points, or whole dollars converted to cents — the field says
  // "$ off / month", so what's typed is dollars, not cents.
  const discountValue = useMemo(() => {
    const raw = Number(discountInput);
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return discountType === 'percent' ? Math.round(raw) : Math.round(raw * 100);
  }, [discountInput, discountType]);

  const preview = useMemo(
    () =>
      buildSchedule({
        addOns: selected,
        monthlyCents,
        discountType,
        discountValue,
        freeMonths,
        discountMonths: DISCOUNT_MONTHS,
      }),
    [selected, monthlyCents, discountType, discountValue, freeMonths]
  );

  const discountCheck: DiscountCheck =
    monthlyCents > 0 ? validateDiscount(monthlyCents, discountType, discountValue) : { ok: true };

  const toggle = (key: AddOnKey) =>
    setSelected((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    );

  const openOffer = data?.offers.find((offer) => offer.status === 'sent' || offer.status === 'active');

  const send = async () => {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/recurring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addOns: selected, discountType, discountValue, freeMonths, note }),
      });
      const payload = await res.json();
      if (payload.success) {
        setNote('');
        setStatus(
          payload.emailed
            ? 'Offer sent — the client has the link.'
            : `Offer created, but the email didn't go out: ${payload.emailError} Copy the link below and send it yourself.`
        );
        await load();
      } else {
        setError(payload.error || 'Could not send the offer.');
      }
    } finally {
      setBusy(false);
    }
  };

  const act = async (offerId: string, action: 'resend' | 'withdraw' | 'cancel') => {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const res = await fetch(`/api/admin/recurring/${offerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await res.json();
      if (payload.success) {
        setStatus(
          action === 'resend'
            ? payload.emailed
              ? 'Sent again.'
              : `The email didn't go out: ${payload.emailError}`
            : action === 'withdraw'
              ? 'Offer withdrawn — the link no longer works.'
              : "Plan canceled. It stays active until the end of the month they've paid for."
        );
        await load();
      } else {
        setError(payload.error || 'That did not work.');
      }
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors';

  if (loading) {
    return (
      <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <p className="text-sm text-white/40">Loading care plan…</p>
      </div>
    );
  }

  if (!data) return null;

  const live = data.offers.find((offer) => offer.status === 'active');
  const pending = data.offers.find((offer) => offer.status === 'sent');

  /** The one line the header has to earn — read by people not looking for it. */
  const headline = live
    ? `${live.planLabel} · ${formatCents(live.discountedCents)}/mo, reverting to ${formatCents(live.monthlyCents)}/mo at month ${live.standardRateFromMonth}`
    : pending
      ? `${pending.planLabel} · offer sent ${new Date(pending.sentAt).toLocaleDateString()}, waiting on them`
      : data.alreadyInScope.length > 0
        ? `${planLabel(data.alreadyInScope)} is in their scope — ${formatCents(monthlyRateCents(data.alreadyInScope))}/mo once the included months run out. Nothing offered yet.`
        : 'No ongoing services in the original scope. Nothing offered yet.';

  const badge = live
    ? { text: 'Billing monthly', className: STATUS_STYLES.active }
    : pending
      ? { text: 'Offer out', className: STATUS_STYLES.sent }
      : { text: 'Not sold', className: 'border-amber-400/40 bg-amber-400/10 text-amber-200' };

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-sky-400/25 bg-gradient-to-r from-sky-400/[0.09] via-purple-500/[0.06] to-transparent">
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full text-left px-5 py-4 hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-400/15 text-sky-300 shrink-0">
            <Repeat size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold uppercase tracking-[0.12em] text-sky-200">
                Monthly Care Plan
              </span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badge.className}`}>
                {badge.text}
              </span>
            </span>
            <span className="block text-sm text-white/55 mt-1">{headline}</span>
          </span>
          <span className="flex items-center gap-2 text-xs font-semibold text-sky-200 shrink-0">
            {expanded ? 'Close' : live || pending ? 'Manage' : 'Set up the offer'}
            <ChevronDown size={15} className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </span>
        </div>
      </button>

      {!expanded ? null : (
      <div className="border-t border-white/10 p-5">
        <p className="text-xs text-white/40 mb-5">
          The ongoing services they can sign onto — hosting, maintenance, a growth plan. Best raised
          towards the end of the build, at an introductory rate that runs for {DISCOUNT_MONTHS} months
          and then reverts on its own.
        </p>

        {/* Existing offers */}
        {data.offers.length > 0 && (
          <div className="space-y-3 mb-6">
            {data.offers.map((offer) => (
              <div key={offer.id} className="rounded-xl border border-white/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-sm">{offer.planLabel}</p>
                    <p className="text-xs text-white/40">
                      {formatCents(offer.discountedCents)}/mo, then {formatCents(offer.monthlyCents)}
                      /mo from month {offer.standardRateFromMonth}
                    </p>
                  </div>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                      STATUS_STYLES[offer.status] || STATUS_STYLES.declined
                    }`}
                  >
                    {STATUS_LABELS[offer.status] || offer.status}
                  </span>
                </div>

                {offer.status === 'active' && (
                  <p className="text-xs text-emerald-200/70 mb-2">
                    {offer.paymentCount === 0
                      ? 'No charges yet — still in the covered months.'
                      : `${offer.paymentCount} payment${offer.paymentCount === 1 ? '' : 's'}, ${formatCents(offer.paidToDate)} collected.`}
                  </p>
                )}

                {offer.status === 'sent' && (
                  <div className="flex gap-2 mb-2">
                    <input
                      readOnly
                      value={offer.offerUrl}
                      className="flex-1 min-w-0 px-2 py-1.5 rounded bg-white/5 border border-white/15 text-xs"
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(offer.offerUrl)}
                      className="px-3 py-1.5 rounded border border-white/20 text-xs hover:bg-white/5 transition-colors whitespace-nowrap"
                    >
                      Copy
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {offer.status === 'sent' && (
                    <>
                      <button
                        onClick={() => act(offer.id, 'resend')}
                        disabled={busy}
                        className="text-xs px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/5 disabled:opacity-50 transition-colors"
                      >
                        Send again
                      </button>
                      <button
                        onClick={() => act(offer.id, 'withdraw')}
                        disabled={busy}
                        className="text-xs px-3 py-1.5 rounded-lg border border-white/20 text-white/60 hover:bg-white/5 disabled:opacity-50 transition-colors"
                      >
                        Withdraw
                      </button>
                    </>
                  )}
                  {offer.status === 'active' && (
                    <button
                      onClick={() => act(offer.id, 'cancel')}
                      disabled={busy}
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-400/40 text-red-300 hover:bg-red-400/10 disabled:opacity-50 transition-colors"
                    >
                      Cancel plan
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {openOffer ? (
          <p className="text-xs text-white/40">
            {openOffer.status === 'active'
              ? 'A plan is already running for this project. Cancel it before offering a different one — two live subscriptions would bill them twice.'
              : "There's an offer out. Withdraw it before sending another, so they can't accept both."}
          </p>
        ) : (
          <>
            <div className="space-y-2 mb-5">
              {data.catalogue.map((item) => {
                const checked = selected.includes(item.key);
                const inScope = data.alreadyInScope.includes(item.key);
                return (
                  <label
                    key={item.key}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      checked ? 'border-sky-400/40 bg-sky-400/[0.07]' : 'border-white/10 hover:bg-white/5'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(item.key)}
                      className="mt-1"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="flex justify-between gap-2">
                        <span className="text-sm font-medium">{item.label}</span>
                        <span className="text-sm text-white/50 whitespace-nowrap">
                          {formatCents(item.price)}/mo
                        </span>
                      </span>
                      <span className="block text-xs text-white/40 mt-0.5">{item.description}</span>
                      {inScope && (
                        <span className="block text-xs text-emerald-300/70 mt-1">
                          Already in their scope — the included months are what runs out.
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-xs text-white/40 mb-1">Discount</label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                  className={`${inputClass} text-sm`}
                >
                  <option value="percent" className="bg-[#05030a]">
                    % off
                  </option>
                  <option value="amount" className="bg-[#05030a]">
                    $ off / month
                  </option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">
                  {discountType === 'percent' ? `Percent (max ${MAX_RECURRING_DISCOUNT_PERCENT})` : 'Dollars off'}
                </label>
                <input
                  type="number"
                  min={0}
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  className={`${inputClass} text-sm`}
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Free months</label>
                <input
                  type="number"
                  min={0}
                  max={3}
                  value={freeMonths}
                  onChange={(e) => setFreeMonths(Math.min(3, Math.max(0, Number(e.target.value) || 0)))}
                  className={`${inputClass} text-sm`}
                />
              </div>
            </div>

            <p className="text-xs text-white/35 mb-4">
              Free months default to {data.defaults.freeMonths} for this project —{' '}
              {data.alreadyInScope.length > 0
                ? 'the first is included in what they already paid, and the second is the sweetener for signing on for the year.'
                : 'nothing here was in the original scope, so nothing is prepaid.'}
            </p>

            {/* The preview, which is the point: three phases, always visible. */}
            {selected.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">
                  {planLabel(selected)} — what they&apos;ll see
                </p>
                <dl className="space-y-2">
                  {scheduleLines(preview).map((line) => (
                    <div key={line.period} className="flex gap-3 text-xs">
                      <dt className="w-32 shrink-0 font-semibold">{line.period}</dt>
                      <dd className="text-white/60">{line.detail}</dd>
                    </div>
                  ))}
                </dl>
                {preview.firstYearSavings > 0 && (
                  <p className="mt-3 pt-3 border-t border-white/10 text-xs text-sky-300 font-semibold">
                    {formatCents(preview.firstYearSavings)} off across the first year.
                  </p>
                )}
              </div>
            )}

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="A line in your own words for the email — e.g. 'You've seen how fast it's been running. This is what keeps it that way once we hand it over.'"
              className={`${inputClass} resize-none text-sm mb-3`}
            />

            {!discountCheck.ok && <p className="text-xs text-amber-300 mb-3">{discountCheck.error}</p>}
            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
            {status && <p className="text-xs text-emerald-300 mb-3">{status}</p>}

            <button
              onClick={send}
              disabled={busy || selected.length === 0 || !discountCheck.ok}
              className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {busy ? 'Sending…' : 'Send the offer'}
            </button>
          </>
        )}
      </div>
      )}
    </section>
  );
}
