'use client';

import { useId, useState } from 'react';
import { QUICK_ADD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads';
import { Modal } from './Modal';
import { PhoneField } from '@/components/PhoneField';

/**
 * Adding a company isn't always "brand new lead" — Evan is often backfilling
 * calls he already made, so this lets him set the starting status right at
 * creation instead of always landing in "New" and needing a second edit.
 * The Bulk tab exists for working through a list of prospects at once rather
 * than one form submission per company.
 */
/**
 * A labelled field. The label is visible rather than only announced, because
 * "which box is this" is a question a sighted person asks too — as soon as
 * the placeholder is gone.
 */
function Field({
  id,
  label,
  hint,
  required = false,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-white/40 mb-1.5">
        {label}
        {required && (
          <span className="text-white/25"> (required)</span>
        )}
      </label>
      {hint && <p className="text-xs text-white/25 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

export function QuickAddLeadModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (leadId?: string) => void;
}) {
  // Namespaced so two of these on one page can't collide on `htmlFor`.
  const formId = useId();
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

  return (
    <Modal
      title="Add Companies"
      onClose={onClose}
      size="max-w-lg"
      panelClassName="max-h-[85vh] overflow-y-auto"
      // Typed-in company details shouldn't vanish on a stray backdrop click.
      closeOnBackdrop={false}
    >
      <>
        <div className="flex gap-1 p-1 rounded-xl border border-white/10 bg-white/[0.03] mb-5 w-fit">
          <button
            onClick={() => setMode('single')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === 'single' ? 'bg-white text-ink' : 'text-white/50'
            }`}
          >
            Single
          </button>
          <button
            onClick={() => setMode('bulk')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === 'bulk' ? 'bg-white text-ink' : 'text-white/50'
            }`}
          >
            Bulk Add
          </button>
        </div>

        {mode === 'single' ? (
          <div className="space-y-3">
            {/*
              Labelled, not just hinted.

              These five carried their names in `placeholder` alone, which is
              the one place a name cannot stay: it is gone the moment there is
              a character in the box. Fill four fields, glance back to check
              the third, and there is nothing to read but the value — which is
              precisely when you want to know whether that box was Email or
              Source. It is also not a label to a screen reader, so the form
              announced five unnamed text boxes.

              The status group below has had a real <label> since it was
              written; this is the same treatment for the rest of the form.
            */}
            <Field id={`${formId}-company`} label="Company" required>
              <input
                id={`${formId}-company`}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Roofing"
                className={inputClass}
                autoFocus
              />
            </Field>
            <Field id={`${formId}-contact`} label="Contact name">
              <input
                id={`${formId}-contact`}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Jane Okafor"
                className={inputClass}
              />
            </Field>
            <Field id={`${formId}-email`} label="Email">
              <input
                id={`${formId}-email`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@acme.test"
                className={inputClass}
              />
            </Field>
            <Field id={`${formId}-phone`} label="Phone">
              <PhoneField id={`${formId}-phone`} value={phone} onChange={setPhone} className={inputClass} />
            </Field>
            <Field id={`${formId}-source`} label="Source" hint="Referral, cold outreach, inbound…">
              <input
                id={`${formId}-source`}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Referral"
                className={inputClass}
              />
            </Field>

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
              className="w-full rounded-xl bg-white py-2.5 font-semibold text-ink disabled:opacity-50 hover:opacity-90 transition-opacity"
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
              id={`${formId}-bulk`}
              aria-label="Companies to add, one per line"
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
              className="w-full rounded-xl bg-white py-2.5 font-semibold text-ink disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {bulkCreating ? 'Adding...' : 'Add All'}
            </button>
          </div>
        )}
      </>
    </Modal>
  );
}
