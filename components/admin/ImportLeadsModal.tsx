'use client';

import { useRef, useState } from 'react';
import { Upload, CheckCircle2, Loader2, Download, AlertTriangle } from 'lucide-react';
import { parseCsvWithHeaders } from '@/lib/csv';
import { Modal } from './Modal';

interface Column {
  header: string;
  required?: boolean;
  description: string;
  example: string;
  /** Left out of the downloadable template — it stands for a family of columns. */
  template?: string[];
}

// Grouped rather than one flat list: there are enough columns now that a
// single run-on block is unreadable, and whoever builds a sheet fills it in
// group by group anyway — who they are, then what we found, then what we're
// selling them.
const COLUMN_GROUPS: Array<{ title: string; blurb?: string; columns: Column[] }> = [
  {
    title: 'The business',
    columns: [
      { header: 'company', required: true, description: 'Business name', example: 'Linpotia Cafe' },
      { header: 'contactName', description: 'Contact person', example: 'Frell Handa' },
      { header: 'contactRole', description: 'Their job title — the fastest read on whether they can sign', example: 'Owner' },
      { header: 'email', description: 'Contact email', example: 'frell@linpotia.com' },
      { header: 'phone', description: 'Phone number', example: '6542853069' },
      { header: 'altPhone', description: 'Second number, if there is one', example: '6542853070' },
      { header: 'industry', description: 'Its own column now — you can filter on it', example: 'Dental practice' },
      { header: 'address', description: 'Street address', example: '123 Main St' },
      { header: 'city', description: 'City / town', example: 'Austin' },
      { header: 'state', description: 'State, county or province', example: 'TX' },
      { header: 'postcode', description: 'Postal / ZIP code', example: '78701' },
      { header: 'country', description: 'Country', example: 'USA' },
      { header: 'timezone', description: 'Only needed to override the guess made from their area code', example: 'America/Chicago' },
    ],
  },
  {
    title: 'How big they are',
    blurb:
      'Used to size the quote. Any line item with no price in our catalogue gets a suggested one scaled from these, so the more you fill in, the better that suggestion is.',
    columns: [
      { header: 'companySize', description: 'solo, small, medium, large or enterprise', example: 'small' },
      { header: 'employeeCount', description: 'Headcount', example: '8' },
      { header: 'locationCount', description: 'Number of sites / branches', example: '2' },
      { header: 'annualRevenue', description: 'Annual revenue in dollars', example: '1200000' },
      { header: 'yearFounded', description: 'Year established', example: '2011' },
    ],
  },
  {
    title: 'Public presence',
    blurb: 'Raw material for a personalised opening line.',
    columns: [
      { header: 'originalWebsite', description: 'Their existing site — a one-click link on the lead page', example: 'https://example.com' },
      { header: 'currentWebsite', description: 'A written verdict on the site they have today (put a URL here instead and it lands in originalWebsite)', example: 'Template site, no booking, last updated 2019.' },
      { header: 'googleRating', description: 'Google star rating', example: '4.8' },
      { header: 'googleReviewCount', description: 'Number of Google reviews', example: '212' },
      { header: 'googleMapsURL', description: 'Link to their Maps listing', example: 'https://maps.app.goo.gl/xyz' },
      { header: 'instagram', description: 'Instagram profile', example: 'https://instagram.com/linpotia' },
      { header: 'facebook', description: 'Facebook page', example: 'https://facebook.com/linpotia' },
      { header: 'linkedin', description: 'LinkedIn company page', example: 'https://linkedin.com/company/linpotia' },
    ],
  },
  {
    title: 'Outreach',
    columns: [
      { header: 'source', description: 'Where the lead came from', example: 'cold-outreach' },
      { header: 'status', description: 'new, researched, contacted, replied, qualified (defaults to "new" if blank)', example: 'new' },
      {
        header: 'personalisedColdEmail',
        description: 'A full pre-written cold email — first line "Subject: ...", blank line, then the body. Lets it be sent in one click from the leads list.',
        example: 'Subject: Thoughts on Linpotia\\n\\nHi [First Name], ...',
      },
      {
        header: 'personalizedObservation',
        description: 'A short one-liner (not the full email) — pre-fills the "personalized observation" field in the cold-outreach template',
        example: 'Your Google reviews are exceptional, but barely visible on the homepage.',
      },
      {
        header: 'salesNote',
        description: 'A short strategic note for whoever works this lead — separate from general notes',
        example: 'Lead with the booking system — they mentioned losing appointments to no-shows.',
      },
      { header: 'notes', description: 'Freeform notes', example: 'Found via Google Maps' },
      { header: 'tags', description: 'Semicolon-separated labels you can filter on later', example: 'franchise;q3-push' },
      { header: 'doNotContact', description: 'yes/no — a hard stop. Nothing emails or dials a lead marked yes.', example: 'no' },
      { header: 'doNotContactReason', description: 'Why, if yes', example: 'Asked to be removed 12/07/2026' },
      { header: 'leadScore', description: '0-100 research score. Sorting hint only — it never hides anything.', example: '78' },
    ],
  },
  {
    title: 'Deliverables',
    blurb: 'Each of these becomes a button on the lead page.',
    columns: [
      { header: 'mockupURL', description: 'Link to the live mockup — also pre-fills the mockup link in the email composer', example: 'https://evolve-med-spa.bothmade.studio' },
      { header: 'mockupPdfURL', description: 'The mockup as a PDF, to download and keep — works with no signal and outlives the deployment', example: 'https://blob.../linpotia-mockup.pdf' },
      { header: 'vercelPassword', description: 'Password on the protected preview deployment, so it can be opened on a call without hunting for it', example: 'linpotia-2026' },
      { header: 'invoicePdfURL', description: 'Normally left blank — it fills in when the client is onboarded', example: '' },
    ],
  },
  {
    title: 'The brief',
    blurb:
      'One point per column, written "Point: explanation about this business". Numbering is open-ended — use as many columns as the business needs. Add "| $900" on the end of any cell (or a matching "… price" column) to fix that item\'s price; anything without one is priced from our catalogue, and anything we don\'t sell yet is priced as a suggestion and flagged custom for you to approve.',
    columns: [
      {
        header: 'Pain point 1, 2, 3 …',
        description: 'What is wrong today. No limit — list every one of them. Shown at the top of the rep\'s brief, ahead of anything we guess automatically.',
        example: 'No online booking: they take every appointment by phone and lose the after-hours ones.',
        template: ['Pain point 1', 'Pain point 2', 'Pain point 3', 'Pain point 4', 'Pain point 5'],
      },
      {
        header: 'Essential point 1, 2, 3 …',
        description: 'What they definitely need. Becomes the green "must have" list.',
        example: 'Booking system: lets customers book at 9pm without anyone answering the phone. | $900',
        template: ['Essential point 1', 'Essential point 2', 'Essential point 3', 'Essential point 4', 'Essential point 5'],
      },
      {
        header: 'Upsell point 1, 2, 3 …',
        description: 'What they could be upsold on. Becomes the amber "extras" list, raised only once the core is agreed.',
        example: 'Email marketing: they have 4,000 past customers and never email them. | $1,200',
        template: ['Upsell point 1', 'Upsell point 2', 'Upsell point 3'],
      },
      {
        header: 'Essential point 1 price',
        description: 'Optional price column matching any numbered point, if you would rather not write it inline',
        example: '$900',
        template: ['Essential point 1 price', 'Essential point 2 price', 'Essential point 3 price'],
      },
    ],
  },
  {
    title: 'Money',
    columns: [
      { header: 'estimatedValue', description: 'Deal size in dollars (no $ sign needed)', example: '5000' },
      { header: 'lowestEstimate', description: 'Bottom of the quotable range — the figure the rep says out loud', example: '$8,000' },
      { header: 'highestEstimate', description: 'Top of the quotable range', example: '$21,000' },
      { header: 'range', description: 'Only if you did not give the two columns above — one cell holding both ends', example: '$8,000 - $21,000' },
      {
        header: 'painPoints',
        description:
          'The tag checklist, semicolon-separated: no-website; outdated-design; not-mobile-friendly; slow-site; poor-seo; no-analytics; no-app; manual-processes; no-booking; no-ecommerce; weak-branding; security-concerns; scaling-issues; disconnected-tools',
        example: 'outdated-design;slow-site',
      },
    ],
  },
  {
    title: 'Dates and ownership',
    blurb: 'Dates are DDMMYYYY. Slashes and dashes are fine, and so is an ISO date if your spreadsheet insists on rewriting the column.',
    columns: [
      { header: 'dateAdded', description: 'When this business entered the pipeline. Defaults to today. This is what date-range reporting counts.', example: '03082026' },
      { header: 'timeAdded', description: 'Time of day for the above, if it matters', example: '14:30' },
      { header: 'clientTakenOn', description: 'The day they became a client. Normally left blank — it fills in when the deal is won.', example: '19082026' },
      { header: 'nextFollowUp', description: 'When to chase them next', example: '10082026' },
      { header: 'assignedTo', description: "A team member's email. Defaults to whoever runs the import.", example: 'evan@bothmade.studio' },
    ],
  },
];

