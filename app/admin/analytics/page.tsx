'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, TrendingUp, Percent, Target, BarChart3, Users } from 'lucide-react';
import { ADD_ONS, BASE_SERVICES, formatCents, isAddOnKey, isBaseService } from '@/lib/pricing';
import { Clock, CheckCircle2, Layers } from 'lucide-react';
import { Card, CardHeader, StatRow, PageIn, PageTitle, MiniBarChart } from '@/components/admin/ui';

interface Analytics {
  revenueByMonth: Record<string, number>;
  totalRevenue: number;
  totalLeads: number;
  wonLeads: number;
  lostLeads: number;
  openLeads: number;
  conversionRate: number;
  winRate: number;
  pipelineValue: number;
  avgDealSize: number;
  revenueByService: Record<string, number>;
  addOnCounts: Record<string, number>;
  avgSalesCycleDays: number | null;
  onTimeRate: number | null;
  onTimeCounts: { onTime: number; late: number };
  avgClientLtv: number | null;
  payingClients: number;
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/admin/analytics');
        if (response.status === 401) {
          router.push('/admin/login');
          return;
        }
        const json = await response.json();
        if (json.success) setData(json.analytics);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
      </div>
    );
  }

  const months = Object.entries(data.revenueByMonth);
  const chartData = months.map(([key, value]) => {
    const [, month] = key.split('-');
    return { label: MONTH_LABELS[Number(month) - 1], value };
  });

  return (
    <PageIn className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-8">
        <PageTitle icon={BarChart3} title="Analytics" />
      </div>

      <div className="mb-6">
        <StatRow
          items={[
            { icon: DollarSign, label: 'Revenue (6mo)', value: formatCents(data.totalRevenue), tone: 'emerald', accent: true },
            { icon: TrendingUp, label: 'Pipeline Value', value: formatCents(data.pipelineValue), tone: 'sky' },
            { icon: Percent, label: 'Lead → Customer', value: `${Math.round(data.conversionRate * 100)}%`, tone: 'purple' },
            { icon: Target, label: 'Avg. Deal Size', value: formatCents(data.avgDealSize), tone: 'amber' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card className="p-6">
          <CardHeader icon={TrendingUp} tone="emerald" title="Revenue by Month" />
          <MiniBarChart data={chartData} formatValue={(v) => (v > 0 ? formatCents(v) : '')} />
        </Card>

        <Card className="p-6">
          <CardHeader icon={Users} tone="sky" title="Lead Pipeline" />
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/60">Open</span>
              <span className="font-semibold">{data.openLeads}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/60">Won</span>
              <span className="font-semibold text-emerald-300">{data.wonLeads}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/60">Lost</span>
              <span className="font-semibold text-red-300">{data.lostLeads}</span>
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-white/[0.07]">
              <span className="text-sm text-white/60">Total Leads</span>
              <span className="font-semibold">{data.totalLeads}</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
        <Card className="p-6">
          <CardHeader
            icon={Layers}
            tone="purple"
            title="Revenue by Service"
            subtitle="Money received, not list prices — discounts count at what they paid"
          />
          {Object.keys(data.revenueByService).length === 0 ? (
            <p className="text-sm text-white/30">No payments yet.</p>
          ) : (
            <div className="space-y-2.5">
              {Object.entries(data.revenueByService)
                .sort(([, a], [, b]) => b - a)
                .map(([svc, amount]) => {
                  const max = Math.max(...Object.values(data.revenueByService), 1);
                  return (
                    <div key={svc}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-white/70">
                          {isBaseService(svc) ? BASE_SERVICES[svc].label : svc}
                        </span>
                        <span className="font-semibold">{formatCents(amount)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-purple-400 to-sky-400"
                          style={{ width: `${(amount / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <CardHeader
            icon={Layers}
            tone="sky"
            title="Add-on Attach"
            subtitle="Which add-ons actually sell, by project count"
          />
          {Object.keys(data.addOnCounts).length === 0 ? (
            <p className="text-sm text-white/30">No add-ons sold yet.</p>
          ) : (
            <div className="space-y-1.5">
              {Object.entries(data.addOnCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([key, count]) => (
                  <div key={key} className="flex justify-between text-sm py-1">
                    <span className="text-white/70">
                      {isAddOnKey(key) ? ADD_ONS[key].label : key}
                    </span>
                    <span className="font-semibold">
                      {count} project{count === 1 ? '' : 's'}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <CardHeader
            icon={Clock}
            tone="amber"
            title="Sales Cycle"
            subtitle="First contact to close, from real close dates"
          />
          {data.avgSalesCycleDays === null ? (
            <p className="text-sm text-white/30">No closed deals with a close date yet.</p>
          ) : (
            <p className="text-3xl font-bold">
              {data.avgSalesCycleDays} <span className="text-base font-normal text-white/40">days average</span>
            </p>
          )}
          <div className="mt-4 pt-4 border-t border-white/[0.07] flex justify-between text-sm">
            <span className="text-white/60">Avg. client lifetime value</span>
            <span className="font-semibold">
              {data.avgClientLtv === null
                ? '—'
                : `${formatCents(data.avgClientLtv)} across ${data.payingClients}`}
            </span>
          </div>
        </Card>

        <Card className="p-6">
          <CardHeader
            icon={CheckCircle2}
            tone="emerald"
            title="On-time Delivery"
            subtitle="From milestone completions — stamped when done, so it can't be rewritten"
          />
          {data.onTimeRate === null ? (
            <p className="text-sm text-white/30">
              No completed milestones yet — add dated milestones to projects and this
              fills in as they're hit.
            </p>
          ) : (
            <>
              <p className="text-3xl font-bold">
                {Math.round(data.onTimeRate * 100)}
                <span className="text-base font-normal text-white/40">% on time</span>
              </p>
              <p className="mt-2 text-sm text-white/45">
                {data.onTimeCounts.onTime} on time · {data.onTimeCounts.late} late
              </p>
            </>
          )}
        </Card>
      </div>
    </PageIn>
  );
}
