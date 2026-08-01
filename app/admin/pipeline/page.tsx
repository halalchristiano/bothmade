'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Flame, ExternalLink } from 'lucide-react';
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads';
import { formatCents } from '@/lib/pricing';
import { PageIn } from '@/components/admin/ui';

interface LeadCard {
  id: string;
  company: string;
  contactName: string | null;
  status: LeadStatus;
  estimatedValue: number | null;
  hotLead: boolean;
  updatedAt: string;
  assignedTo: { name: string | null } | null;
}

const COLUMN_STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

const COLUMN_ACCENT: Record<LeadStatus, string> = {
  new: 'border-t-white/30',
  contacted: 'border-t-sky-400/60',
  qualified: 'border-t-purple-400/60',
  proposal: 'border-t-amber-400/60',
  won: 'border-t-emerald-400/60',
  lost: 'border-t-red-400/60',
};

export default function PipelinePage() {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [movingId, setMovingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const response = await fetch('/api/admin/leads');
      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await response.json();
      if (data.success) setLeads(data.leads);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = useMemo(() => {
    const grouped: Record<LeadStatus, LeadCard[]> = {
      new: [],
      contacted: [],
      qualified: [],
      proposal: [],
      won: [],
      lost: [],
    };
    for (const lead of leads) {
      grouped[lead.status]?.push(lead);
    }
    return grouped;
  }, [leads]);

  const handleMove = async (lead: LeadCard, direction: 1 | -1) => {
    const idx = COLUMN_STATUSES.indexOf(lead.status);
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= COLUMN_STATUSES.length) return;
    const nextStatus = COLUMN_STATUSES[nextIdx];

    let lostReason: string | undefined;
    if (nextStatus === 'lost') {
      lostReason = window.prompt('Reason this deal was lost? (optional)') || undefined;
    }

    setMovingId(lead.id);
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: nextStatus } : l)));
    try {
      await fetch(`/api/admin/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, ...(lostReason ? { lostReason } : {}) }),
      });
    } finally {
      setMovingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
      </div>
    );
  }

  return (
    <PageIn className="px-4 md:px-8 py-6 md:py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-1">Pipeline</h1>
        <p className="text-white/40">Every lead, by stage. Use the arrows to move a deal forward or back.</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMN_STATUSES.map((status) => {
          const columnLeads = columns[status];
          const totalValue = columnLeads.reduce((s, l) => s + (l.estimatedValue || 0), 0);
          return (
            <div key={status} className="flex-shrink-0 w-72">
              <div className={`rounded-2xl border-t-2 ${COLUMN_ACCENT[status]} bg-white/[0.03] border border-white/[0.07] p-3 h-full`}>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-sm font-semibold">{LEAD_STATUS_LABELS[status]}</h2>
                  <span className="text-xs text-white/40">{columnLeads.length}</span>
                </div>
                {totalValue > 0 && <p className="text-xs text-white/30 px-1 mb-3">{formatCents(totalValue)}</p>}

                <div className="space-y-2 min-h-[100px]">
                  {columnLeads.map((lead) => (
                    <motion.div
                      key={lead.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: movingId === lead.id ? 0.5 : 1, scale: 1 }}
                      className="rounded-xl border border-white/10 bg-white/[0.04] hover:border-white/20 p-3 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <Link href={`/admin/leads/${lead.id}`} className="font-medium text-sm hover:underline flex items-center gap-1 min-w-0">
                          <span className="truncate">{lead.company}</span>
                          <ExternalLink size={11} className="opacity-0 group-hover:opacity-50 shrink-0" />
                        </Link>
                        {lead.hotLead && <Flame size={13} className="text-amber-400 shrink-0" />}
                      </div>
                      <p className="text-xs text-white/40 mb-2">
                        {lead.estimatedValue ? formatCents(lead.estimatedValue) : '—'}
                        {lead.assignedTo?.name ? ` · ${lead.assignedTo.name}` : ''}
                      </p>
                      <div className="flex justify-between items-center">
                        <button
                          onClick={() => handleMove(lead, -1)}
                          disabled={COLUMN_STATUSES.indexOf(status) === 0}
                          className="p-1 rounded-lg hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                          aria-label="Move back"
                        >
                          <ArrowLeft size={13} />
                        </button>
                        <button
                          onClick={() => handleMove(lead, 1)}
                          disabled={COLUMN_STATUSES.indexOf(status) === COLUMN_STATUSES.length - 1}
                          className="p-1 rounded-lg hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                          aria-label="Move forward"
                        >
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                  {columnLeads.length === 0 && (
                    <p className="text-xs text-white/20 text-center py-6">Nothing here</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </PageIn>
  );
}
