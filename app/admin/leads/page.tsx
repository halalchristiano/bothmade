'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Users, Flame, Phone, Mail, Sparkles, CheckCircle2 } from 'lucide-react';
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads';
import { formatCents } from '@/lib/pricing';
import { Card, PageIn } from '@/components/admin/ui';
import { QuickAddLeadModal } from '@/components/admin/QuickAddLeadModal';
import { LostReasonModal } from '@/components/admin/LostReasonModal';
import { LogTouchPopover } from '@/components/admin/LogTouchPopover';

interface LeadRow {
  id: string;
  company: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  estimatedValue: number | null;
  updatedAt: string;
  hotLead: boolean;
  qualifiedAt: string | null;
  assignedTo: { name: string | null } | null;
  activities: Array<{ createdAt: string }>;
}

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: 'bg-white/10 text-white',
  researched: 'bg-white/10 text-white/80',
  contacted: 'bg-sky-400/20 text-sky-300',
  replied: 'bg-sky-400/25 text-sky-200',
  qualified: 'bg-purple-400/20 text-purple-300',
  discovery_scheduled: 'bg-purple-400/25 text-purple-200',
  discovery_done: 'bg-purple-400/30 text-purple-100',
  mockup_prep: 'bg-pink-400/20 text-pink-300',
  presented: 'bg-pink-400/25 text-pink-200',
  proposal_sent: 'bg-amber-400/20 text-amber-300',
  verbal_yes: 'bg-amber-400/30 text-amber-200',
  contract_sent: 'bg-orange-400/20 text-orange-300',
  contract_signed: 'bg-orange-400/30 text-orange-200',
  deposit_pending: 'bg-teal-400/20 text-teal-300',
  won: 'bg-emerald-400/20 text-emerald-300',
  lost: 'bg-red-400/20 text-red-300',
};

function StatusSelect({
  lead,
  onChange,
}: {
  lead: LeadRow;
  onChange: (lead: LeadRow, status: LeadStatus) => void;
}) {
  return (
    <select
      value={lead.status}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(lead, e.target.value as LeadStatus)}
      className={`text-xs px-2 py-1 rounded-full border-none cursor-pointer ${STATUS_COLORS[lead.status]}`}
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s} className="bg-[#05030a] text-white">
          {LEAD_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

function QuickActions({ lead, onLogged }: { lead: LeadRow; onLogged?: () => void }) {
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {lead.phone && (
        <a
          href={`tel:${lead.phone}`}
          title={`Call ${lead.phone}`}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-sky-300 transition-colors"
        >
          <Phone size={14} />
        </a>
      )}
      {lead.email && (
        <a
          href={`mailto:${lead.email}`}
          title={`Email ${lead.email}`}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-sky-300 transition-colors"
        >
          <Mail size={14} />
        </a>
      )}
      <LogTouchPopover leadId={lead.id} onLogged={onLogged} />
    </div>
  );
}

const FILTERS = ['all', 'needs-contact', ...LEAD_STATUSES] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All Statuses',
  'needs-contact': 'Needs Contact',
  ...LEAD_STATUS_LABELS,
};

