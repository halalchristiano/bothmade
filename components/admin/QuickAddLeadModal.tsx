'use client';

import { useState } from 'react';
import { useDialogA11y } from '@/components/admin/Modal';
import { X } from 'lucide-react';
import { QUICK_ADD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads';

/**
 * Adding a company isn't always "brand new lead" — Evan is often backfilling
 * calls he already made, so this lets him set the starting status right at
 * creation instead of always landing in "New" and needing a second edit.
 * The Bulk tab exists for working through a list of prospects at once rather
 * than one form submission per company.
 */
export function QuickAddLeadModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (leadId?: string) => void;
}) {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');

  // Single
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState<LeadStatus>('new');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Bulk
  const [bulkText, setBulkText] = useState('');
  const [bulkStatus, setBulkStatus] = useState<LeadStatus>('new');
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkResult, setBulkResult] = useState('');

  const inputClass =
    'w-full px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-transparent transition-all';

  const handleCreate = async () => {
    if (!company.trim()) return;
    setCreating(true);
    setError('');
    try {
      const response = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, contactName, email, phone, source, status }),
      });
      const data = await response.json();
      if (data.success) {
        onCreated(data.lead.id);
      } else {
        setError(data.error || 'Failed to create lead');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleBulkCreate = async () => {
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setBulkCreating(true);
    setBulkResult('');
    try {
      const response = await fetch('/api/admin/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines, status: bulkStatus }),
      });
      const data = await response.json();
      if (data.success) {
        setBulkResult(`Added ${data.count} companies.`);
        setBulkText('');
        onCreated();
      } else {
        setBulkResult(data.error || 'Failed to bulk-add');
      }
    } finally {
      setBulkCreating(false);
    }
  };

  // Escape, focus trap, focus return, and scroll lock — the dialog
  // contracts this modal's hand-rolled backdrop never had.
  const { dialogProps } = useDialogA11y(onClose);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        {...dialogProps}
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0a0812] p-6 shadow-2xl max-h-[85vh] overflow-y-auto focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-lg font-bold">Add Companies</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1 p-1 rounded-xl border border-white/10 bg-white/[0.03] mb-5 w-fit">
          <button
            onClick={() => setMode('single')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === 'single' ? 'bg-gradient-to-r from-sky-400 to-purple-500 text-black' : 'text-white/50'
            }`}
          >
            Single
          </button>
          <button
            onClick={() => setMode('bulk')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === 'bulk' ? 'bg-gradient-to-r from-sky-400 to-purple-500 text-black' : 'text-white/50'
            }`}
          >
            Bulk Add
          </button>
        </div>

        {mode === 'single' ? (
          <div className="space-y-3">
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company *" className={inputClass} autoFocus />
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" className={inputClass} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inputClass} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={inputClass} />
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source (referral, cold outreach, inbound...)" className={inputClass} />

            <div>
              <label className="block text-xs text-white/40 mb-1.5">Starting status</label>
              <p className="text-xs text-white/30 mb-2">Already talked to them? Set the real status instead of starting at "New."</p>
              <div className="grid grid-cols-3 gap-1.5">
                {QUICK_ADD_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      status === s ? 'border-sky-400/50 bg-sky-400/10 text-white' : 'border-white/10 text-white/50 hover:border-white/25'
                    }`}
                  >
                    {LEAD_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              onClick={handleCreate}
              disabled={creating || !company.trim()}
              className="w-full rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {creating ? 'Adding...' : 'Add Company'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-white/40">
              Paste one company per line. Optionally add an email after a comma — <code className="text-white/60">Acme Inc, jane@acme.com</code>.
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={8}
              placeholder={'Acme Inc\nBeta Studio, hello@beta.co\nGamma LLC'}
              className={`${inputClass} resize-none font-mono text-sm`}
              autoFocus
            />
            <div>
              <label className="block text-xs text-white/40 mb-1.5">All of these start as</label>
              <div className="grid grid-cols-3 gap-1.5">
                {QUICK_ADD_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setBulkStatus(s)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      bulkStatus === s ? 'border-sky-400/50 bg-sky-400/10 text-white' : 'border-white/10 text-white/50 hover:border-white/25'
                    }`}
                  >
                    {LEAD_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {bulkResult && <p className="text-sm text-emerald-300">{bulkResult}</p>}

            <button
              onClick={handleBulkCreate}
              disabled={bulkCreating || !bulkText.trim()}
              className="w-full rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {bulkCreating ? 'Adding...' : 'Add All'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
