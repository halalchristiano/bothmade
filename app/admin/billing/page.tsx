'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Receipt, Plus, X } from 'lucide-react';
import { Badge, BrandButton, Card, CardHeader, EmptyState, Kicker, PageIn, PageTitle, inputClass } from '@/components/admin/ui';
import { MAX_CHARGE_CENTS, MIN_CHARGE_CENTS, dollarsToCents } from '@/lib/billing';
import { formatCentsExact } from '@/lib/pricing';

/**
 * Charge a customer an amount that never came out of the catalogue.
 *
 * Everything else in the admin prices itself: the proposal builder adds up
 * services, the deposit is a percentage, the balance is the remainder. This
 * page is the one place a person types a number — a change request, an extra
 * round of design, a month of retainer — and the paperwork is raised around
 * it on the spot.
 */

interface CustomerProject {
  id: string;
  name: string;
  status: string;
  totalPrice: number;
}

interface Customer {
  id: string;
  company: string;
  contactName: string | null;
  email: string;
  projects: CustomerProject[];
}

interface InvoiceRow {
  id: string;
  number: string;
  description: string;
  amountCents: number;
  status: string;
  pdfUrl: string | null;
  paymentUrl: string | null;
  sentToEmail: string | null;
  createdAt: string;
  client: { id: string; company: string; email: string };
  project: { id: string; name: string };
  issuedBy: { name: string | null; email: string } | null;
}

interface LineDraft {
  label: string;
  /** Dollars as typed, not cents — converted once, on submit. */
  amount: string;
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-sm text-white/40">Loading billing…</p>
        </div>
      }
    >
      <BillingWorkspace />
    </Suspense>
  );
}

