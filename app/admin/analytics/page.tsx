'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  DollarSign,
  Percent,
  Repeat,
  Target,
  ThumbsDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { formatCents } from '@/lib/pricing';
import { Card, CardHeader, StatRow, LoadError, PageIn, PageTitle, Kicker } from '@/components/admin/ui';
import { ANALYTICS_RANGES, type AnalyticsRange } from '@/lib/reporting';
import { Legend, RevenueChart } from '@/components/admin/analytics/RevenueChart';

/**
 * The studio's numbers.
 *
 * What was here before was four tiles and two boxes, and not one of them
 * answered a question anybody had. The conversion rate divided wins by every
 * lead ever entered — a figure that falls whenever a list is imported and can
 * never rise. The pipeline summed a field that is usually blank. Care plans,
 * which bill every month and are the only recurring income the studio has,
 * appeared nowhere at all. And everything was all-time, so no number could be
 * compared to the one before it.
 *
 * The arithmetic moved to lib/reporting.ts where it is tested. What this page
 * adds is the part a number alone can't do: saying how much of it is solid.
 * A pipeline total that mixes signed contracts with numbers typed into a box
 * during a first call is not one number, and presenting it as one is how a
 * forecast gets believed.
 */

interface Analytics {
  range: AnalyticsRange;
  revenue: {
    oneOffCents: number;
    recurringCents: number;
    totalCents: number;
    byMonth: Array<{ label: string; oneOff: number; recurring: number }>;
  };
  recurring: { activePlans: number; mrrCents: number; runRateCents: number };
  deals: {
    won: number;
    lost: number;
    open: number;
    conversionRate: number;
    wonValueCents: number;
    avgDealCents: number;
  };
  pipeline: { valueCents: number; estimatedCount: number; unpricedCount: number };
  lostReasons: Array<{ reason: string; count: number }>;
}

const RANGE_KEY = 'bothmade_analytics_range';

