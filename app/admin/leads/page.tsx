'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Users, Flame, Phone, Mail, Sparkles, CheckCircle2, Upload, Send, PhoneCall, MailCheck, MailX, Trash2, FileClock, CalendarRange } from 'lucide-react';
import { LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, type LeadStatus } from '@/lib/leads';
import { formatCents } from '@/lib/pricing';
import { Card, PageIn, PageTitle, ViewTabs, SearchFilter, matchesSearch, clickableRowProps, Kicker, BrandButton, Badge, EmptyState, inputClass } from '@/components/admin/ui';
import { QuickAddLeadModal } from '@/components/admin/QuickAddLeadModal';
import { LostReasonModal } from '@/components/admin/LostReasonModal';
import { LogTouchPopover } from '@/components/admin/LogTouchPopover';
import { ImportLeadsModal } from '@/components/admin/ImportLeadsModal';
import { ImportHistoryModal } from '@/components/admin/ImportHistoryModal';
import { BulkEmailComposer } from '@/components/admin/BulkEmailComposer';
import { ColdEmailPreviewModal } from '@/components/admin/ColdEmailPreviewModal';
import { useLeadStatusChange } from '@/components/admin/useLeadStatusChange';

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
  personalizedObservation: string | null;
  painPoints: string;
  emailDeliveryFailedAt: string | null;
  emailDeliveryFailedReason: string | null;
  assignedTo: { name: string | null } | null;
  activities: Array<{ createdAt: string }>;
}

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
      className={`text-xs px-2 py-1 rounded-full border-none cursor-pointer ${LEAD_STATUS_COLORS[lead.status]}`}
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s} className="bg-raised text-white">
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
  if (lead.emailDeliveryFailedAt) {
    return (
      <span title={lead.emailDeliveryFailedReason || "Email didn't send — call instead"} className="inline-flex">
        <MailX size={13} className="text-red-400" />
      </span>
    );
  }
  if (!lead.email) {
    return (
      <span title="No email on file — call instead" className="inline-flex">
        <PhoneCall size={13} className="text-amber-400" />
      </span>
    );
  }
  if (!lead.coldEmailSentAt) {
    return (
      <span
        title={lead.coldEmailDraft ? 'Custom cold email drafted and ready to send' : 'Ready to send (generic template)'}
        className="inline-flex"
      >
        <MailCheck size={13} className={lead.coldEmailDraft ? 'text-emerald-400' : 'text-sky-400'} />
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
          aria-label={`Call ${lead.company}`}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-sky-300 transition-colors"
        >
          <Phone size={14} />
        </a>
      )}
      {lead.email && (
        <a
          href={`mailto:${lead.email}`}
          title={`Email ${lead.email}`}
          aria-label={`Email ${lead.company}`}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-sky-300 transition-colors"
        >
          <Mail size={14} />
        </a>
      )}
      <LogTouchPopover leadId={lead.id} onLogged={onLogged} />
    </div>
  );
}

const FILTERS = ['all', 'needs-contact', 'cold-ready', 'needs-call', 'email-failed', ...LEAD_STATUSES] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All Statuses',
  'needs-contact': 'Needs Contact',
  'cold-ready': 'Cold Email Ready',
  'needs-call': 'Needs a Call',
  'email-failed': "Email Didn't Send",
  ...LEAD_STATUS_LABELS,
};