export default function AdminLeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Filter>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [lostTarget, setLostTarget] = useState<LeadRow | null>(null);

  const load = async () => {
    setLoading(true);
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

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return leads;
    if (statusFilter === 'needs-contact') {
      return leads.filter((l) => l.status === 'new' && l.activities.length === 0);
    }
    return leads.filter((l) => l.status === statusFilter);
  }, [leads, statusFilter]);

  const needsContactCount = useMemo(
    () => leads.filter((l) => l.status === 'new' && l.activities.length === 0).length,
    [leads]
  );

  const handleStatusChange = async (lead: LeadRow, status: LeadStatus) => {
    if (status === 'lost') {
      setLostTarget(lead);
      return;
    }
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status } : l)));
    await fetch(`/api/admin/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  };

  const handleConfirmLost = async (reason: string) => {
    if (!lostTarget) return;
    const id = lostTarget.id;
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: 'lost' } : l)));
    setLostTarget(null);
    await fetch(`/api/admin/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'lost', lostReason: reason }),
    });
  };

  const inputClass =
    'w-full px-4 py-2 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors';

  return (
    <PageIn className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-8">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400/25 to-sky-500/10 text-sky-300 ring-1 ring-sky-400/20">
            <Users size={17} />
          </span>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Leads</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as Filter)}
            className={`${inputClass} flex-1 sm:flex-none sm:w-52`}
          >
            {FILTERS.map((f) => (
              <option key={f} value={f} className="bg-[#05030a]">
                {FILTER_LABELS[f]}
                {f === 'needs-contact' && needsContactCount > 0 ? ` (${needsContactCount})` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 font-semibold text-black hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <UserPlus size={16} />
            Add Companies
          </button>
        </div>
      </div>

      {needsContactCount > 0 && statusFilter !== 'needs-contact' && (
        <button
          onClick={() => setStatusFilter('needs-contact')}
          className="w-full text-left flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 hover:bg-amber-400/10 px-5 py-3 mb-6 transition-colors"
        >
          <Sparkles size={16} className="text-amber-300 shrink-0" />
          <span className="text-sm">
            <strong className="text-amber-300">{needsContactCount}</strong> compan{needsContactCount === 1 ? 'y' : 'ies'} added but never contacted yet.
          </span>
        </button>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-white/40">
          {statusFilter === 'needs-contact' ? "You're all caught up — nothing waiting on a first touch." : 'No leads yet.'}
        </Card>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {filtered.map((lead) => (
              <div
                key={lead.id}
                onClick={() => router.push(`/admin/leads/${lead.id}`)}
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl p-4 hover:border-white/20 transition-colors cursor-pointer"
              >
                <div className="flex justify-between items-start mb-2 gap-2">
                  <p className="font-semibold flex items-center gap-1.5">
                    {lead.qualifiedAt && <CheckCircle2 size={13} className="text-emerald-400" />}{lead.hotLead && <Flame size={13} className="text-amber-400" />}
                    {lead.company}
                  </p>
                  <StatusSelect lead={lead} onChange={handleStatusChange} />
                </div>
                <p className="text-sm text-white/50 mb-2">{lead.contactName || lead.email || '—'}</p>
                <div className="flex justify-between items-center text-xs text-white/40">
                  <span>{lead.estimatedValue ? formatCents(lead.estimatedValue) : '—'}</span>
                  <QuickActions lead={lead} />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <Card className="hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-white/10">
                  <tr>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Company</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Contact</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Status</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Est. Value</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Assigned</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Last Activity</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Quick Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => router.push(`/admin/leads/${lead.id}`)}
                      className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4 font-medium">
                        <span className="flex items-center gap-1.5">
                          {lead.qualifiedAt && <CheckCircle2 size={13} className="text-emerald-400" />}{lead.hotLead && <Flame size={13} className="text-amber-400" />}
                          {lead.company}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-white/50">{lead.contactName || lead.email || '—'}</td>
                      <td className="px-6 py-4">
                        <StatusSelect lead={lead} onChange={handleStatusChange} />
                      </td>
                      <td className="px-6 py-4 text-white/50">
                        {lead.estimatedValue ? formatCents(lead.estimatedValue) : '—'}
                      </td>
                      <td className="px-6 py-4 text-white/50">{lead.assignedTo?.name || '—'}</td>
                      <td className="px-6 py-4 text-white/50">
                        {lead.activities[0]
                          ? new Date(lead.activities[0].createdAt).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <QuickActions lead={lead} onLogged={load} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {showAdd && (
        <QuickAddLeadModal
          onClose={() => setShowAdd(false)}
          onCreated={(leadId) => {
            setShowAdd(false);
            if (leadId) {
              router.push(`/admin/leads/${leadId}`);
            } else {
              load();
            }
          }}
        />
      )}

      {lostTarget && (
        <LostReasonModal
          companyName={lostTarget.company}
          onCancel={() => setLostTarget(null)}
          onConfirm={handleConfirmLost}
        />
      )}
    </PageIn>
  );
}
