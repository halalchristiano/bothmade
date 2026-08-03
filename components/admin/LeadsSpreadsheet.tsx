'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, RefreshCw, Download, Users, DollarSign, Trophy, Sparkles, Clock, X, Bookmark, Plus, Trash2 } from 'lucide-react';
import { LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, type LeadStatus } from '@/lib/leads';
import { formatCents } from '@/lib/pricing';
import { clickableRowProps } from '@/components/admin/ui';
import { LostReasonModal } from '@/components/admin/LostReasonModal';
import { useLeadStatusChange } from '@/components/admin/useLeadStatusChange';

interface SpreadsheetLead {
  id: string;
  company: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  source: string | null;
  estimatedValue: number | null;
  notes: string | null;
  assignedToId: string | null;
  assignedTo: { name: string | null } | null;
  updatedAt: string;
  createdAt: string;
}

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
}

type SortKey = 'company' | 'status' | 'estimatedValue' | 'updatedAt' | 'createdAt';

const COLUMNS: Array<{ key: SortKey | 'contact' | 'email' | 'phone' | 'source' | 'assigned'; label: string; sortable: boolean }> = [
  { key: 'company', label: 'Company', sortable: true },
  { key: 'contact', label: 'Contact', sortable: false },
  { key: 'email', label: 'Email', sortable: false },
  { key: 'phone', label: 'Phone', sortable: false },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'estimatedValue', label: 'Value', sortable: true },
  { key: 'source', label: 'Source', sortable: false },
  { key: 'assigned', label: 'Assigned', sortable: false },
  { key: 'createdAt', label: 'Added', sortable: true },
  { key: 'updatedAt', label: 'Updated', sortable: true },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const SAVED_VIEWS_KEY = 'bothmade_leads_saved_views';

