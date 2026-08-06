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
      {
        header: 'companySize',
        description: 'solo (just them), small (2-10), medium (11-50), large (51-250) or enterprise (250+)',
        example: 'small',
      },
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
      {
        header: 'siteVerdict',
        description:
          'Your written verdict on the site they have today — sentences, not a link. The link goes in originalWebsite above.',
        example: 'Template site, no booking, last updated 2019.',
      },
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
        header: 'mockupEmail',
        description:
          'The second email, written now: what goes out with the mockup once they reply. Same shape ("Subject: ...", blank line, body) and it should read as the next thing the same person says. Without it the mockup goes out under the standard wording.',
        example: 'Subject: Here it is\\n\\nHere it is. [First Name] — the filter is down the left ...',
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
      {
        header: 'painPointTags',
        description:
          'A different thing from the written "Pain point" columns above — this is the fixed checklist, semicolon-separated, used for filtering and for the automatic guesses. Pick from: no-website; outdated-design; not-mobile-friendly; slow-site; poor-seo; no-analytics; no-app; manual-processes; no-booking; no-ecommerce; weak-branding; security-concerns; scaling-issues; disconnected-tools',
        example: 'outdated-design;slow-site',
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

/**
 * The columns that actually make the product work.
 *
 * Everything below reads as equally important, and it isn't: a sheet with
 * these five filled in properly produces a usable call brief and a quotable
 * range, and a sheet with forty columns but a vague observation produces an
 * email nobody answers. Named up front so a researcher knows where the
 * effort belongs.
 */
const START_HERE: Array<{ header: string; why: string }> = [
  { header: 'company', why: 'the only column that is actually required' },
  { header: 'email', why: 'no address, no outreach — the lead can only be called' },
  { header: 'personalizedObservation', why: 'the one line the whole cold email hangs on' },
  { header: 'Pain point 1, 2, 3 …', why: 'what is wrong today — the top of the rep’s brief' },
  { header: 'Essential point 1, 2, 3 …', why: 'what they need, and what the quote is built from' },
];

/**
 * How to write the four fields where the wording decides whether it works.
 *
 * Shown rather than described: the difference between a good observation and
 * a bad one is not a rule anyone can follow from a definition, but it is
 * obvious the moment you see the pair side by side.
 */
const WRITING_GUIDE: Array<{
  header: string;
  shape: string;
  good: string;
  bad: string;
  why: string;
}> = [
  {
    header: 'personalizedObservation',
    shape: 'One sentence. Something you could only say about this business.',
    good: 'Your Google reviews are exceptional, but they are barely visible on the homepage.',
    bad: 'Your website could be improved and is not very modern.',
    why: 'The second one could be sent to anybody, and reads like it was.',
  },
  {
    header: 'personalisedColdEmail',
    shape: 'First line "Subject: …", a blank line, then three short paragraphs. Use [First Name] and it fills in.',
    good: 'Subject: Thoughts on Linpotia\n\nHi [First Name], I came across Linpotia while …',
    bad: 'Hi there, I hope this email finds you well. We are a web design agency …',
    why: 'No subject line means it cannot be sent in one click, and a generic opener gets deleted.',
  },
  {
    header: 'mockupEmail',
    shape: 'The reply to their reply. Show the thing, say plainly what it is and is not, then ask one real question.',
    good: 'Subject: Here it is\n\nFilter down the left, results update live — that is the bit that cannot happen today. It is a static design, so nothing clicks; I would rather show you the idea honestly than fake a demo.',
    bad: 'Hi, please find attached the mockup we have prepared for your review. Let us know your thoughts!',
    why: 'The cold email was written for them. Following it with a template is a change of voice they can hear.',
  },
  {
    header: 'Pain point 1, 2, 3 …',
    shape: '"Thing: what it costs them." A colon, then the consequence in plain words.',
    good: 'No online booking: they take every appointment by phone and lose the after-hours ones.',
    bad: 'Bad booking',
    why: 'The part after the colon is what the rep says out loud. Without it there is nothing to say.',
  },
  {
    header: 'Essential point 1, 2, 3 …',
    shape: 'Same shape, plus " | $900" on the end if you already know the price.',
    good: 'Booking system: lets customers book at 9pm without anyone answering the phone. | $900',
    bad: 'Booking system',
    why: 'Anything with no price is priced from our catalogue, or flagged for you to approve.',
  },
];

/**
 * One filled row, built from the same examples shown in the reference below,
 * so the two can never disagree.
 *
 * This is the part people actually use. Nobody reads a column reference and
 * then writes a correct sheet; they open an example, see the shape, and edit
 * it. The blank template gets the headers right — this gets the *content*
 * right, which is where sheets go wrong.
 */
const EXAMPLE_ROW: Record<string, string> = Object.fromEntries(
  COLUMN_GROUPS.flatMap((g) =>
    g.columns.flatMap((c) =>
      // A family of columns ("Pain point 1, 2, 3 …") fills only its first
      // member — a row with five identical pain points teaches the wrong
      // lesson.
      (c.template ?? [c.header]).map((header, i) => [header, i === 0 ? c.example : ''])
    )
  )
);

function toCsv(headers: string[], rows: Array<Record<string, string>>): string {
  const cell = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return [
    headers.map(cell).join(','),
    ...rows.map((row) => headers.map((h) => cell(row[h] ?? '')).join(',')),
  ].join('\n');
}

function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

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
  const downloadTemplate = () =>
    downloadCsv('bothmade-leads-template.csv', `${toCsv(TEMPLATE_HEADERS, [])}\n`);

  /**
   * The columns a scrape actually comes with.
   *
   * A thousand-row export off a scraping tool has none of the written work in
   * it — no observation, no pain points, no cold email — and asking someone
   * to map it onto forty columns is how a good list sits in a downloads
   * folder for a month. These eleven are what a scrape has and what the email
   * writer needs, in the order it wants them.
   */
  const downloadScraperTemplate = () =>
    downloadCsv(
      'bothmade-scrape-template.csv',
      `${toCsv(
        [
          'company',
          'email',
          'phone',
          'website',
          'industry',
          'city',
          'state',
          'googleRating',
          'googleReviewCount',
          'estimatedValue',
          'siteVerdict',
        ],
        []
      )}\n`
    );

  // The same sheet with one business filled in properly — open it, see the
  // shape, replace the contents.
  const downloadExample = () =>
    downloadCsv('bothmade-leads-example.csv', toCsv(TEMPLATE_HEADERS, [EXAMPLE_ROW]));

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
            {/* Start here — the shortest path to a sheet that works */}
            <div className="rounded-xl border border-sky-400/25 bg-sky-400/[0.05] p-4 mb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">Start with the example</p>
                  <p className="text-[11px] leading-relaxed text-white/45 mt-0.5">
                    One business filled in properly, in every column. Open it, see the shape, replace the
                    contents. Quicker than reading the reference below, and harder to get wrong.
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={downloadExample}
                    className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-white/15 transition-colors"
                  >
                    <Download size={12} /> Filled example
                  </button>
                  <button
                    onClick={downloadScraperTemplate}
                    className="flex items-center gap-1.5 rounded-lg border border-purple-400/25 bg-purple-400/[0.08] px-2.5 py-1.5 text-[11px] font-medium text-purple-200 hover:bg-purple-400/15 transition-colors"
                  >
                    <Download size={12} /> Scrape columns
                  </button>
                  <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    <Download size={12} /> Blank
                  </button>
                </div>
              </div>

              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
                  Bringing a scrape in
                </p>
                <p className="mt-1.5 text-xs text-white/45 leading-relaxed">
                  Up to a thousand rows a file. A scrape has none of the written work in it, and it does
                  not need to: import it, select the new leads on the list, and press{' '}
                  <span className="text-purple-200">Write emails</span> — each one gets a cold email and
                  a mockup email built from whatever the scrape did carry. The more of{' '}
                  <code className="text-sky-300">industry</code>,{' '}
                  <code className="text-sky-300">googleReviewCount</code> and{' '}
                  <code className="text-sky-300">siteVerdict</code> you bring, the less generic those
                  emails are.
                </p>
              </div>

              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
                  If you fill in nothing else, fill in these
                </p>
                <div className="mt-1.5 space-y-1">
                  {START_HERE.map((c) => (
                    <p key={c.header} className="text-xs text-white/40">
                      <code className="text-sky-300">{c.header}</code> — {c.why}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            {/* The four fields where the wording is the whole job */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-3">
              <p className="text-xs font-semibold text-white/70">How to word the ones that matter</p>
              <p className="text-[11px] text-white/35 mt-0.5">
                Everything else is a fact you either have or don't. These four are written, and the wording is
                what decides whether they work.
              </p>
              <div className="mt-3 space-y-3">
                {WRITING_GUIDE.map((g) => (
                  <div key={g.header} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                    <p className="text-xs">
                      <code className="text-sky-300">{g.header}</code>
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/45">{g.shape}</p>
                    <div className="mt-2 space-y-1.5">
                      <p className="flex gap-2 text-[11px] leading-relaxed">
                        <span className="shrink-0 text-emerald-400" aria-hidden="true">
                          ✓
                        </span>
                        <span className="whitespace-pre-line text-white/70">{g.good}</span>
                      </p>
                      <p className="flex gap-2 text-[11px] leading-relaxed">
                        <span className="shrink-0 text-red-400" aria-hidden="true">
                          ✕
                        </span>
                        <span className="whitespace-pre-line text-white/35 line-through decoration-white/20">
                          {g.bad}
                        </span>
                      </p>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-white/30">{g.why}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-4">
              <div className="mb-3">
                <p className="text-xs font-semibold text-white/70">Every column</p>
                <p className="text-[11px] text-white/35 mt-0.5">
                  Only <code className="text-sky-300">company</code> is required — leave out anything you don't
                  have. Header wording is matched loosely, so "Business name" and "Public email" land correctly.
                </p>
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
