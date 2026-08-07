'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { Badge, Card, Kicker, LoadError, PageIn, PageTitle, SearchFilter } from '@/components/admin/ui';

interface ClientRow {
  id: string;
  email: string;
  company: string;
  phone: string | null;
  createdAt: string;
  /** When money first cleared. Null for a client created by hand, who has never paid. */
  firstPaidAt: string | null;
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
  const [failed, setFailed] = useState(false);

      /*
       * "No X found" is a claim about the data, and a failed fetch is not
       * entitled to make it. See LoadError in components/admin/ui.
       */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/clients');
      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await response.json();
      if (!response.ok || !data?.success) {
        setFailed(true);
        return;
      }
      setClients(data.clients ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

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
          {/* The rule for what lands on this page, stated. Signing and paying
              are different events and a lead can do the first without ever
              doing the second — which is exactly the thing that was worth
              asking about and was written down nowhere. */}
          <p className="text-white/40 mt-1 text-sm">
            Everyone with a project — almost always because they paid, occasionally because someone
            set one up by hand. A signed lead with no project stays a lead.
          </p>
        </div>
        {/*
          The shared search box, not a hand-rolled one.
          
          This page had its own <input>: a placeholder and nothing else. The
          placeholder disappears the moment anybody types, so a screen reader
          announced the field as unnamed and there was no way back to the full
          list except selecting the text and deleting it. And with no match
          count, a search that found nothing looked exactly like a client list
          that had lost its rows — the same confusion the empty state fix was
          about, one control along.
          
          SearchFilter is what Design, Projects and Mockups already use. It
          carries an accessible name, a clear button, and "3 of 40 match".
        */}
        <div className="flex w-full flex-col gap-2 sm:w-80">
          <SearchFilter
            value={search}
            onChange={setSearch}
            placeholder="Search by email or company…"
            count={filtered.length}
            total={clients.length}
          />
          {archivedCount > 0 && (
            <label className="-mt-2 flex cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-white/40">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show decommissioned ({archivedCount})
            </label>
          )}
        </div>
      </div>

      {failed ? (
        <Card className="p-4">
          <LoadError what="the client list" onRetry={load} />
        </Card>
      ) : filtered.length === 0 ? (
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
                  <span>
                    {client.firstPaidAt
                      ? `First paid ${new Date(client.firstPaidAt).toLocaleDateString()}`
                      : 'Never paid'}
                  </span>
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
                    {/* "Joined" was ambiguous enough to be asked about
                        directly, and my first answer to it was wrong: a
                        client row is *usually* created by a completed
                        checkout, but creating a project by hand creates one
                        too, with no money involved. So this shows the real
                        first payment, and says plainly when there wasn't
                        one — which is the more useful fact anyway. */}
                    <th
                      className="px-6 py-3 text-sm font-semibold text-white/40"
                      title="When money first cleared. 'Never paid' means they were added by hand."
                    >
                      First paid
                    </th>
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
                        {client.firstPaidAt ? (
                          new Date(client.firstPaidAt).toLocaleDateString()
                        ) : (
                          <span className="text-amber-300/70" title="On the books, but no payment has ever cleared">
                            Never paid
                          </span>
                        )}
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
