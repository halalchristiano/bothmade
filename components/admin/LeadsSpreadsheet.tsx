'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, RefreshCw } from 'lucide-react';
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, type LeadStatus } from '@/lib/leads';
import { formatCents } from '@/lib/pricing';

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
  assignedTo: { name: string | null } | null;
  updatedAt: string;
  createdAt: string;
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
  }, []);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

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

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl overflow-hidden">
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
          <button
            onClick={load}
            disabled={loading}
            title="Refresh"
            className="p-2 rounded-xl border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[600px]">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="sticky top-0 bg-[#0d0a17] z-10">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={col.sortable ? () => toggleSort(col.key as SortKey) : undefined}
                  className={`px-3 py-2.5 text-xs font-semibold text-white/50 border-b border-r border-white/10 last:border-r-0 whitespace-nowrap ${
                    col.sortable ? 'cursor-pointer hover:text-white select-none' : ''
                  }`}
                >
                  {col.label}
                  {col.sortable && sortKey === col.key && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead, i) => (
              <tr
                key={lead.id}
                onClick={() => router.push(`/admin/leads/${lead.id}`)}
                className={`cursor-pointer hover:bg-sky-400/[0.06] transition-colors ${i % 2 === 0 ? 'bg-white/[0.015]' : ''}`}
              >
                <td className="px-3 py-2 border-b border-r border-white/[0.06] font-medium whitespace-nowrap">{lead.company}</td>
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
                  <span className={`text-xs px-2 py-1 rounded-full ${LEAD_STATUS_COLORS[lead.status]}`}>
                    {LEAD_STATUS_LABELS[lead.status]}
                  </span>
                </td>
                <td className="px-3 py-2 border-b border-r border-white/[0.06] text-white/60 whitespace-nowrap">
                  {lead.estimatedValue ? formatCents(lead.estimatedValue) : '—'}
                </td>
                <td className="px-3 py-2 border-b border-r border-white/[0.06] text-white/60 whitespace-nowrap">
                  {lead.source || '—'}
                </td>
                <td className="px-3 py-2 border-b border-r border-white/[0.06] text-white/60 whitespace-nowrap">
                  {lead.assignedTo?.name || '—'}
                </td>
                <td className="px-3 py-2 border-b border-r border-white/[0.06] text-white/40 whitespace-nowrap">
                  {new Date(lead.createdAt).toLocaleDateString()}
                </td>
                <td className="px-3 py-2 border-b border-white/[0.06] text-white/40 whitespace-nowrap">
                  {new Date(lead.updatedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-white/40">
                  {search ? 'No leads match your search.' : 'No leads yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
