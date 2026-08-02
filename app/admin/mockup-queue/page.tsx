'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ImageIcon, ExternalLink } from 'lucide-react';
import { PageIn, SearchFilter, matchesSearch } from '@/components/admin/ui';

interface QueueRow {
  id: string;
  company: string;
  contactName: string | null;
  mockupRequestedAt: string | null;
  hotLead: boolean;
  assignedTo: { name: string | null } | null;
}

/** Whole days since the request — "waiting since yesterday" beats a raw date. */
function daysWaiting(requestedAt: string | null): number | null {
  if (!requestedAt) return null;
  const ms = Date.now() - new Date(requestedAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export default function MockupQueuePage() {
  const router = useRouter();
  const [leads, setLeads] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const load = async () => {
    try {
      const res = await fetch('/api/admin/leads/mockup-queue');
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await res.json();
      if (data.success) setLeads(data.leads);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeliver = async (leadId: string) => {
    const url = (urlDrafts[leadId] || '').trim();
    if (!url) return;
    setSaving((prev) => ({ ...prev, [leadId]: true }));
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockupUrl: url }),
      });
      if (res.ok) {
        setLeads((prev) => prev.filter((l) => l.id !== leadId));
      }
    } finally {
      setSaving((prev) => ({ ...prev, [leadId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400" />
      </div>
    );
  }

  const visible = leads.filter((l) => matchesSearch(search, l.company, l.contactName));
  const sortedByWait = [...visible].sort((a, b) => {
    if (a.hotLead !== b.hotLead) return a.hotLead ? -1 : 1;
    return (daysWaiting(a.mockupRequestedAt) ?? 0) - (daysWaiting(b.mockupRequestedAt) ?? 0) > 0 ? -1 : 1;
  });

  return (
    <PageIn className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ImageIcon size={22} /> Mockup Queue
        </h1>
        <p className="text-sm text-white/45 mt-1">
          {leads.length === 0
            ? 'Nothing waiting on a mockup right now.'
            : `${leads.length} ${leads.length === 1 ? 'lead is' : 'leads are'} waiting on a mockup, longest-waiting and hot leads first.`}
        </p>
      </div>

      <div className="mt-5 mb-5">
        <SearchFilter
          value={search}
          onChange={setSearch}
          placeholder="Find a business..."
          count={visible.length}
          total={leads.length}
        />
      </div>

      {sortedByWait.length === 0 && !search && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/40 text-sm">
          Nothing waiting on a mockup right now.
        </div>
      )}

      <div className="space-y-3">
        {sortedByWait.map((lead) => {
          const days = daysWaiting(lead.mockupRequestedAt);
          return (
            <div
              key={lead.id}
              className={`rounded-xl border p-4 min-w-0 ${
                lead.hotLead ? 'border-amber-400/25 bg-amber-400/[0.04]' : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <Link
                    href={`/admin/leads/${lead.id}`}
                    className="text-sm font-bold text-white/90 hover:underline break-words inline-flex items-center gap-1.5"
                  >
                    {lead.hotLead && '🔥'} {lead.company}
                    <ExternalLink size={11} className="opacity-40" />
                  </Link>
                  <p className="text-xs text-white/40 mt-0.5">
                    {days === null
                      ? 'Requested recently'
                      : days === 0
                      ? 'Requested today'
                      : `Waiting ${days} ${days === 1 ? 'day' : 'days'}`}
                    {lead.assignedTo?.name ? ` · ${lead.assignedTo.name}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  value={urlDrafts[lead.id] || ''}
                  onChange={(e) => setUrlDrafts((prev) => ({ ...prev, [lead.id]: e.target.value }))}
                  placeholder="Paste the mockup link..."
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/20 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                />
                <button
                  onClick={() => handleDeliver(lead.id)}
                  disabled={saving[lead.id] || !(urlDrafts[lead.id] || '').trim()}
                  className="shrink-0 px-4 py-2 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 text-black text-sm font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  {saving[lead.id] ? 'Sending...' : 'Mark Delivered'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </PageIn>
  );
}
