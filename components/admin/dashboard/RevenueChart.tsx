'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { Card, CardHeader, ListRow, MiniBarChart } from '@/components/admin/ui';
import { formatCents } from '@/lib/pricing';

export interface RevenueMonth {
  label: string;
  value: number;
  year: number;
  month: number;
}

interface RevenueBreakdownPayment {
  id: string;
  amount: number;
  type: string;
  createdAt: string;
  projectId: string;
  projectName: string;
  company: string;
}

/**
 * Six months of revenue, and what any one of them was made of.
 *
 * Lives here rather than in the dashboard page because the interesting part
 * is a race, and a race needs a test — which needs something you can render
 * on its own.
 *
 * THE RACE. Each bar fires its own request and the panel below is headed with
 * whichever bar is currently selected. Nothing tied a response back to the
 * click that asked for it, so two clicks in quick succession resolved in
 * whatever order the network felt like: click March, click April, and if
 * March came back second you got March's payments listed under "Apr
 * payments". Every figure on screen was real, which is what made it
 * unnoticeable — there is no way to tell from the rows that they belong to a
 * different month, and the total below them will not add up to the bar above.
 *
 * The same gap made the spinner lie (the first response cleared it while the
 * second was still out) and let a dismissed panel come back from the dead: a
 * click that closed the breakdown could not cancel the request already in
 * flight, so the panel reopened when it landed.
 *
 * So every click takes a token and only the newest one may write. Cheaper
 * than AbortController and it covers the toggle-off case too, which an abort
 * on unmount would not.
 */
export function RevenueChartCard({ revenueHistory }: { revenueHistory: RevenueMonth[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [payments, setPayments] = useState<RevenueBreakdownPayment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);

  const handleBarClick = async (index: number) => {
    // Bumped before the early return as well, so closing the panel also
    // invalidates the request that filled it.
    const token = ++latestRequest.current;

    if (selectedIndex === index) {
      setSelectedIndex(null);
      setPayments(null);
      setError(null);
      setLoading(false);
      return;
    }

    setSelectedIndex(index);
    setPayments(null);
    setError(null);
    setLoading(true);

    const bar = revenueHistory[index];
    try {
      const res = await fetch(`/api/admin/revenue-breakdown?year=${bar.year}&month=${bar.month}`);
      const data = await res.json();
      // Somebody has clicked again since. Their request owns the panel now,
      // and this one has nothing to say about the month on screen.
      if (token !== latestRequest.current) return;
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load breakdown.');
      setPayments(data.payments);
    } catch (err) {
      if (token !== latestRequest.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load breakdown.');
    } finally {
      // Only the newest request may stop the spinner — otherwise an early
      // response cleared it while the month you actually asked for was still
      // loading, and the panel sat empty looking finished.
      if (token === latestRequest.current) setLoading(false);
    }
  };

  return (
    <Card className="p-6 mb-5">
      <CardHeader
        icon={TrendingUp}
        tone="emerald"
        title="Revenue — Last 6 Months"
        subtitle="Click a bar to see what made up that month"
      />
      <MiniBarChart
        data={revenueHistory}
        formatValue={(v) => formatCents(v)}
        onBarClick={handleBarClick}
        selectedIndex={selectedIndex}
      />

      {selectedIndex !== null && (
        <div className="mt-5 pt-5 border-t border-white/[0.07]">
          <p className="text-xs text-white/40 mb-3">{revenueHistory[selectedIndex].label} payments</p>
          {loading && <p className="text-sm text-white/30 py-2">Loading...</p>}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-300/80">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          {payments && payments.length === 0 && (
            <p className="text-sm text-white/30 py-2">No payments that month.</p>
          )}
          {payments && payments.length > 0 && (
            <div className="space-y-0.5 max-h-56 overflow-y-auto">
              {payments.map((p) => (
                <ListRow
                  key={p.id}
                  href={`/admin/projects/${p.projectId}`}
                  title={p.company}
                  subtitle={`${p.projectName} · ${p.type}`}
                  trailing={
                    <span className="text-white/40 text-xs whitespace-nowrap">
                      <span className="text-emerald-300/80 font-medium">{formatCents(p.amount)}</span> ·{' '}
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
