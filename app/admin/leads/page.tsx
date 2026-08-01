'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Users, Flame } from 'lucide-react';
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads';
import { formatCents } from '@/lib/pricing';
import { Card, PageIn } from '@/components/admin/ui';

interface LeadRow {
  id: string;
  company: string;
  contactName: string | null;
  email: string | null;
  status: LeadStatus;
  estimatedValue: number | null;
  updatedAt: string;
  hotLead: boolean;
  assignedTo: { name: string | null } | null;
  activities: Array<{ createdAt: string }>;
}

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: 'bg-white/10 text-white',
  contacted: 'bg-sky-400/20 text-sky-300',
  qualified: 'bg-purple-400/20 text-purple-300',
  proposal: 'bg-amber-400/20 text-amber-300',
  won: 'bg-emerald-400/20 text-emerald-300',
  lost: 'bg-red-400/20 text-red-300',
};

export default function AdminLeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');

  const [showNew, setShowNew] = useState(false);
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const query = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const response = await fetch(`/api/admin/leads${query}`);
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
  }, [statusFilter]);

  const handleCreate = async () => {
    if (!company.trim()) return;
    setCreating(true);
    try {
      const response = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, contactName, email, phone, source }),
      });
      const data = await response.json();
      if (data.success) {
        setShowNew(false);
        setCompany('');
        setContactName('');
        setEmail('');
        setPhone('');
        setSource('');
        router.push(`/admin/leads/${data.lead.id}`);
      }
    } finally {
      setCreating(false);
    }
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
            onChange={(e) => setStatusFilter(e.target.value as LeadStatus | 'all')}
            className={`${inputClass} flex-1 sm:flex-none sm:w-48`}
          >
            <option value="all" className="bg-[#05030a]">All Statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-[#05030a]">
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowNew(!showNew)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 font-semibold text-black hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <UserPlus size={16} />
            New Lead
          </button>
        </div>
      </div>

      {showNew && (
        <Card className="p-6 mb-8">
          <h2 className="text-lg font-bold mb-4">New Lead</h2>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company *" className={inputClass} />
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" className={inputClass} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inputClass} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={inputClass} />
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source (referral, cold outreach, inbound...)" className={`${inputClass} md:col-span-2`} />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !company.trim()}
            className="rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {creating ? 'Creating...' : 'Create Lead'}
          </button>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
        </div>
      ) : leads.length === 0 ? (
        <Card className="p-12 text-center text-white/40">
          No leads yet.
        </Card>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {leads.map((lead) => (
              <button
                key={lead.id}
                onClick={() => router.push(`/admin/leads/${lead.id}`)}
                className="w-full text-left rounded-xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl p-4 hover:border-white/20 transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <p className="font-semibold flex items-center gap-1.5">
                    {lead.hotLead && <Flame size={13} className="text-amber-400" />}
                    {lead.company}
                  </p>
                  <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${STATUS_COLORS[lead.status]}`}>
                    {LEAD_STATUS_LABELS[lead.status]}
                  </span>
                </div>
                <p className="text-sm text-white/50 mb-2">{lead.contactName || lead.email || '—'}</p>
                <div className="flex justify-between text-xs text-white/40">
                  <span>{lead.estimatedValue ? formatCents(lead.estimatedValue) : '—'}</span>
                  <span>{lead.assignedTo?.name || 'Unassigned'}</span>
                </div>
              </button>
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
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => router.push(`/admin/leads/${lead.id}`)}
                      className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4 font-medium">
                        <span className="flex items-center gap-1.5">
                          {lead.hotLead && <Flame size={13} className="text-amber-400" />}
                          {lead.company}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-white/50">{lead.contactName || lead.email || '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[lead.status]}`}>
                          {LEAD_STATUS_LABELS[lead.status]}
                        </span>
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
