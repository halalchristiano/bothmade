'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCents } from '@/lib/pricing';

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
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
      </div>
    );
  }

  const months = Object.entries(data.revenueByMonth);
  const maxRevenue = Math.max(...months.map(([, v]) => v), 1);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-8">Analytics</h1>

      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
          <p className="text-sm text-white/40 mb-2">Revenue (6mo)</p>
          <p className="text-3xl font-bold">{formatCents(data.totalRevenue)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
          <p className="text-sm text-white/40 mb-2">Pipeline Value</p>
          <p className="text-3xl font-bold">{formatCents(data.pipelineValue)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
          <p className="text-sm text-white/40 mb-2">Conversion Rate</p>
          <p className="text-3xl font-bold">{data.conversionRate.toFixed(0)}%</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
          <p className="text-sm text-white/40 mb-2">Avg. Deal Size</p>
          <p className="text-3xl font-bold">{formatCents(data.avgDealSize)}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
          <h2 className="text-xl font-bold mb-6">Revenue by Month</h2>
          <div className="flex items-end gap-3 h-48">
            {months.map(([key, value]) => {
              const [, month] = key.split('-');
              const monthLabel = MONTH_LABELS[Number(month) - 1];
              const heightPct = (value / maxRevenue) * 100;
              return (
                <div key={key} className="flex-1 flex flex-col items-center justify-end h-full">
                  <p className="text-xs text-white/50 mb-1">{value > 0 ? formatCents(value) : ''}</p>
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-sky-400 to-purple-500"
                    style={{ height: `${Math.max(heightPct, 2)}%` }}
                  />
                  <p className="text-xs text-white/40 mt-2">{monthLabel}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
          <h2 className="text-xl font-bold mb-6">Lead Pipeline</h2>
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
            <div className="flex justify-between items-center pt-4 border-t border-white/10">
              <span className="text-sm text-white/60">Total Leads</span>
              <span className="font-semibold">{data.totalLeads}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