function BillingWorkspace() {
  const searchParams = useSearchParams();
  const deepLinkedProjectId = searchParams.get('projectId');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [projectId, setProjectId] = useState('');

  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ label: '', amount: '' }]);
  const [sendToClient, setSendToClient] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [result, setResult] = useState<{ number: string; amountLabel: string; warnings: string[] } | null>(null);

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);

  const loadInvoices = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/billing/charges');
      const data = await response.json();
      if (response.ok) setInvoices(data.invoices || []);
    } catch {
      // The list is context, not the job — a failed load must not look like
      // a failed charge.
    }
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  // Arrived from a project's "New charge" link — the customer is already known.
  useEffect(() => {
    if (!deepLinkedProjectId) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/admin/billing/customers?projectId=${encodeURIComponent(deepLinkedProjectId)}`);
        const data = await response.json();
        if (cancelled || !response.ok) return;
        const found: Customer | undefined = data.customers?.[0];
        if (found) {
          setCustomer(found);
          setProjectId(deepLinkedProjectId);
        }
      } catch {
        // Fall back to searching by hand.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deepLinkedProjectId]);

  useEffect(() => {
    if (customer || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/billing/customers?q=${encodeURIComponent(query.trim())}`);
        const data = await response.json();
        if (!cancelled && response.ok) setResults(data.customers || []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, customer]);

  const pickCustomer = (picked: Customer) => {
    setCustomer(picked);
    setProjectId(picked.projects[0]?.id || '');
    setQuery('');
    setResults([]);
    setError('');
  };

  const clearCustomer = () => {
    setCustomer(null);
    setProjectId('');
    setResult(null);
    setNeedsConfirmation(false);
  };

  const updateLine = (index: number, patch: Partial<LineDraft>) => {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
    setNeedsConfirmation(false);
  };

  const parsedLines = lines.map((line) => ({ label: line.label.trim(), cents: dollarsToCents(line.amount) }));
  const total = parsedLines.reduce((sum, line) => sum + (line.cents ?? 0), 0);
  const everyLineValid = parsedLines.every((line) => line.label && line.cents !== null && line.cents > 0);
  const canSubmit =
    Boolean(projectId) &&
    description.trim().length > 0 &&
    everyLineValid &&
    total >= MIN_CHARGE_CENTS &&
    total <= MAX_CHARGE_CENTS &&
    !submitting;

  const submit = async (confirmDuplicate = false) => {
    setError('');
    setResult(null);
    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/billing/charges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          description: description.trim(),
          lineItems: parsedLines.map((line) => ({ label: line.label, priceCents: line.cents })),
          sendToClient,
          confirmDuplicate,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Couldn't raise the charge — try again in a moment.");
        setNeedsConfirmation(Boolean(data.needsConfirmation));
        return;
      }

      setResult({
        number: data.invoice.number,
        amountLabel: formatCentsExact(data.invoice.amountCents),
        warnings: data.warnings || [],
      });
      setNeedsConfirmation(false);
      setDescription('');
      setLines([{ label: '', amount: '' }]);
      loadInvoices();
    } catch {
      setError('Could not reach the server — check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageIn className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-8">
      <div className="mb-6">
        <Kicker className="mb-2">One-off charges</Kicker>
        <PageTitle icon={Receipt} title="Billing" tone="emerald" />
        <p className="text-sm text-white/40 mt-2">
          Charge an existing customer any amount. The invoice is raised, filed, emailed to them and copied to
          info@ the moment you send it.
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
        <Card className="p-6">
          <CardHeader icon={Plus} title="New custom charge" tone="emerald" />

          {/* Customer */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-white/50 mb-2 uppercase tracking-wide">Customer</label>
            {customer ? (
              <div className="rounded-lg border border-white/15 bg-white/5 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{customer.company}</p>
                    <p className="text-xs text-white/40 truncate">
                      {customer.contactName ? `${customer.contactName} · ` : ''}
                      {customer.email}
                    </p>
                  </div>
                  <button
                    onClick={clearCustomer}
                    className="text-white/40 hover:text-white transition-colors shrink-0"
                    aria-label="Choose a different customer"
                  >
                    <X size={16} />
                  </button>
                </div>
                {customer.projects.length > 1 ? (
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className={`${inputClass} mt-3`}
                  >
                    {customer.projects.map((project) => (
                      <option key={project.id} value={project.id} className="bg-raised">
                        {project.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-white/40 mt-2">{customer.projects[0]?.name}</p>
                )}
              </div>
            ) : (
              <>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by company, contact or email"
                  className={inputClass}
                />
                {query.trim().length >= 2 && (
                  <div className="mt-2 rounded-lg border border-white/10 divide-y divide-white/[0.06] overflow-hidden">
                    {searching && <p className="px-3 py-2 text-xs text-white/40">Searching…</p>}
                    {!searching && results.length === 0 && (
                      <p className="px-3 py-2 text-xs text-white/40">
                        No customer matches that. Only customers with a project can be billed here.
                      </p>
                    )}
                    {results.map((found) => (
                      <button
                        key={found.id}
                        onClick={() => pickCustomer(found)}
                        className="w-full text-left px-3 py-2 hover:bg-white/[0.04] transition-colors"
                      >
                        <p className="text-sm">{found.company}</p>
                        <p className="text-xs text-white/40">{found.email}</p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* What it's for */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-white/50 mb-2 uppercase tracking-wide">
              What it&apos;s for
            </label>
            <input
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setNeedsConfirmation(false);
              }}
              placeholder="e.g. Extra round of homepage design"
              maxLength={200}
              className={inputClass}
            />
            <p className="text-[11px] text-white/30 mt-1.5">
              This is the invoice heading and the email subject — write it the way the client would describe it.
            </p>
          </div>

          {/* Lines */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-white/50 mb-2 uppercase tracking-wide">Line items</label>
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    value={line.label}
                    onChange={(e) => updateLine(index, { label: e.target.value })}
                    placeholder="Description"
                    maxLength={200}
                    className={`${inputClass} flex-1`}
                  />
                  <div className="relative w-32 shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
                    <input
                      value={line.amount}
                      onChange={(e) => updateLine(index, { amount: e.target.value })}
                      inputMode="decimal"
                      placeholder="0.00"
                      className={`${inputClass} pl-7`}
                    />
                  </div>
                  {lines.length > 1 && (
                    <button
                      onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                      className="text-white/30 hover:text-white transition-colors px-1"
                      aria-label="Remove line"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setLines((current) => [...current, { label: '', amount: '' }])}
              className="text-xs text-sky-300 hover:text-sky-200 mt-2 transition-colors"
            >
              + Add line
            </button>
          </div>

          <div className="flex items-baseline justify-between border-t border-white/10 pt-4 mb-4">
            <span className="text-sm text-white/50">Total to charge</span>
            <span className="text-2xl font-semibold tabular-nums">{formatCentsExact(total)}</span>
          </div>

          <label className="flex items-start gap-2 text-sm text-white/60 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={sendToClient}
              onChange={(e) => setSendToClient(e.target.checked)}
              className="mt-1 accent-sky-400"
            />
            <span>
              Email the invoice and a pay link to the client
              <span className="block text-[11px] text-white/30">
                Off means it&apos;s raised for the record only — it still appears on both dashboards and goes to info@.
              </span>
            </span>
          </label>

          <BrandButton
            variant="primary"
            onClick={() => submit(needsConfirmation)}
            disabled={!canSubmit}
            className="w-full"
          >
            {submitting
              ? 'Raising the invoice…'
              : needsConfirmation
              ? `Yes — charge ${formatCentsExact(total)} again`
              : `Charge ${formatCentsExact(total)}`}
          </BrandButton>

          {error && <p className="text-red-400 text-xs mt-3">{error}</p>}

          {result && (
            <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3">
              <p className="text-sm text-emerald-200">
                {result.number} raised for {result.amountLabel}.
              </p>
              {result.warnings.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {result.warnings.map((warning, i) => (
                    <li key={i} className="text-xs text-amber-300">
                      {warning}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <CardHeader
            icon={Receipt}
            title="Invoices raised"
            subtitle="Every custom charge, newest first"
            tone="sky"
          />
          {invoices.length === 0 ? (
            <EmptyState icon={Receipt} text="No custom charges have been raised yet." />
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{invoice.description}</p>
                      <p className="text-xs text-white/40 truncate">
                        <Link href={`/admin/projects/${invoice.project.id}`} className="hover:text-white transition-colors">
                          {invoice.client.company}
                        </Link>
                        {' · '}
                        {invoice.number}
                        {' · '}
                        {new Date(invoice.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums">{formatCentsExact(invoice.amountCents)}</p>
                      <Badge tone={invoice.status === 'paid' ? 'emerald' : invoice.status === 'void' ? 'neutral' : 'amber'} solid>
                        {invoice.status === 'paid' ? 'Paid' : invoice.status === 'void' ? 'Void' : 'Open'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px]">
                    {invoice.pdfUrl && (
                      <a
                        href={invoice.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-300 hover:text-sky-200 transition-colors"
                      >
                        Invoice PDF
                      </a>
                    )}
                    {invoice.paymentUrl && (
                      <button
                        onClick={() => navigator.clipboard.writeText(invoice.paymentUrl as string)}
                        className="text-white/50 hover:text-white transition-colors"
                      >
                        Copy pay link
                      </button>
                    )}
                    <span className="text-white/30">
                      {invoice.sentToEmail ? `Sent to ${invoice.sentToEmail}` : 'Not emailed'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageIn>
  );
}
