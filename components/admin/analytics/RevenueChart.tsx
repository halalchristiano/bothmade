'use client';

import { useState } from 'react';
import { formatCents } from '@/lib/pricing';

/** A month on the revenue chart: what came from project work, what recurred. */
export interface RevenueMonth {
  label: string;
  oneOff: number;
  recurring: number;
}

/**
 * One-off work and care plans in the same bar, stacked.
 *
 * Two charts side by side would have been easier and would have hidden the
 * only thing worth looking at here — whether the recurring slice is growing
 * as a share of the month, which is the difference between a studio that has
 * to sell every month and one that doesn't.
 */
export function RevenueChart({ data }: { data: RevenueMonth[] }) {
  /**
   * Which month is being read, and why a tap has to do it.
   *
   * The split between project work and care plans lived in a `title`
   * attribute — a tooltip that needs a mouse pointer to hover. On a phone
   * there is no hover, so on the device this admin is most often opened on,
   * the one thing this chart exists to show could not be got at at all: you
   * saw a two-tone bar and a total, and no way to learn which part was which.
   *
   * Tapping a bar names it underneath instead. That fixes the phone, gives
   * the keyboard a way in, and gives a screen reader something to read — a
   * `title` on a div is announced by almost nothing.
   */
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.oneOff + d.recurring), 1);
  /**
   * A floor on every non-empty segment. One good month next to a quiet one
   * puts the quiet one at half a pixel, so a month that earned something and
   * a month that earned nothing look identical — which is the one distinction
   * the chart exists to draw.
   */
  const bar = (cents: number) => (cents > 0 ? `${Math.max((cents / max) * 100, 2)}%` : '0');

  const describe = (month: RevenueMonth) =>
    `${month.label}: ${formatCents(month.oneOff)} project work, ${formatCents(month.recurring)} care plans`;

  const open = openIndex === null ? null : data[openIndex] ?? null;

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-[20rem] items-end gap-1.5">
          {data.map((month, i) => {
            const total = month.oneOff + month.recurring;
            const selected = openIndex === i;
            return (
              <button
                type="button"
                key={`${month.label}-${i}`}
                onClick={() => setOpenIndex(selected ? null : i)}
                aria-pressed={selected}
                aria-label={describe(month)}
                className="group flex flex-1 flex-col items-center gap-1.5"
              >
                <span
                  className={`-mb-1 text-[10px] font-medium transition-colors ${
                    selected ? 'text-white' : 'text-white/25 group-hover:text-white/60'
                  }`}
                >
                  {total > 0 ? formatCents(total) : ''}
                </span>
                {/* Fixed height, because the percentages above are of *this*.
                    A flex-grown box inside an items-end row collapses to zero
                    and every bar with it. */}
                <div className="flex h-24 w-full flex-col justify-end">
                  <div
                    className={`w-full rounded-t-sm transition-colors ${
                      selected ? 'bg-emerald-400/90' : 'bg-emerald-400/60 group-hover:bg-emerald-400/80'
                    }`}
                    style={{ height: bar(month.recurring) }}
                  />
                  <div
                    className={`w-full transition-colors ${
                      selected ? 'bg-sky-400/80' : 'bg-sky-400/45 group-hover:bg-sky-400/75'
                    } ${month.recurring > 0 ? '' : 'rounded-t-sm'}`}
                    style={{ height: bar(month.oneOff) }}
                  />
                </div>
                <span className={`text-[10px] ${selected ? 'text-white/70' : 'text-white/30'}`}>
                  {month.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reserved rather than conditional, so selecting a month does not shove
          the legend and the cards below it down the page. */}
      <div className="mt-3 min-h-[2.75rem] rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
        {open ? (
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-sm font-semibold text-white">{open.label}</span>
            <span className="text-xs text-white/60">
              <span className="text-sky-300">{formatCents(open.oneOff)}</span> project work
              {' · '}
              <span className="text-emerald-300">{formatCents(open.recurring)}</span> care plans
              {' · '}
              <span className="text-white/80">{formatCents(open.oneOff + open.recurring)}</span> total
            </span>
          </div>
        ) : (
          <p className="text-xs text-white/30">Tap a month to see what made it up.</p>
        )}
      </div>
    </div>
  );
}

export function Legend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-white/40">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-400/50" /> Project work
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400/60" /> Care plans
      </span>
    </div>
  );
}
