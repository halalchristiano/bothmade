'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { Badge, Card, Kicker, PageIn, PageTitle } from '@/components/admin/ui';

interface ClientRow {
  id: string;
  email: string;
  company: string;
  phone: string | null;
  createdAt: string;
  archivedAt: string | null;
  projects: Array<{ id: string }>;
  lastActivityAt: string | null;
}

function HealthBadge({ lastActivityAt }: { lastActivityAt: string | null }) {
  if (!lastActivityAt) {
    return <Badge tone="neutral" solid>No activity yet</Badge>;
  }
  const days = Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / (24 * 60 * 60 * 1000));
  const tone: 'emerald' | 'amber' | 'red' = days <= 3 ? 'emerald' : days <= 10 ? 'amber' : 'red';
  return (
    <Badge tone={tone} solid>
      {days === 0 ? 'Active today' : `${days}d quiet`}
    </Badge>
  );
}

export default function AdminClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/admin/clients');
        if (response.status === 401) {
          router.push('/admin/login');
          return;
        }
        const data = await response.json();
        if (data.success) {
          setClients(data.clients);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const archivedCount = useMemo(() => clients.filter((c) => c.archivedAt).length, [clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients
      .filter((c) => showArchived || !c.archivedAt)
      .filter((c) => !q || c.email.toLowerCase().includes(q) || c.company.toLowerCase().includes(q));
  }, [clients, search, showArchived]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-white/40">Loading clients…</p>
      </div>
    );
  }

  return (
    <PageIn className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-6 md:mb-8">
        <div>
          <Kicker className="mb-2">Delivery</Kicker>
          <PageTitle icon={Building2} title="Clients" tone="purple" />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or company..."
            className="flex-1 sm:w-72 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-transparent transition-all"
          />
          {archivedCount > 0 && (
            <label className="flex items-center gap-2 text-xs text-white/40 whitespace-nowrap cursor-pointer">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show decommissioned ({archivedCount})
            </label>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-white/40">
          No clients found.
        </Card>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {filtered.map((client) => (
              <Link
                key={client.id}
                href={`/admin/clients/${client.id}`}
                className="block rounded-xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl p-4 hover:border-white/20 transition-colors"
              >
                <div className="flex justify-between items-start mb-1">
                  <p className={`font-semibold ${client.archivedAt ? 'text-white/40 line-through' : ''}`}>{client.company}</p>
                  {client.archivedAt ? (
                    <Badge tone="neutral" solid>Decommissioned</Badge>
                  ) : (
                    <HealthBadge lastActivityAt={client.lastActivityAt} />
                  )}
                </div>
                <p className="text-sm text-white/50 mb-2">{client.email}</p>
                <div className="flex justify-between text-xs text-white/30">
                  <span>{client.projects.length} project{client.projects.length === 1 ? '' : 's'}</span>
                  <span>Joined {new Date(client.createdAt).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: table */}
          <Card className="hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-white/10">
                  <tr>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Company</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Email</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Health</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Projects</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Joined</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client) => (
                    <tr key={client.id} className={`border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors ${client.archivedAt ? 'opacity-50' : ''}`}>
                      <td className="px-6 py-4 font-medium">{client.company}</td>
                      <td className="px-6 py-4 text-white/50">{client.email}</td>
                      <td className="px-6 py-4">
                        {client.archivedAt ? (
                          <Badge tone="neutral" solid>Decommissioned</Badge>
                        ) : (
                          <HealthBadge lastActivityAt={client.lastActivityAt} />
                        )}
                      </td>
                      <td className="px-6 py-4 text-white/50">{client.projects.length}</td>
                      <td className="px-6 py-4 text-white/50">
                        {new Date(client.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/admin/clients/${client.id}`}
                          className="text-sky-300 font-semibold hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </PageIn>
  );
}
