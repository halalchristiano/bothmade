'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, TrendingUp, Percent, Target, BarChart3, Users } from 'lucide-react';
import { formatCents } from '@/lib/pricing';
import { Card, CardHeader, StatRow, PageIn, PageTitle, MiniBarChart } from '@/components/admin/ui';

interface Analytics {
  revenueByMonth: Record<string, number>;
  totalRevenue: number;
  totalLeads: number;
  wonLeads: number;
  lostLeads: number;
  openLeads: number;
  conversionRate: number;
  pipelineValue: number;
  avgDealSize: number;
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
            { icon: Percent, label: 'Conversion Rate', value: `${data.conversionRate.toFixed(0)}%`, tone: 'purple' },
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
    </PageIn>
  );
}