/** Every literal column name, in order, for the downloadable blank template. */
const TEMPLATE_HEADERS = COLUMN_GROUPS.flatMap((g) =>
  g.columns.flatMap((c) => c.template ?? [c.header])
);

export function ImportLeadsModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<Array<Record<string, string>>>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    count: number;
    skipped: number;
    duplicates: number;
    customPoints: Array<{ company: string; point: string; priceCents: number }>;
    customPointCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A blank sheet with every column already headed, so nobody has to
  // transcribe the list below by hand and misspell one of them.
  const downloadTemplate = () => {
    const csv = `${TEMPLATE_HEADERS.map((h) => (h.includes(',') ? `"${h}"` : h)).join(',')}\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bothmade-leads-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

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
    setFileName(file.name);
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
        body: JSON.stringify({ rows: preview, fileName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Import failed');
        return;
      }
      setResult({
        count: data.count,
        skipped: data.skipped,
        duplicates: data.duplicates ?? 0,
        customPoints: data.customPoints ?? [],
        customPointCount: data.customPointCount ?? 0,
      });
      onImported();
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      title="Import leads from CSV"
      subtitle="Bulk-add companies from a spreadsheet export."
      onClose={onClose}
      size="max-w-2xl"
      panelClassName="max-h-[88vh] overflow-y-auto"
      // A pasted CSV and a mapped preview is real work to redo.
      closeOnBackdrop={false}
    >
      <>
        {result ? (
          <div className="py-8 text-center">
            <CheckCircle2 size={28} className="text-emerald-400 mx-auto mb-3" />
            <p className="text-sm">
              Imported <strong>{result.count}</strong> lead{result.count === 1 ? '' : 's'}
              {result.skipped > 0 ? ` (skipped ${result.skipped} row${result.skipped === 1 ? '' : 's'} missing a company name)` : ''}.
            </p>
            {result.duplicates > 0 && (
              <p className="text-xs text-amber-300/80 mt-2 leading-relaxed">
                {result.duplicates} {result.duplicates === 1 ? 'business was' : 'businesses were'} already in your
                leads and {result.duplicates === 1 ? 'was' : 'were'} left alone — so nobody gets called twice.
              </p>
            )}

            {/* The prices nobody has agreed to yet. Shown here, at the one
                moment everybody is looking, rather than left to be discovered
                one lead at a time halfway through a call. */}
            {result.customPointCount > 0 && (
              <div className="mt-4 text-left rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3.5">
                <p className="text-xs font-semibold text-amber-200 flex items-center gap-1.5">
                  <AlertTriangle size={13} />
                  {result.customPointCount} line item{result.customPointCount === 1 ? '' : 's'} we don't have a
                  price for
                </p>
                <p className="text-[11px] text-amber-100/60 mt-1 leading-relaxed">
                  Each has been given a suggested figure based on the size of the business and marked{' '}
                  <strong>custom</strong> on the lead. Check them before they go on a PDF or into a quote.
                </p>
                <ul className="mt-2.5 space-y-1">
                  {result.customPoints.slice(0, 12).map((c, i) => (
                    <li key={i} className="text-[11px] text-white/50 flex justify-between gap-3">
                      <span className="truncate">
                        <span className="text-white/70">{c.company}</span> — {c.point}
                      </span>
                      <span className="text-amber-200 shrink-0">
                        ${Math.round(c.priceCents / 100).toLocaleString('en-US')}
                      </span>
                    </li>
                  ))}
                </ul>
                {result.customPoints.length > 12 && (
                  <p className="text-[11px] text-white/30 mt-1.5">
                    …and {result.customPoints.length - 12} more, on their lead pages.
                  </p>
                )}
              </div>
            )}
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
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-xs font-semibold text-white/70">Columns (header row required)</p>
                  <p className="text-[11px] text-white/35 mt-0.5">
                    Only <code className="text-sky-300">company</code> is required — leave out anything you don't
                    have. Header wording is matched loosely, so "Business name" and "Public email" land correctly.
                  </p>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="shrink-0 flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <Download size={12} /> Blank template
                </button>
              </div>

              <div className="space-y-3.5">
                {COLUMN_GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
                      {group.title}
                    </p>
                    {group.blurb && (
                      <p className="text-[11px] text-white/35 mt-0.5 mb-1.5 leading-relaxed">{group.blurb}</p>
                    )}
                    <div className="space-y-1 mt-1">
                      {group.columns.map((col) => (
                        <p key={col.header} className="text-xs text-white/40">
                          <code className="text-sky-300">{col.header}</code>
                          {col.required && <span className="text-red-400"> *</span>} — {col.description}
                          {col.example && <span className="text-white/25"> (e.g. "{col.example}")</span>}
                        </p>
                      ))}
                    </div>
                  </div>
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
              onChange={(e) => {
                setFileName(null);
                handleText(e.target.value);
              }}
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
      </>
    </Modal>
  );
}