export default function AdminLeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showImportHistory, setShowImportHistory] = useState(false);
  const [showBulkEmail, setShowBulkEmail] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendingColdDrafts, setSendingColdDrafts] = useState(false);
  const [coldSendResult, setColdSendResult] = useState<{ sentCount: number; total: number; failures: string[]; sentViaResend: number } | null>(null);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [listError, setListError] = useState('');
  const [teamUsers, setTeamUsers] = useState<Array<{ id: string; name: string | null; email: string }>>([]);
  const [reassignTargetId, setReassignTargetId] = useState('');
  const [reassigning, setReassigning] = useState(false);
  const [previewBeforeBulkSend, setPreviewBeforeBulkSend] = useState<boolean | null>(null);
  const [previewingBatch, setPreviewingBatch] = useState<LeadRow[] | null>(null);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);

  // Date bounds live server-side rather than in the client-side filter chain,
  // because the question they answer ("how many did we add in August") is
  // about the whole database, not about the rows that happen to be loaded.
  const [addedFrom, setAddedFrom] = useState('');
  const [addedTo, setAddedTo] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (addedFrom.trim()) query.set('addedFrom', addedFrom.trim());
      if (addedTo.trim()) query.set('addedTo', addedTo.trim());
      const qs = query.toString();
      const response = await fetch(`/api/admin/leads${qs ? `?${qs}` : ''}`);
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
    fetch('/api/admin/settings/preferences')
      .then((r) => r.json())
      .then((data) => setPreviewBeforeBulkSend(data.previewBeforeBulkSend))
      .catch(() => setPreviewBeforeBulkSend(true));
    fetch('/api/admin/settings/gmail')
      .then((r) => r.json())
      .then((data) => setGmailConnected(!!data.willLandInGmailSent))
      .catch(() => setGmailConnected(null));
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((data) => setTeamUsers(data.users || []))
      .catch(() => setTeamUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byStatus = useMemo(() => {
    if (statusFilter === 'all') return leads;
    if (statusFilter === 'needs-contact') {
      return leads.filter((l) => l.status === 'new' && l.activities.length === 0);
    }
    if (statusFilter === 'cold-ready') {
      return leads.filter((l) => l.email && !l.coldEmailSentAt && !l.emailDeliveryFailedAt);
    }
    if (statusFilter === 'needs-call') {
      return leads.filter((l) => !l.email);
    }
    if (statusFilter === 'email-failed') {
      return leads.filter((l) => l.emailDeliveryFailedAt);
    }
    return leads.filter((l) => l.status === statusFilter);
  }, [leads, statusFilter]);

  // Search narrows whatever the status tabs already selected, so the two
  // compose instead of one silently overriding the other.
  const filtered = useMemo(
    () =>
      byStatus.filter((l) =>
        matchesSearch(search, l.company, l.contactName, l.email, l.phone, l.assignedTo?.name)
      ),
    [byStatus, search]
  );

  const needsContactCount = useMemo(
    () => leads.filter((l) => l.status === 'new' && l.activities.length === 0).length,
    [leads]
  );

  // Global counts (not scoped to the current selection) — this is what
  // powers the big "send them all" banner so Evan doesn't have to hunt for
  // small icons or manually select anything for the common case.
  const coldReadyLeads = useMemo(
    () => leads.filter((l) => l.email && !l.coldEmailSentAt && !l.emailDeliveryFailedAt),
    [leads]
  );
  const needsCallLeads = useMemo(() => leads.filter((l) => !l.email && l.coldEmailDraft), [leads]);
  const emailFailedLeads = useMemo(() => leads.filter((l) => l.emailDeliveryFailedAt), [leads]);

  const {
    changeStatus: handleStatusChange,
    lostTarget,
    confirmLost: handleConfirmLost,
    cancelLost,
    error: statusError,
  } = useLeadStatusChange<LeadRow>({
    applyStatus: (lead, status) =>
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status } : l))),
  });

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

  const SELECT_BATCH_SIZE = 50;

  // Adds the next N not-yet-selected leads (in list order) to the current
  // selection — repeated clicks work through a big list in manageable
  // chunks instead of selecting all several hundred at once.
  const handleSelectNextBatch = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      let added = 0;
      for (const lead of filtered) {
        if (added >= SELECT_BATCH_SIZE) break;
        if (!next.has(lead.id)) {
          next.add(lead.id);
          added++;
        }
      }
      return next;
    });
  };

  const remainingUnselectedCount = useMemo(
    () => filtered.filter((l) => !selected.has(l.id)).length,
    [filtered, selected]
  );

  const selectedLeads = useMemo(() => leads.filter((l) => selected.has(l.id)), [leads, selected]);
  const selectedReadyToSend = useMemo(
    () => selectedLeads.filter((l) => l.email),
    [selectedLeads]
  );
  const selectedNeedingCall = useMemo(() => selectedLeads.filter((l) => !l.email), [selectedLeads]);

  // Entry point for every "send prepared cold emails" button — routes to
  // the preview modal unless the user has switched it off in Settings.
  const handleSendColdDrafts = (targets: LeadRow[]) => {
    if (targets.length === 0) return;
    if (previewBeforeBulkSend === false) {
      if (confirm(`Send ${targets.length} prepared cold email${targets.length === 1 ? '' : 's'} now? This goes out immediately.`)) {
        sendColdDrafts(targets.map((l) => l.id));
      }
      return;
    }
    setPreviewingBatch(targets);
  };

  const sendColdDrafts = async (leadIds: string[]) => {
    if (leadIds.length === 0) return;
    setSendingColdDrafts(true);
    try {
      const res = await fetch('/api/admin/email/send-cold-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds }),
      });
      const data = await res.json();
      if (res.ok) {
        const failures = (data.results || [])
          .filter((r: { ok: boolean }) => !r.ok)
          .map((r: { company: string; reason?: string }) => `${r.company}: ${r.reason}`);
        setColdSendResult({ sentCount: data.sentCount, total: data.total, failures, sentViaResend: data.sentViaResend || 0 });
        setSelected(new Set());
        setPreviewingBatch(null);
        load();
      }
    } finally {
      setSendingColdDrafts(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    setListError('');
    try {
      const res = await fetch('/api/admin/leads/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: Array.from(selected) }),
      });
      if (res.ok) {
        setSelected(new Set());
        setConfirmingBulkDelete(false);
        load();
      } else {
        const data = await res.json().catch(() => ({}));
        setListError(data.error || "Couldn't delete those leads — try again.");
      }
    } catch {
      setListError('Could not reach the server — check your connection and try again.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkReassign = async () => {
    if (selected.size === 0) return;
    setReassigning(true);
    setListError('');
    try {
      const res = await fetch('/api/admin/leads/bulk-reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: Array.from(selected), assignedToId: reassignTargetId || null }),
      });
      if (res.ok) {
        setSelected(new Set());
        setReassignTargetId('');
        load();
      } else {
        const data = await res.json().catch(() => ({}));
        setListError(data.error || "Couldn't reassign those leads — try again.");
      }
    } catch {
      setListError('Could not reach the server — check your connection and try again.');
    } finally {
      setReassigning(false);
    }
  };

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
        <div>
          <Kicker className="mb-2">Sales</Kicker>
          <PageTitle icon={Users} title="Leads" />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as Filter)}
            className={`${inputClass} w-full sm:w-52`}
          >
            {FILTERS.map((f) => (
              <option key={f} value={f} className="bg-raised">
                {FILTER_LABELS[f]}
                {f === 'needs-contact' && needsContactCount > 0 ? ` (${needsContactCount})` : ''}
                {f === 'email-failed' && emailFailedLeads.length > 0 ? ` (${emailFailedLeads.length})` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowDateFilter((v) => !v)}
            title="Filter by when leads were added"
            aria-label="Filter by when leads were added"
            aria-expanded={showDateFilter}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 transition-colors whitespace-nowrap ${
              addedFrom || addedTo
                ? 'border-sky-400/40 bg-sky-400/10 text-sky-300'
                : 'border-white/15 text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <CalendarRange size={16} />
          </button>
          <BrandButton
            variant="quiet"
            onClick={() => setShowImport(true)}
            className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 whitespace-nowrap"
          >
            <Upload size={16} />
            Import CSV
          </BrandButton>
          <button
            onClick={() => setShowImportHistory(true)}
            title="View past CSV imports"
            aria-label="View past CSV imports"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-white/50 hover:text-white hover:bg-white/5 transition-colors whitespace-nowrap"
          >
            <FileClock size={16} />
          </button>
          {/* The one sky-to-purple gradient on this screen. */}
          <BrandButton
            onClick={() => setShowAdd(true)}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 whitespace-nowrap"
          >
            <UserPlus size={16} />
            Add Companies
          </BrandButton>
        </div>
      </div>

      {showDateFilter && (
        <Card className="p-4 mb-4">
          <p className="text-xs font-semibold text-white/70 mb-1">Added between</p>
          <p className="text-[11px] text-white/35 mb-3">
            Dates as DDMMYYYY — 03082026 is the 3rd of August. Leave either end blank for "everything before" or
            "everything since".
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={addedFrom}
              onChange={(e) => setAddedFrom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="01082026"
              aria-label="Added from"
              inputMode="numeric"
              className={`${inputClass} w-36 font-mono text-sm`}
            />
            <span className="text-white/30 text-sm">to</span>
            <input
              value={addedTo}
              onChange={(e) => setAddedTo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="31082026"
              aria-label="Added to"
              inputMode="numeric"
              className={`${inputClass} w-36 font-mono text-sm`}
            />
            <BrandButton variant="quiet" onClick={load}>
              Apply
            </BrandButton>
            {(addedFrom || addedTo) && (
              <BrandButton
                variant="quiet"
                onClick={() => {
                  setAddedFrom('');
                  setAddedTo('');
                  // Cleared state hasn't landed yet, so reload on the next
                  // tick rather than re-sending the range we just dropped.
                  setTimeout(load, 0);
                }}
              >
                Clear
              </BrandButton>
            )}
          </div>
          {(addedFrom || addedTo) && !loading && (
            <p className="text-xs text-emerald-300 mt-3">
              {leads.length} {leads.length === 1 ? 'business' : 'businesses'} added in that window.
            </p>
          )}
        </Card>
      )}

      <SearchFilter value={search} onChange={setSearch} count={filtered.length} total={byStatus.length} />

      {(coldReadyLeads.length > 0 || needsCallLeads.length > 0) && (
        <Card className="p-5 mb-6" glow="emerald">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-emerald-400/15 flex items-center justify-center shrink-0">
                <MailCheck size={20} className="text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold">
                  {coldReadyLeads.length > 0
                    ? `${coldReadyLeads.length} cold email${coldReadyLeads.length === 1 ? '' : 's'} ready to send`
                    : 'No cold emails ready right now'}
                </p>
                <p className="text-sm text-white/50">
                  Custom drafts from your CSV import, generic templates for the rest — no typing needed.
                  {needsCallLeads.length > 0 && (
                    <span className="text-amber-300"> {needsCallLeads.length} more have no email on file — call them instead.</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {needsCallLeads.length > 0 && (
                <button
                  onClick={() => setStatusFilter('needs-call')}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-400/30 text-amber-300 px-4 py-2.5 text-sm font-semibold hover:bg-amber-400/10 transition-colors whitespace-nowrap"
                >
                  <PhoneCall size={15} />
                  View {needsCallLeads.length} to call
                </button>
              )}
              {coldReadyLeads.length > 0 && (
                <button
                  onClick={() => handleSendColdDrafts(coldReadyLeads)}
                  disabled={sendingColdDrafts}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
                >
                  <Send size={15} />
                  {sendingColdDrafts ? 'Sending...' : `Send all ${coldReadyLeads.length} now`}
                </button>
              )}
            </div>
          </div>
          {gmailConnected === false && (
            <p className="text-xs text-amber-300/80 mt-3 pt-3 border-t border-white/[0.06]">
              Your Gmail isn't connected — these will send from a shared address instead of yours, and won't
              show up in your Sent folder. Connect it in Settings first if that matters to you.
            </p>
          )}
        </Card>
      )}

      {emailFailedLeads.length > 0 && (
        <Card className="p-5 mb-6" glow="red">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-red-400/15 flex items-center justify-center shrink-0">
                <MailX size={20} className="text-red-400" />
              </div>
              <div>
                <p className="font-semibold">
                  {emailFailedLeads.length} email{emailFailedLeads.length === 1 ? '' : 's'} couldn't be delivered
                </p>
                <p className="text-sm text-white/50">
                  The address is likely invalid or no longer active — call these instead.
                </p>
              </div>
            </div>
            <button
              onClick={() => setStatusFilter('email-failed')}
              className="inline-flex items-center gap-2 rounded-xl border border-red-400/30 text-red-300 px-4 py-2.5 text-sm font-semibold hover:bg-red-400/10 transition-colors whitespace-nowrap shrink-0"
            >
              <PhoneCall size={15} />
              View {emailFailedLeads.length} to call
            </button>
          </div>
        </Card>
      )}

      {(listError || statusError) && (
        <p className="text-sm text-red-300 mb-4" role="alert">
          {listError || statusError}
        </p>
      )}

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
              <button
                onClick={() => {
                  setSelected(new Set());
                  setConfirmingBulkDelete(false);
                }}
                className="text-xs text-white/40 hover:text-white transition-colors"
              >
                Clear
              </button>
              {selectedReadyToSend.length > 0 && (
                <button
                  onClick={() => handleSendColdDrafts(selectedReadyToSend)}
                  disabled={sendingColdDrafts}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-4 py-2 text-sm font-semibold text-black hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Send size={14} />
                  {sendingColdDrafts ? 'Sending...' : `Send prepared cold emails (${selectedReadyToSend.length})`}
                </button>
              )}
              <BrandButton
                variant="quiet"
                onClick={() => setShowBulkEmail(true)}
                className="inline-flex items-center gap-2"
              >
                <Send size={14} />
                Compose cold email
              </BrandButton>
              <div className="flex items-center gap-2">
                <select
                  value={reassignTargetId}
                  onChange={(e) => setReassignTargetId(e.target.value)}
                  className="text-sm bg-white/5 border border-white/15 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                >
                  <option value="" className="bg-raised">
                    Unassign
                  </option>
                  {teamUsers.map((u) => (
                    <option key={u.id} value={u.id} className="bg-raised">
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
                <BrandButton
                  variant="quiet"
                  onClick={handleBulkReassign}
                  disabled={reassigning}
                  className="whitespace-nowrap"
                >
                  {reassigning ? 'Reassigning...' : 'Reassign'}
                </BrandButton>
              </div>
              {confirmingBulkDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/50">Delete {selected.size}?</span>
                  <button
                    onClick={handleBulkDelete}
                    disabled={bulkDeleting}
                    className="px-3 py-2 rounded-xl bg-red-500/90 text-white text-sm font-semibold disabled:opacity-50 hover:bg-red-500 transition-colors"
                  >
                    {bulkDeleting ? 'Deleting...' : 'Confirm'}
                  </button>
                  <BrandButton variant="quiet" onClick={() => setConfirmingBulkDelete(false)}>
                    Cancel
                  </BrandButton>
                </div>
              ) : (
                <BrandButton
                  variant="danger"
                  onClick={() => setConfirmingBulkDelete(true)}
                  className="inline-flex items-center gap-2"
                >
                  <Trash2 size={14} />
                  Delete
                </BrandButton>
              )}
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
          {coldSendResult.sentViaResend > 0 && (
            <p className="text-xs text-amber-300/80 mt-2">
              {coldSendResult.sentViaResend} of these went out through our shared sender, not your own Gmail —
              they won't show up in your Sent folder. Connect Gmail in Settings to fix that going forward.
            </p>
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
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-sm text-white/40">Loading leads…</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-6">
          {statusFilter === 'needs-contact' ? (
            <EmptyState
              icon={CheckCircle2}
              tone="clear"
              text="You're all caught up — nothing waiting on a first touch."
            />
          ) : (
            <EmptyState icon={Users} text="No leads yet." />
          )}
        </Card>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center gap-4 mb-1">
              <button
                onClick={toggleSelectAllVisible}
                className="flex items-center gap-2 text-xs text-white/50 hover:text-white transition-colors"
              >
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((l) => selected.has(l.id))}
                  readOnly
                  className="accent-sky-400 pointer-events-none"
                />
                Select all {filtered.length}
              </button>
              {remainingUnselectedCount > 0 && (
                <button
                  onClick={handleSelectNextBatch}
                  className="text-xs text-sky-300 hover:text-sky-200 transition-colors"
                >
                  Select next {Math.min(SELECT_BATCH_SIZE, remainingUnselectedCount)}
                </button>
              )}
            </div>
            {filtered.map((lead) => (
              <div
                key={lead.id}
                role="link"
                {...clickableRowProps(() => router.push(`/admin/leads/${lead.id}`), `Open ${lead.company}`)}
                className={`rounded-xl border backdrop-blur-xl p-4 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
                  lead.emailDeliveryFailedAt
                    ? 'border-red-400/40 bg-red-400/[0.06] hover:border-red-400/60'
                    : 'border-white/[0.08] bg-white/[0.04] hover:border-white/20'
                }`}
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
                {lead.emailDeliveryFailedAt && (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-red-300 bg-red-400/10 border border-red-400/20 rounded-lg px-2.5 py-1.5 mb-2">
                    <MailX size={12} /> Email failed — call instead
                  </p>
                )}
                <div className="flex justify-between items-center text-xs text-white/40">
                  <span>{lead.estimatedValue ? formatCents(lead.estimatedValue) : '—'}</span>
                  <QuickActions lead={lead} />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          {remainingUnselectedCount > 0 && (
            <div className="hidden md:flex justify-end mb-2">
              <button
                onClick={handleSelectNextBatch}
                className="text-xs text-sky-300 hover:text-sky-200 transition-colors"
              >
                Select next {Math.min(SELECT_BATCH_SIZE, remainingUnselectedCount)}
              </button>
            </div>
          )}
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
                      {...clickableRowProps(() => router.push(`/admin/leads/${lead.id}`), `Open ${lead.company}`)}
                      className={`border-b last:border-0 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400/60 ${
                        lead.emailDeliveryFailedAt
                          ? 'border-white/5 bg-red-400/[0.06] hover:bg-red-400/10'
                          : 'border-white/5 hover:bg-white/5'
                      }`}
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
                      <td className="px-6 py-4 text-white/50">
                        {lead.contactName || lead.email || '—'}
                        {lead.emailDeliveryFailedAt && (
                          <span className="ml-2">
                            <Badge tone="red" solid>
                              Email failed
                            </Badge>
                          </span>
                        )}
                      </td>
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

      {showImportHistory && <ImportHistoryModal onClose={() => setShowImportHistory(false)} />}

      {showBulkEmail && (
        <BulkEmailComposer
          recipients={selectedLeads.map((l) => ({
            id: l.id,
            company: l.company,
            contactName: l.contactName,
            email: l.email,
            personalizedObservation: l.personalizedObservation,
            coldEmailDraft: l.coldEmailDraft,
            painPoints: l.painPoints,
          }))}
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
          onCancel={cancelLost}
          onConfirm={handleConfirmLost}
        />
      )}

      {previewingBatch && (
        <ColdEmailPreviewModal
          leads={previewingBatch}
          sending={sendingColdDrafts}
          gmailConnected={gmailConnected}
          onClose={() => setPreviewingBatch(null)}
          onConfirm={sendColdDrafts}
        />
      )}
    </PageIn>
  );
}
