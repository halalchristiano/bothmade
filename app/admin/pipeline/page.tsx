'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Flame, ExternalLink, Phone, Mail, UserPlus, CheckCircle2 } from 'lucide-react';
import { LEAD_STATUSES, LEAD_STATUS_SHORT_LABELS, type LeadStatus } from '@/lib/leads';
import { formatCents } from '@/lib/pricing';
import { PageIn, PageTitle, ViewTabs, SearchFilter, matchesSearch } from '@/components/admin/ui';
import { KanbanSquare } from 'lucide-react';
import { QuickAddLeadModal } from '@/components/admin/QuickAddLeadModal';
import { LostReasonModal } from '@/components/admin/LostReasonModal';
import { LogTouchPopover } from '@/components/admin/LogTouchPopover';

interface LeadCard {
  id: string;
  company: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  estimatedValue: number | null;
  hotLead: boolean;
  qualifiedAt: string | null;
  updatedAt: string;
  assignedTo: { name: string | null } | null;
}

const COLUMN_STATUSES: LeadStatus[] = [...LEAD_STATUSES];

const COLUMN_ACCENT: Record<LeadStatus, string> = {
  new: 'border-t-white/30',
  researched: 'border-t-white/40',
  contacted: 'border-t-sky-400/60',
  replied: 'border-t-sky-400/70',
  qualified: 'border-t-purple-400/60',
  discovery_scheduled: 'border-t-purple-400/70',
  discovery_done: 'border-t-purple-400/80',
  mockup_prep: 'border-t-pink-400/60',
  presented: 'border-t-pink-400/70',
  proposal_sent: 'border-t-amber-400/60',
  verbal_yes: 'border-t-amber-400/80',
  contract_sent: 'border-t-orange-400/70',
  contract_signed: 'border-t-orange-400/90',
  deposit_pending: 'border-t-teal-400/70',
  won: 'border-t-emerald-400/60',
  lost: 'border-t-red-400/60',
};

export default function PipelinePage() {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [movingId, setMovingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [pendingLostMove, setPendingLostMove] = useState<LeadCard | null>(null);

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
    const grouped = Object.fromEntries(LEAD_STATUSES.map((s) => [s, [] as LeadCard[]])) as Record<
      LeadStatus,
      LeadCard[]
    >;
    for (const lead of leads) {
      if (!matchesSearch(search, lead.company, lead.contactName, lead.email, lead.phone, lead.assignedTo?.name)) {
        continue;
      }
      grouped[lead.status]?.push(lead);
    }
    return grouped;
  }, [leads, search]);

  const shownCount = useMemo(
    () => Object.values(columns).reduce((n, col) => n + col.length, 0),
    [columns]
  );

  const applyStatusChange = async (leadId: string, status: LeadStatus, lostReason?: string) => {
    setMovingId(leadId);
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status } : l)));
    try {
      await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(lostReason ? { lostReason } : {}) }),
      });
    } finally {
      setMovingId(null);
    }
  };

  const handleMove = (lead: LeadCard, direction: 1 | -1) => {
    const idx = COLUMN_STATUSES.indexOf(lead.status);
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= COLUMN_STATUSES.length) return;
    const nextStatus = COLUMN_STATUSES[nextIdx];

    if (nextStatus === 'lost') {
      setPendingLostMove(lead);
      return;
    }
    applyStatusChange(lead.id, nextStatus);
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
      <div className="mb-5">
        <ViewTabs
          tabs={[
            { href: '/admin/leads', label: 'List', active: false },
            { href: '/admin/pipeline', label: 'Board', active: true },
          ]}
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
        <div>
          <PageTitle icon={KanbanSquare} title="Pipeline" />
          <p className="text-white/40 mt-1">Every lead, by stage. Use the arrows to move a deal forward or back.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 font-semibold text-black hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          <UserPlus size={16} />
          Add Companies
        </button>
      </div>

      <SearchFilter
        value={search}
        onChange={setSearch}
        placeholder="Find a business on the board..."
        count={shownCount}
        total={leads.length}
      />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMN_STATUSES.map((status) => {
          const columnLeads = columns[status];
          const totalValue = columnLeads.reduce((s, l) => s + (l.estimatedValue || 0), 0);
          return (
            <div key={status} className="flex-shrink-0 w-64">
              <div className={`rounded-2xl border-t-2 ${COLUMN_ACCENT[status]} bg-white/[0.03] border border-white/[0.07] p-3 h-full`}>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-sm font-semibold">{LEAD_STATUS_SHORT_LABELS[status]}</h2>
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
                        <div className="flex items-center gap-1 shrink-0">
                          {lead.qualifiedAt && (
                            <CheckCircle2 size={12} className="text-emerald-400" aria-label="Qualified" />
                          )}
                          {lead.hotLead && <Flame size={13} className="text-amber-400" />}
                        </div>
                      </div>
                      <p className="text-xs text-white/40 mb-2">
                        {lead.estimatedValue ? formatCents(lead.estimatedValue) : '—'}
                        {lead.assignedTo?.name ? ` · ${lead.assignedTo.name}` : ''}
                      </p>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-0.5">
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
                        <div className="flex items-center gap-0.5">
                          {lead.phone && (
                            <a href={`tel:${lead.phone}`} title="Call" className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-sky-300 transition-colors">
                              <Phone size={12} />
                            </a>
                          )}
                          {lead.email && (
                            <a href={`mailto:${lead.email}`} title="Email" className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-sky-300 transition-colors">
                              <Mail size={12} />
                            </a>
                          )}
                          <LogTouchPopover leadId={lead.id} onLogged={load} />
                        </div>
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

      {showAdd && (
        <QuickAddLeadModal
          onClose={() => setShowAdd(false)}
          onCreated={(leadId) => {
            setShowAdd(false);
            if (leadId) router.push(`/admin/leads/${leadId}`);
            else load();
          }}
        />
      )}

      {pendingLostMove && (
        <LostReasonModal
          companyName={pendingLostMove.company}
          onCancel={() => setPendingLostMove(null)}
          onConfirm={(reason) => {
            applyStatusChange(pendingLostMove.id, 'lost', reason);
            setPendingLostMove(null);
          }}
        />
      )}
    </PageIn>
  );
}