interface SavedView {
  id: string;
  name: string;
  search: string;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * A live, searchable, spreadsheet-style view of every lead — every CSV
 * Evan imports lands here automatically since it reads the same lead data
 * everyone else works from, and every status change he makes shows the
 * same color here too (LEAD_STATUS_COLORS is the one shared mapping).
 * Not a separate copy of the data — just a denser, Excel-like way to
 * browse and search the whole book at once.
 */
export function LeadsSpreadsheet() {
  const router = useRouter();
  const [leads, setLeads] = useState<SpreadsheetLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
  const [savingAssignId, setSavingAssignId] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [namingView, setNamingView] = useState(false);
  const [newViewName, setNewViewName] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/leads');
      const data = await res.json();
      if (data.success) setLeads(data.leads);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((data) => setTeam(data.users || []))
      .catch(() => {});
    try {
      const stored = localStorage.getItem(SAVED_VIEWS_KEY);
      if (stored) setSavedViews(JSON.parse(stored));
    } catch {
      // Corrupt or missing local storage — just start with no saved views.
    }
  }, []);

  const persistViews = (views: SavedView[]) => {
    setSavedViews(views);
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
  };

  const handleSaveView = () => {
    if (!newViewName.trim()) return;
    const view: SavedView = { id: `${Date.now()}`, name: newViewName.trim(), search, sortKey, sortDir };
    persistViews([...savedViews, view]);
    setNewViewName('');
    setNamingView(false);
  };

  const applyView = (view: SavedView) => {
    setSearch(view.search);
    setSortKey(view.sortKey);
    setSortDir(view.sortDir);
    setViewsOpen(false);
  };

  const deleteView = (id: string) => {
    persistViews(savedViews.filter((v) => v.id !== id));
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Shared with the leads list, the pipeline board and the lead page — which
  // also means picking "Lost" here now asks why, instead of being the one
  // place in the app a deal could die without a recorded reason.
  const {
    changeStatus: handleStatusChange,
    lostTarget,
    confirmLost,
    cancelLost,
    error: statusError,
  } = useLeadStatusChange<SpreadsheetLead>({
    applyStatus: (lead, status) =>
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, status, updatedAt: new Date().toISOString() } : l))
      ),
    onSavingChange: setSavingStatusId,
  });

  const handleAssignChange = async (leadId: string, assignedToId: string) => {
    setSavingAssignId(leadId);
    const member = team.find((t) => t.id === assignedToId);
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, assignedToId: assignedToId || null, assignedTo: member ? { name: member.name } : null } : l))
    );
    try {
      await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedToId: assignedToId || null }),
      });
    } finally {
      setSavingAssignId(null);
    }
  };

  const toggleSelected = (leadId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  // Logs a note to team chat after a bulk action — bulk edits otherwise
  // leave no trace anywhere else in the app the way a single-lead change
  // does, so nobody can tell who reassigned or snoozed a batch of leads.
  const logBulkAction = async (summary: string) => {
    try {
      await fetch('/api/admin/team-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: summary }),
      });
    } catch {
      // Audit note is best-effort — never block the bulk action on it.
    }
  };

  const handleBulkAssign = async (assignedToId: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const member = team.find((t) => t.id === assignedToId);
    const companies = leads.filter((l) => ids.includes(l.id)).map((l) => l.company);
    setLeads((prev) =>
      prev.map((l) =>
        ids.includes(l.id) ? { ...l, assignedToId: assignedToId || null, assignedTo: member ? { name: member.name } : null } : l
      )
    );
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/admin/leads/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignedToId: assignedToId || null }),
          })
        )
      );
      await logBulkAction(
        `📋 Bulk-assigned ${ids.length} lead${ids.length === 1 ? '' : 's'} to ${member ? member.name || member.email : 'Unassigned'}: ${companies.slice(0, 8).join(', ')}${companies.length > 8 ? `, +${companies.length - 8} more` : ''}`
      );
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkSnooze = async (days: number) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const nextFollowUpAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const companies = leads.filter((l) => ids.includes(l.id)).map((l) => l.company);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/admin/leads/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nextFollowUpAt }),
          })
        )
      );
      await logBulkAction(
        `📋 Bulk-snoozed ${ids.length} lead${ids.length === 1 ? '' : 's'} ${days} day${days === 1 ? '' : 's'}: ${companies.slice(0, 8).join(', ')}${companies.length > 8 ? `, +${companies.length - 8} more` : ''}`
      );
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const stats = useMemo(() => {
    const now = Date.now();
    const totalValue = leads.reduce((sum, l) => sum + (l.estimatedValue || 0), 0);
    const won = leads.filter((l) => l.status === 'won').length;
    const newThisWeek = leads.filter((l) => now - new Date(l.createdAt).getTime() < 7 * DAY_MS).length;
    return { total: leads.length, totalValue, won, newThisWeek };
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = leads;
    if (q) {
      rows = leads.filter((l) =>
        [
          l.company,
          l.contactName,
          l.email,
          l.phone,
          l.source,
          l.notes,
          LEAD_STATUS_LABELS[l.status],
          l.assignedTo?.name,
        ]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(q))
      );
    }

    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'company') cmp = a.company.localeCompare(b.company);
      else if (sortKey === 'status') cmp = LEAD_STATUS_LABELS[a.status].localeCompare(LEAD_STATUS_LABELS[b.status]);
      else if (sortKey === 'estimatedValue') cmp = (a.estimatedValue || 0) - (b.estimatedValue || 0);
      else if (sortKey === 'updatedAt') cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      else if (sortKey === 'createdAt') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [leads, search, sortKey, sortDir]);

  const handleExport = () => {
    const headers = ['Company', 'Contact', 'Email', 'Phone', 'Status', 'Value', 'Source', 'Assigned', 'Added', 'Updated'];
    const rows = filtered.map((l) => [
      l.company,
      l.contactName || '',
      l.email || '',
      l.phone || '',
      LEAD_STATUS_LABELS[l.status],
      l.estimatedValue ? (l.estimatedValue / 100).toFixed(2) : '',
      l.source || '',
      l.assignedTo?.name || '',
      new Date(l.createdAt).toLocaleDateString(),
      new Date(l.updatedAt).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bothmade-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl overflow-hidden shadow-[0_0_60px_-15px_rgba(56,189,248,0.1)]">
      <div className="p-4 pb-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/35 mb-1">
              <Users size={11} /> Total Leads
            </p>
            <p className="text-xl font-bold">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-emerald-300/70 mb-1">
              <DollarSign size={11} /> Pipeline Value
            </p>
            <p className="text-xl font-bold text-emerald-300">{formatCents(stats.totalValue)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-amber-300/70 mb-1">
              <Trophy size={11} /> Won
            </p>
            <p className="text-xl font-bold text-amber-300">{stats.won}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-sky-300/70 mb-1">
              <Sparkles size={11} /> New This Week
            </p>
            <p className="text-xl font-bold text-sky-300">{stats.newThisWeek}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-white/[0.08]">
        <div>
          <h2 className="text-lg font-bold">All Leads — Master Sheet</h2>
          <p className="text-xs text-white/40 mt-0.5">
            {leads.length} lead{leads.length === 1 ? '' : 's'} total · updates live as Evan imports or works leads
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search everything..."
              className="pl-8 pr-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50 w-56"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setViewsOpen((v) => !v)}
              title="Saved views"
              aria-label="Saved views"
              className="p-2 rounded-xl border border-white/10 hover:bg-white/5 transition-colors"
            >
              <Bookmark size={14} />
            </button>
            {viewsOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-white/10 bg-[#0d0a17] shadow-2xl z-30 p-2">
                {savedViews.length === 0 && !namingView && (
                  <p className="text-xs text-white/30 px-2 py-2">No saved views yet.</p>
                )}
                {savedViews.map((v) => (
                  <div key={v.id} className="flex items-center gap-1 group">
                    <button
                      onClick={() => applyView(v)}
                      className="flex-1 text-left text-sm px-2 py-1.5 rounded-lg hover:bg-white/[0.06] text-white/80 truncate"
                    >
                      {v.name}
                    </button>
                    <button
                      onClick={() => deleteView(v.id)}
                      title="Delete view"
                      aria-label={`Delete saved view ${v.name}`}
                      className="p-1.5 rounded-md text-white/20 hover:text-red-300 hover:bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <div className="border-t border-white/10 mt-1.5 pt-1.5">
                  {namingView ? (
                    <div className="flex items-center gap-1.5 px-1">
                      <input
                        autoFocus
                        value={newViewName}
                        onChange={(e) => setNewViewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveView()}
                        placeholder="View name..."
                        className="flex-1 px-2 py-1 rounded-md bg-white/[0.06] border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
                      />
                      <button
                        onClick={handleSaveView}
                        disabled={!newViewName.trim()}
                        className="text-xs px-2 py-1 rounded-md bg-sky-400 text-black font-semibold disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setNamingView(true)}
                      className="flex items-center gap-1.5 w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-white/[0.06] text-sky-300"
                    >
                      <Plus size={12} /> Save current search + sort
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={handleExport}
            title="Export current view as CSV"
            aria-label="Export current view as CSV"
            className="p-2 rounded-xl border border-white/10 hover:bg-white/5 transition-colors"
          >
            <Download size={14} />
          </button>
          <button
            onClick={load}
            disabled={loading}
            title="Refresh"
            aria-label="Refresh leads"
            className="p-2 rounded-xl border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-white/[0.08] bg-sky-400/[0.06]">
          <span className="text-xs font-semibold text-sky-200 whitespace-nowrap">{selected.size} selected</span>
          <select
            onChange={(e) => {
              if (e.target.value) handleBulkAssign(e.target.value);
              e.target.value = '';
            }}
            disabled={bulkBusy}
            defaultValue=""
            className="text-xs px-2 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-white disabled:opacity-50"
          >
            <option value="" disabled>
              Assign to...
            </option>
            <option value="">Unassigned</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name || t.email}
              </option>
            ))}
          </select>
          <button
            onClick={() => handleBulkSnooze(3)}
            disabled={bulkBusy}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-white/80 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <Clock size={12} /> Snooze 3 days
          </button>
          <button
            onClick={() => handleBulkSnooze(7)}
            disabled={bulkBusy}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-white/80 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <Clock size={12} /> Snooze 1 week
          </button>
          <button
            onClick={clearSelection}
            disabled={bulkBusy}
            className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg text-white/40 hover:text-white transition-colors disabled:opacity-50 ml-auto"
          >
            <X size={12} /> Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto max-h-[600px]">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="sticky top-0 bg-[#0d0a17] z-20">
            <tr>
              <th className="px-3 py-2.5 border-b border-r border-white/10 w-9">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((l) => selected.has(l.id))}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(filtered.map((l) => l.id)) : new Set())
                  }
                  className="cursor-pointer"
                />
              </th>
              {COLUMNS.map((col, i) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    col.sortable && sortKey === col.key
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  className={`px-3 py-2.5 text-xs font-semibold text-white/50 border-b border-r border-white/10 last:border-r-0 whitespace-nowrap ${
                    i === 0 ? 'sticky left-0 bg-[#0d0a17] z-30' : ''
                  }`}
                >
                  {/* A sortable header is a control, so it's a real button —
                      clicking a bare <th> was mouse-only. */}
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key as SortKey)}
                      className="w-full text-left hover:text-white select-none"
                    >
                      {col.label}
                      {sortKey === col.key && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead, i) => {
              const rowBg = i % 2 === 0 ? '#0d0a17' : '#100c1c';
              const recentlyTouched = Date.now() - new Date(lead.updatedAt).getTime() < DAY_MS;
              return (
                <tr
                  key={lead.id}
                  {...clickableRowProps(() => router.push(`/admin/leads/${lead.id}`), `Open ${lead.company}`)}
                  className="cursor-pointer hover:bg-sky-400/[0.06] transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400/60"
                  style={{ backgroundColor: rowBg }}
                >
                  <td className="px-3 py-2 border-b border-r border-white/[0.06]" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleSelected(lead.id)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td
                    className="px-3 py-2 border-b border-r border-white/[0.06] font-medium whitespace-nowrap sticky left-0 z-10 group-hover:!bg-[#12213a]"
                    style={{ backgroundColor: rowBg }}
                  >
                    <span className="flex items-center gap-1.5">
                      {recentlyTouched && (
                        <span title="Updated in the last 24 hours" className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                      )}
                      {lead.company}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-r border-white/[0.06] text-white/60 whitespace-nowrap">
                    {lead.contactName || '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-r border-white/[0.06] text-white/60 whitespace-nowrap">
                    {lead.email || '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-r border-white/[0.06] text-white/60 whitespace-nowrap">
                    {lead.phone || '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-r border-white/[0.06] whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={lead.status}
                      onChange={(e) => handleStatusChange(lead, e.target.value as LeadStatus)}
                      disabled={savingStatusId === lead.id}
                      aria-label={`Status for ${lead.company}`}
                      className={`text-xs px-2 py-1 rounded-full border-none cursor-pointer disabled:opacity-50 ${LEAD_STATUS_COLORS[lead.status]}`}
                    >
                      {LEAD_STATUSES.map((s) => (
                        <option key={s} value={s} className="bg-[#05030a] text-white">
                          {LEAD_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 border-b border-r border-white/[0.06] text-white/60 whitespace-nowrap">
                    {lead.estimatedValue ? formatCents(lead.estimatedValue) : '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-r border-white/[0.06] text-white/60 whitespace-nowrap">
                    {lead.source || '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-r border-white/[0.06] text-white/60 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={lead.assignedToId || ''}
                      onChange={(e) => handleAssignChange(lead.id, e.target.value)}
                      disabled={savingAssignId === lead.id}
                      className="bg-transparent text-white/60 hover:text-white text-sm border-none cursor-pointer disabled:opacity-50 focus:outline-none"
                    >
                      <option value="" className="bg-[#05030a] text-white">Unassigned</option>
                      {team.map((t) => (
                        <option key={t.id} value={t.id} className="bg-[#05030a] text-white">
                          {t.name || t.email}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 border-b border-r border-white/[0.06] text-white/40 whitespace-nowrap">
                    {new Date(lead.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 border-b border-white/[0.06] text-white/40 whitespace-nowrap">
                    {new Date(lead.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-3 py-8 text-center text-white/40">
                  {search ? 'No leads match your search.' : 'No leads yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {statusError && (
        <p role="alert" className="text-sm text-red-300 mt-3">
          {statusError}
        </p>
      )}

      {lostTarget && (
        <LostReasonModal companyName={lostTarget.company} onCancel={cancelLost} onConfirm={confirmLost} />
      )}
    </div>
  );
}
