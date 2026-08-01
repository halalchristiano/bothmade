'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Users, Flame, Phone, Mail, Sparkles, CheckCircle2, Upload, Send, PhoneCall, MailCheck } from 'lucide-react';
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads';
import { formatCents } from '@/lib/pricing';
import { Card, PageIn, PageTitle, ViewTabs } from '@/components/admin/ui';
import { QuickAddLeadModal } from '@/components/admin/QuickAddLeadModal';
import { LostReasonModal } from '@/components/admin/LostReasonModal';
import { LogTouchPopover } from '@/components/admin/LogTouchPopover';
import { ImportLeadsModal } from '@/components/admin/ImportLeadsModal';
import { BulkEmailComposer } from '@/components/admin/BulkEmailComposer';

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
  coldEmailDraft: string | null;
  coldEmailSentAt: string | null;
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

// Shows whether a lead is one click away from a cold email, or needs a call
// instead — the whole point of storing a pre-written draft is knowing at a
// glance which leads are ready without opening each one.
function ColdOutreachFlag({ lead }: { lead: LeadRow }) {
  if (!lead.email) {
    return (
      <span title="No email on file — call instead" className="inline-flex">
        <PhoneCall size={13} className="text-amber-400" />
      </span>
    );
  }
  if (lead.coldEmailDraft && !lead.coldEmailSentAt) {
    return (
      <span title="Cold email drafted and ready to send" className="inline-flex">
        <MailCheck size={13} className="text-emerald-400" />
      </span>
    );
  }
  return null;
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
  const [showImport, setShowImport] = useState(false);
  const [showBulkEmail, setShowBulkEmail] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lostTarget, setLostTarget] = useState<LeadRow | null>(null);
  const [sendingColdDrafts, setSendingColdDrafts] = useState(false);
  const [coldSendResult, setColdSendResult] = useState<{ sentCount: number; total: number; failures: string[] } | null>(null);

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

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelected((prev) => {
      const allVisible = filtered.every((l) => prev.has(l.id));
      if (allVisible) return new Set();
      return new Set(filtered.map((l) => l.id));
    });
  };

  const selectedLeads = useMemo(() => leads.filter((l) => selected.has(l.id)), [leads, selected]);
  const selectedReadyToSend = useMemo(
    () => selectedLeads.filter((l) => l.email && l.coldEmailDraft),
    [selectedLeads]
  );
  const selectedNeedingCall = useMemo(() => selectedLeads.filter((l) => !l.email), [selectedLeads]);

  const handleSendColdDrafts = async () => {
    if (selectedReadyToSend.length === 0) return;
    setSendingColdDrafts(true);
    try {
      const res = await fetch('/api/admin/email/send-cold-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: selectedReadyToSend.map((l) => l.id) }),
      });
      const data = await res.json();
      if (res.ok) {
        const failures = (data.results || [])
          .filter((r: { ok: boolean }) => !r.ok)
          .map((r: { company: string; reason?: string }) => `${r.company}: ${r.reason}`);
        setColdSendResult({ sentCount: data.sentCount, total: data.total, failures });
        setSelected(new Set());
        load();
      }
    } finally {
      setSendingColdDrafts(false);
    }
  };

  const inputClass =
    'w-full px-4 py-2 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors';

  return (
    <PageIn className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-5">
        <ViewTabs
          tabs={[
            { href: '/admin/leads', label: 'List', active: true },
            { href: '/admin/pipeline', label: 'Board', active: false },
          ]}
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-8">
        <PageTitle icon={Users} title="Leads" />
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
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 font-semibold hover:bg-white/5 transition-colors whitespace-nowrap"
          >
            <Upload size={16} />
            Import CSV
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 font-semibold text-black hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <UserPlus size={16} />
            Add Companies
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 px-5 py-3 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">
              <strong className="text-sky-300">{selected.size}</strong> selected
              {selectedNeedingCall.length > 0 && (
                <span className="text-amber-300"> · {selectedNeedingCall.length} no email — call instead</span>
              )}
            </span>
            <div className="flex items-center gap-3">
              <button onClick={() => setSelected(new Set())} className="text-xs text-white/40 hover:text-white transition-colors">
                Clear
              </button>
              {selectedReadyToSend.length > 0 && (
                <button
                  onClick={handleSendColdDrafts}
                  disabled={sendingColdDrafts}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-4 py-2 text-sm font-semibold text-black hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Send size={14} />
                  {sendingColdDrafts ? 'Sending...' : `Send prepared cold emails (${selectedReadyToSend.length})`}
                </button>
              )}
              <button
                onClick={() => setShowBulkEmail(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
              >
                <Send size={14} />
                Compose cold email
              </button>
            </div>
          </div>
        </div>
      )}

      {coldSendResult && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-5 py-3 mb-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm">
              Sent <strong className="text-emerald-300">{coldSendResult.sentCount}</strong> of {coldSendResult.total} prepared cold emails.
            </p>
            <button onClick={() => setColdSendResult(null)} className="text-xs text-white/40 hover:text-white transition-colors shrink-0">
              Dismiss
            </button>
          </div>
          {coldSendResult.failures.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {coldSendResult.failures.map((f, i) => (
                <p key={i} className="text-xs text-amber-300">
                  {f}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

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
                  <p className="font-semibold flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSelected(lead.id)}
                      className="accent-sky-400"
                    />
                    {lead.qualifiedAt && <CheckCircle2 size={13} className="text-emerald-400" />}{lead.hotLead && <Flame size={13} className="text-amber-400" />}<ColdOutreachFlag lead={lead} />
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
                    <th className="px-6 py-3">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every((l) => selected.has(l.id))}
                        onChange={toggleSelectAllVisible}
                        className="accent-sky-400"
                      />
                    </th>
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
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(lead.id)}
                          onChange={() => toggleSelected(lead.id)}
                          className="accent-sky-400"
                        />
                      </td>
                      <td className="px-6 py-4 font-medium">
                        <span className="flex items-center gap-1.5">
                          {lead.qualifiedAt && <CheckCircle2 size={13} className="text-emerald-400" />}{lead.hotLead && <Flame size={13} className="text-amber-400" />}<ColdOutreachFlag lead={lead} />
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

      {showImport && (
        <ImportLeadsModal
          onClose={() => setShowImport(false)}
          onImported={load}
        />
      )}

      {showBulkEmail && (
        <BulkEmailComposer
          recipients={selectedLeads.map((l) => ({ id: l.id, company: l.company, contactName: l.contactName, email: l.email }))}
          onClose={() => setShowBulkEmail(false)}
          onSent={() => {
            setSelected(new Set());
            load();
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
