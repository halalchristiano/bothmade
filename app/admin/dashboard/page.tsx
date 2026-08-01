'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Stats {
  totalClients: number;
  totalProjects: number;
  activeProjects: number;
  byStatus: Record<string, number>;
  recentActivity: Array<{
    id: string;
    name: string;
    company: string;
    status: string;
    updatedAt: string;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  discovery: 'Discovery',
  design: 'Design',
  build: 'Build',
  launch: 'Launch',
  complete: 'Complete',
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/admin/stats');
        if (response.status === 401) {
          router.push('/admin/login');
          return;
        }
        const data = await response.json();
        if (data.success) {
          setStats(data.stats);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
          <p className="text-sm text-white/40 mb-2">Total Clients</p>
          <p className="text-4xl font-bold">{stats.totalClients}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
          <p className="text-sm text-white/40 mb-2">Total Projects</p>
          <p className="text-4xl font-bold">{stats.totalProjects}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
          <p className="text-sm text-white/40 mb-2">Active Projects</p>
          <p className="text-4xl font-bold">{stats.activeProjects}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
          <h2 className="text-xl font-bold mb-4">Projects by Status</h2>
          <div className="space-y-3">
            {Object.entries(STATUS_LABELS).map(([key, label]) => {
              const count = stats.byStatus[key] || 0;
              const pct = stats.totalProjects
                ? (count / stats.totalProjects) * 100
                : 0;
              return (
                <div key={key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{label}</span>
                    <span className="text-white/40">{count}</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-sky-400 to-purple-500 h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
          <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
          {stats.recentActivity.length === 0 ? (
            <p className="text-white/40 text-sm">No projects yet.</p>
          ) : (
            <div className="space-y-2">
              {stats.recentActivity.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/projects/${p.id}`}
                  className="block p-3 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-sm text-white/40">{p.company}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-white/10 capitalize">
                      {p.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <Link
          href="/admin/clients"
          className="px-5 py-3 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 text-black font-semibold hover:opacity-90 transition-opacity"
        >
          View Clients
        </Link>
        <Link
          href="/admin/projects"
          className="px-5 py-3 rounded-lg border border-white/15 font-semibold hover:bg-white/5 transition-colors"
        >
          View Projects
        </Link>
      </div>
    </div>
  );
}
