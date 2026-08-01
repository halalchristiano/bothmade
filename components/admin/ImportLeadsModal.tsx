'use client';

import { useRef, useState } from 'react';
import { X, Upload, CheckCircle2, Loader2 } from 'lucide-react';
import { parseCsvWithHeaders } from '@/lib/csv';

const COLUMNS: Array<{ header: string; required: boolean; description: string; example: string }> = [
  { header: 'company', required: true, description: 'Business name', example: 'Linpotia Cafe' },
  { header: 'contactName', required: false, description: 'Contact person', example: 'Frell Handa' },
  { header: 'email', required: false, description: 'Contact email', example: 'frell@linpotia.com' },
  { header: 'phone', required: false, description: 'Phone number', example: '6542853069' },
  { header: 'source', required: false, description: 'Where the lead came from', example: 'cold-outreach' },
  { header: 'estimatedValue', required: false, description: 'Deal size in dollars (no $ sign)', example: '5000' },
  {
    header: 'painPoints',
    required: false,
    description:
      'Semicolon-separated: no-website; outdated-design; not-mobile-friendly; slow-site; poor-seo; no-analytics; no-app; manual-processes; no-booking; no-ecommerce; weak-branding; security-concerns; scaling-issues; disconnected-tools',
    example: 'outdated-design;slow-site',
  },
  { header: 'notes', required: false, description: 'Freeform notes', example: 'Found via Google Maps' },
  { header: 'status', required: false, description: 'new, researched, contacted, replied, qualified (defaults to "new" if blank)', example: 'new' },
  {
    header: 'personalisedColdEmail',
    required: false,
    description: 'A full pre-written cold email — first line "Subject: ...", blank line, then the body. Lets it be sent in one click from the leads list.',
    example: 'Subject: Thoughts on Linpotia\\n\\nHi [First Name], ...',
  },
  { header: 'industry', required: false, description: "Folded into notes — there's no dedicated column yet", example: 'Dental practice' },
  { header: 'address', required: false, description: "Folded into notes — there's no dedicated column yet", example: '123 Main St' },
  { header: 'originalWebsite', required: false, description: "Folded into notes — there's no dedicated column yet", example: 'https://example.com' },
];

export function ImportLeadsModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<Array<Record<string, string>>>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ count: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleText = (text: string) => {
    setCsvText(text);
    setError(null);
    try {
      const rows = parseCsvWithHeaders(text);
      setPreview(rows);
    } catch {
      setPreview([]);
    }
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => handleText(String(reader.result || ''));
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (preview.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: preview }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Import failed');
        return;
      }
      setResult({ count: data.count, skipped: data.skipped });
      onImported();
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0812] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold">Import leads from CSV</h2>
            <p className="text-xs text-white/40 mt-0.5">Bulk-add companies from a spreadsheet export.</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="py-8 text-center">
            <CheckCircle2 size={28} className="text-emerald-400 mx-auto mb-3" />
            <p className="text-sm">
              Imported <strong>{result.count}</strong> lead{result.count === 1 ? '' : 's'}
              {result.skipped > 0 ? ` (skipped ${result.skipped} row${result.skipped === 1 ? '' : 's'} missing a company name)` : ''}.
            </p>
            <button
              onClick={onClose}
              className="mt-4 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-2 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-4">
              <p className="text-xs font-semibold text-white/70 mb-2">Expected columns (header row required)</p>
              <div className="space-y-1.5">
                {COLUMNS.map((col) => (
                  <p key={col.header} className="text-xs text-white/40">
                    <code className="text-sky-300">{col.header}</code>
                    {col.required && <span className="text-red-400"> *</span>} — {col.description}
                    <span className="text-white/25"> (e.g. "{col.example}")</span>
                  </p>
                ))}
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-4 text-sm text-white/60 hover:border-sky-400/50 hover:text-white transition-colors mb-3"
            >
              <Upload size={15} /> Upload a .csv file
            </button>

            <p className="text-xs text-white/30 mb-1.5">...or paste CSV text directly:</p>
            <textarea
              value={csvText}
              onChange={(e) => handleText(e.target.value)}
              placeholder="company,contactName,email,phone,source,estimatedValue,painPoints,notes,status"
              rows={5}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs font-mono placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-sky-400/50 mb-3"
            />

            {preview.length > 0 && (
              <p className="text-xs text-emerald-300 mb-3">
                {preview.length} row{preview.length === 1 ? '' : 's'} ready to import
                {preview[0]?.company ? ` — first: ${preview[0].company}` : ''}.
              </p>
            )}

            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || preview.length === 0}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 text-sm font-semibold text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                {importing ? 'Importing...' : `Import ${preview.length || ''} lead${preview.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