function RangePicker({
  range,
  onChange,
}: {
  range: AnalyticsRange;
  onChange: (r: AnalyticsRange) => void;
}) {
  return (
    // The third segmented control in the app, and the last one still drawn
    // the old way — a lighter rectangle on a flat strip. ViewTabs and the
    // dashboard's range picker both became a raised chip in a sunken track,
    // where the shape says which one is in front before the colour has to.
    // Three controls doing one job should not need three explanations.
    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.06] bg-black/20 p-1">
      {ANALYTICS_RANGES.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={range === opt.value}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-[background-color,color] duration-150 ease-ui ${
            range === opt.value
              ? 'bg-white/[0.09] text-white shadow-e1'
              : 'text-white/45 hover:bg-white/[0.04] hover:text-white/80'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-white/60">{label}</span>
      <span className={`font-semibold ${tone ?? ''}`}>{value}</span>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const [range, setRange] = useState<AnalyticsRange>('12mo');
  /** Bumped by the retry button, so a dropped request costs a click. */
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    try {
      const remembered = localStorage.getItem(RANGE_KEY);
      if (ANALYTICS_RANGES.some((r) => r.value === remembered)) {
        setRange(remembered as AnalyticsRange);
      }
    } catch {
      /* private browsing — the default is fine */
    }
  }, []);

  const choose = useCallback((next: AnalyticsRange) => {
    setRange(next);
    try {
      localStorage.setItem(RANGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/analytics?range=${range}`);
        if (response.status === 401) {
          router.push('/admin/login');
          return;
        }
        const json = await response.json();
        if (cancelled) return;
        if (json.success) {
          setData(json.analytics);
          setFailed(false);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [range, router, retry]);

  if (failed) {
    /*
     * "Refresh to retry" is not a retry.
     *
     * LoadError exists for exactly this and is used on five other pages; its
     * own comment makes the case — a page nobody can reload is a page you
     * leave, and the thing that failed is usually one dropped request. This
     * one asked somebody to reload the whole app to re-run a single fetch.
     *
     * The range picker stays on screen too. It used to be replaced along with
     * everything else, so a range whose query fell over left you unable to
     * pick a different one without a reload — the one action most likely to
     * get you a working page.
     */
    return (
      <PageIn className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <PageTitle icon={BarChart3} title="Analytics" tone="purple" />
          <RangePicker range={range} onChange={choose} />
        </div>
        <LoadError
          what="analytics"
          onRetry={() => {
            setFailed(false);
            setRetry((n) => n + 1);
          }}
        />
      </PageIn>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-white/40">Loading analytics…</p>
      </div>
    );
  }

  if (!data) return null;

  const { revenue, recurring, deals, pipeline, lostReasons } = data;
  const decided = deals.won + deals.lost;
  const rangeLabel = ANALYTICS_RANGES.find((r) => r.value === range)?.label ?? '';

  return (
    <PageIn className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Kicker className="mb-2">Studio</Kicker>
          <PageTitle icon={BarChart3} title="Analytics" />
          <p className="mt-1 text-sm text-white/40">
            {revenue.totalCents > 0
              ? `${formatCents(revenue.totalCents)} in over the last ${rangeLabel.toLowerCase()}.`
              : `Nothing has come in over the last ${rangeLabel.toLowerCase()}.`}
          </p>
        </div>
        <RangePicker range={range} onChange={choose} />
      </div>

      <div className="mb-6">
        <StatRow
          items={[
            {
              icon: DollarSign,
              label: `Revenue (${rangeLabel.toLowerCase()})`,
              value: formatCents(revenue.totalCents),
              tone: 'emerald',
              accent: true,
            },
            {
              icon: Repeat,
              label: 'Care plans / month',
              value: formatCents(recurring.mrrCents),
              tone: 'sky',
            },
            {
              icon: Percent,
              label: 'Win rate',
              value: decided > 0 ? `${Math.round(deals.conversionRate * 100)}%` : '—',
              tone: 'purple',
            },
            {
              icon: Target,
              label: 'Avg. deal size',
              value: deals.won > 0 ? formatCents(deals.avgDealCents) : '—',
              tone: 'amber',
            },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card className="p-6 md:col-span-2">
          <CardHeader icon={TrendingUp} tone="emerald" title="Where the money came from" />
          <RevenueChart data={revenue.byMonth} />
          <Legend />
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/[0.07] pt-4">
            <div>
              <p className="text-xs text-white/40">Project work</p>
              <p className="text-lg font-bold text-sky-300">{formatCents(revenue.oneOffCents)}</p>
            </div>
            <div>
              <p className="text-xs text-white/40">Care plans</p>
              <p className="text-lg font-bold text-emerald-300">{formatCents(revenue.recurringCents)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <CardHeader icon={Users} tone="sky" title="Deals closed" />
          <div className="space-y-4">
            <Row label="Won" value={String(deals.won)} tone="text-emerald-300" />
            <Row label="Lost" value={String(deals.lost)} tone="text-red-300" />
            <div className="border-t border-white/[0.07] pt-4">
              <Row
                label="Won as a share of decided"
                value={decided > 0 ? `${Math.round(deals.conversionRate * 100)}%` : '—'}
              />
              <p className="mt-1.5 text-xs text-white/30">
                {decided > 0
                  ? `${deals.won} of ${decided} deals that reached a yes or a no. Still open: ${deals.open}.`
                  : `Nothing has closed in this period. ${deals.open} still open.`}
              </p>
            </div>
            {deals.won > 0 && (
              <div className="border-t border-white/[0.07] pt-4">
                <Row label="Sold" value={formatCents(deals.wonValueCents)} tone="text-emerald-300" />
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <CardHeader icon={Repeat} tone="emerald" title="Care plans" />
          <div className="space-y-4">
            <Row label="Active plans" value={String(recurring.activePlans)} />
            <Row label="Billing this month" value={formatCents(recurring.mrrCents)} tone="text-emerald-300" />
            <div className="border-t border-white/[0.07] pt-4">
              <Row label="Once intro rates end" value={formatCents(recurring.runRateCents)} />
              {/* A plan on two free months bills nothing today and the full
                  rate for years after. Reporting either figure on its own
                  describes a different business than the one you have. */}
              <p className="mt-1.5 text-xs text-white/30">
                What the same plans bill at the standard rate, after free and introductory
                months run out.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <CardHeader icon={Target} tone="sky" title="Open pipeline" />
          <p className="text-3xl font-bold tracking-tight">{formatCents(pipeline.valueCents)}</p>
          <p className="mt-1 text-sm text-white/40">across {deals.open} open deals</p>
          {/* The honesty line. Without it this total reads as a forecast. */}
          {(pipeline.estimatedCount > 0 || pipeline.unpricedCount > 0) && (
            <p className="mt-4 border-t border-white/[0.07] pt-4 text-xs text-white/35">
              {pipeline.estimatedCount > 0 &&
                (pipeline.estimatedCount === 1
                  ? 'One of these is an early estimate rather than a quoted price. '
                  : `${pipeline.estimatedCount} of these are early estimates rather than quoted prices. `)}
              {pipeline.unpricedCount > 0 &&
                (pipeline.unpricedCount === 1
                  ? 'One carries no figure at all, so it adds nothing to this total.'
                  : `${pipeline.unpricedCount} carry no figure at all, so they add nothing to this total.`)}
            </p>
          )}
        </Card>

        <Card className="p-6">
          <CardHeader icon={ThumbsDown} tone="red" title="Why deals were lost" />
          {lostReasons.length === 0 ? (
            <p className="py-6 text-sm text-white/35">Nothing lost in this period.</p>
          ) : (
            <div className="space-y-3">
              {lostReasons.slice(0, 6).map((entry) => (
                <div key={entry.reason} className="flex items-center justify-between gap-4">
                  <span className="min-w-0 truncate text-sm text-white/60" title={entry.reason}>
                    {entry.reason}
                  </span>
                  <span className="shrink-0 font-semibold text-white/80">{entry.count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageIn>
  );
}
