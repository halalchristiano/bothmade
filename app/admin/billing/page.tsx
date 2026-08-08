'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Receipt, Plus, X } from 'lucide-react';
import { Badge, BrandButton, Card, CardHeader, EmptyState, Kicker, PageIn, PageTitle, inputClass } from '@/components/admin/ui';
import { MAX_CHARGE_CENTS, MIN_CHARGE_CENTS, describeChargeBlocker, dollarsToCents } from '@/lib/billing';
import { formatCentsExact } from '@/lib/pricing';
import { DISPLAY_STATE_LABELS, displayState } from '@/lib/invoice-lifecycle';
import {
  FILTER_STATUS,
  LEDGER_FILTER_LABELS,
  ageBand,
  chaseLine,
  daysOutstanding,
  issuedByLabel,
  matchesQuery,
  readInvoiceLines,
  stateTone,
  type LedgerFilter,
} from '@/lib/invoice-ledger';
import { CopyButton } from '@/components/admin/CopyButton';
import { InvoiceActions } from '@/components/admin/InvoiceActions';
import { RefundEstimate } from '@/components/admin/RefundEstimate';

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
  sendCount: number;
  lastSentAt: string | null;
  refundedCents: number;
  refundMethod: string | null;
  refundReason: string | null;
  voidReason: string | null;
  createdAt: string;
  /** [{ label, priceCents }] as stored — read through readInvoiceLines, never cast. */
  lineItems: unknown;
  client: { id: string; company: string; email: string };
  project: { id: string; name: string };
  issuedBy: { name: string | null; email: string } | null;
}

interface LineDraft {
  label: string;
  /** Dollars as typed, not cents — converted once, on submit. */
  amount: string;
}

/**
 * Computed over every invoice in the books, not over the hundred rows below.
 * See the GET handler for why: a total added up on screen starts under-
 * reporting the day the hundred-and-first invoice is raised, and looks
 * identical to a correct one while it does.
 */
interface LedgerTotals {
  outstandingCents: number;
  outstandingCount: number;
  paidCents: number;
  paidCount: number;
  /** Cash that actually left the account. */
  refundedCents: number;
  /** Value the client is owed with the money still here — never folded in above. */
  creditedCents: number;
  count: number;
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
  const [totals, setTotals] = useState<LedgerTotals | null>(null);
  const [matching, setMatching] = useState(0);
  const [truncated, setTruncated] = useState(false);
  // Opens on what needs doing rather than on what happened most recently.
  const [filter, setFilter] = useState<LedgerFilter>('chase');
  const [ledgerQuery, setLedgerQuery] = useState('');
  // One row open at a time. Several breakdowns at once turns a sheet built for
  // scanning back into a wall, and the question this answers is about one
  // invoice.
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadInvoices = useCallback(async () => {
    try {
      // The filter goes to the server: an invoice unpaid since March is
      // exactly the one worth finding and exactly the one a recency cap on a
      // single shared list would drop.
      const status = FILTER_STATUS[filter];
      const response = await fetch(
        `/api/admin/billing/charges${status ? `?status=${status}` : ''}`
      );
      const data = await response.json();
      if (response.ok) {
        setInvoices(data.invoices || []);
        setTotals(data.totals ?? null);
        setMatching(data.matching ?? (data.invoices?.length || 0));
        setTruncated(Boolean(data.truncated));
      }
    } catch {
      // The list is context, not the job — a failed load must not look like
      // a failed charge.
    }
  }, [filter]);

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

  /*
   * Anything that changes WHO is being charged retracts the confirmation.
   *
   * The duplicate warning turns the button into "Yes — charge $1,200 again",
   * and pressing it sends confirmDuplicate: true, which tells the server to
   * skip the check entirely. Editing the description or a line already
   * withdrew that. Changing the customer or the project did not — so the
   * sequence "warned about a twin on this project, switch to a different
   * project, press the button" sent a charge to somebody the guard had never
   * looked at, with the guard switched off. The confirmation was about a
   * different invoice by then.
   */
  const changeTarget = (apply: () => void) => {
    apply();
    setNeedsConfirmation(false);
    setError('');
  };

  const pickCustomer = (picked: Customer) => {
    changeTarget(() => {
      setCustomer(picked);
      setProjectId(picked.projects[0]?.id || '');
      setQuery('');
      setResults([]);
    });
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

  // The status half already happened on the server; this is the typed search
  // over what came back.
  const visible = invoices.filter((invoice) => matchesQuery(invoice, ledgerQuery));

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

  /*
   * The same five conditions, as a sentence.
   *
   * canSubmit above is the boolean the button needs; this is what the person
   * needs. Kept as one function in lib/billing.ts rather than five inline
   * ternaries so the wording cannot drift from the server's own refusals.
   */
  const blocker = describeChargeBlocker({
    hasCustomer: Boolean(projectId),
    description,
    lines,
  });

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

      {/*
        `grid-cols-1` is load-bearing, not tidiness.
        A `grid` with no column definition at this breakpoint gets one implicit
        column sized `auto`, which is max-content — so the column grew to fit
        the widest thing in it (686px, set by an invoice description) inside a
        358px phone. The page does not scroll horizontally, so everything past
        the fold was simply cut off and unreachable: the Charge button, every
        input, and Mark paid on each invoice row. The `lg:` columns already say
        minmax(0,1fr) for exactly this reason; the mobile one never did.
      */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
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
                    onChange={(e) => changeTarget(() => setProjectId(e.target.value))}
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
                {/* Say what this field can find before someone types into it
                    and gets nothing back. A charge hangs off a project, so a
                    lead who has not bought yet is genuinely not billable
                    here — but silence made that look like a broken box. */}
                {query.trim().length < 2 && (
                  <p className="mt-2 text-xs text-white/35">
                    Type at least two characters. Only customers with a project appear here — a
                    charge hangs off a project, so a lead who hasn&apos;t bought yet has nothing to
                    bill against. Quote extra work as a line item on their proposal instead.
                  </p>
                )}
                {query.trim().length >= 2 && (
                  <div className="mt-2 rounded-lg border border-white/10 divide-y divide-white/[0.06] overflow-hidden">
                    {searching && <p className="px-3 py-2 text-xs text-white/40">Searching…</p>}
                    {!searching && results.length === 0 && (
                      <p className="px-3 py-2 text-xs text-white/40">
                        No customer matches that. Only customers with a project can be billed here —
                        if they&apos;re still a lead, put the work on their proposal and send them a
                        sign-and-pay link instead.
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
                    /* A target you can hit, around an icon that stays the same
                       size. `px-1` around a 16px glyph is about 24x16 — a third
                       of the width a finger needs — and it sits immediately
                       beside the amount field, so the easiest thing to hit by
                       accident on this form was the one that deletes a line. */
                    <button
                      onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white"
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {/* 56x18 before this — a text link pretending to be a button, on
                the form that builds a client's invoice, and the only way to
                add a second line. Same words, a real control around them. */}
            <button
              onClick={() => setLines((current) => [...current, { label: '', amount: '' }])}
              className="mt-2 inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-400/10 hover:text-sky-200"
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

          {/* What is still needed, in the muted tone of guidance rather than
              the red of an error — nothing has gone wrong, the form is just
              unfinished. Hidden once the button works, so it never becomes
              furniture people stop reading. */}
          {blocker && !error && <p className="mt-2.5 text-xs text-white/35">{blocker}</p>}

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

        {/* Between raising a charge and the ledger, because it belongs to
            neither: it is the thinking you do before you touch either one. */}
        <RefundEstimate projectId={projectId} onRefunded={loadInvoices} />

        <Card className="p-6">
          <CardHeader
            icon={Receipt}
            title="Invoices raised"
            subtitle="Every invoice raised — instalments and one-off charges, newest first"
            tone="sky"
          />

          {/* The three numbers, before the rows.
              This card used to open straight onto a hundred rows newest-first,
              which answers "what happened recently" and nothing else. The
              question people actually arrive with is "how much is owed", and
              it was only answerable by adding up on screen. */}
          {totals && totals.count > 0 && (
            <div className="mb-4 grid grid-cols-3 gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/35">Outstanding</p>
                <p
                  className={`text-lg font-semibold tabular-nums ${
                    totals.outstandingCents > 0 ? 'text-amber-300' : 'text-white/40'
                  }`}
                >
                  {formatCentsExact(totals.outstandingCents)}
                </p>
                <p className="text-[10px] text-white/30">
                  {totals.outstandingCount} invoice{totals.outstandingCount === 1 ? '' : 's'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/35">Paid</p>
                <p className="text-lg font-semibold tabular-nums text-emerald-300/90">
                  {formatCentsExact(totals.paidCents)}
                </p>
                <p className="text-[10px] text-white/30">
                  {totals.paidCount} invoice{totals.paidCount === 1 ? '' : 's'}
                </p>
              </div>
              <div>
                {/* Reported apart from "paid" rather than netted off it —
                    "paid" and "paid then given back" are different sentences,
                    and one net figure hides the second entirely.

                    And a credit is not a refund. A refund is cash that left
                    the account; a credit is value the client is owed with the
                    money still here. Adding them together overstated what had
                    actually gone out, which is the same mistake one level
                    down. */}
                <p className="text-[10px] uppercase tracking-wider text-white/35">Refunded</p>
                <p
                  className={`text-lg font-semibold tabular-nums ${
                    totals.refundedCents > 0 ? 'text-purple-300/90' : 'text-white/25'
                  }`}
                >
                  {formatCentsExact(totals.refundedCents)}
                </p>
                <p className="text-[10px] text-white/30">
                  {totals.creditedCents > 0
                    ? `+ ${formatCentsExact(totals.creditedCents)} credited`
                    : 'cash returned'}
                </p>
              </div>
            </div>
          )}

          {invoices.length > 0 && (
            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(LEDGER_FILTER_LABELS) as LedgerFilter[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`rounded-full px-3 py-1 text-xs transition-colors ${
                      filter === key
                        ? 'bg-white/[0.12] text-white'
                        : 'bg-white/[0.03] text-white/45 hover:bg-white/[0.06] hover:text-white/70'
                    }`}
                  >
                    {LEDGER_FILTER_LABELS[key]}
                  </button>
                ))}
              </div>
              <input
                value={ledgerQuery}
                onChange={(e) => setLedgerQuery(e.target.value)}
                placeholder="Find by company, invoice number or what it was for"
                className={inputClass}
              />
            </div>
          )}

          {invoices.length === 0 ? (
            <EmptyState icon={Receipt} text="No invoices have been raised yet." />
          ) : visible.length === 0 ? (
            /* A filter that hides everything must say it was the filter.
               An empty list under "Needs chasing" is good news and reads as a
               broken page unless it says which it is. */
            <EmptyState
              icon={Receipt}
              text={
                ledgerQuery.trim()
                  ? `Nothing matches “${ledgerQuery.trim()}” in ${LEDGER_FILTER_LABELS[filter].toLowerCase()}.`
                  : filter === 'chase'
                    ? 'Nothing outstanding — every invoice raised has been paid or cancelled.'
                    : `No invoices in ${LEDGER_FILTER_LABELS[filter].toLowerCase()}.`
              }
            />
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {visible.map((invoice) => (
                <div key={invoice.id} className="py-3 first:pt-0 last:pb-0">
                  {/* The whole row opens the project. Only the company name
                      was a link before, which is a two-millimetre target for
                      the thing everybody is actually trying to reach. */}
                  <Link
                    href={`/admin/projects/${invoice.project.id}`}
                    className="block -mx-2 rounded-lg px-2 py-1 hover:bg-white/[0.03] transition-colors"
                  >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{invoice.description}</p>
                      <p className="text-xs text-white/40 truncate">
                        {invoice.client.company}
                        {' · '}
                        {invoice.number}
                        {' · '}
                        {new Date(invoice.createdAt).toLocaleDateString()}
                      </p>
                      {/* How long it has been sitting there and whether
                          anybody has asked about it since. Neither half is
                          enough alone: nineteen days with three reminders is a
                          client ignoring you, nineteen days with none is an
                          invoice nobody remembered to send, and those want
                          opposite responses. */}
                      {(() => {
                        const line = chaseLine(invoice);
                        if (!line) return null;
                        const band = ageBand(daysOutstanding(invoice));
                        return (
                          <p
                            className={`mt-0.5 text-[11px] ${
                              band === 'stale'
                                ? 'text-red-300/80'
                                : band === 'ageing'
                                  ? 'text-amber-300/70'
                                  : 'text-white/30'
                            }`}
                          >
                            {line}
                          </p>
                        );
                      })()}
                    </div>
                    {/* An invoice is no longer just open/paid/void: it can be
                        part refunded, fully refunded, or credited, and those
                        are different enough to a client asking about their
                        money that one badge has to say which. */}
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold tabular-nums ${
                        invoice.status === 'void' ? 'text-white/40 line-through' : ''
                      }`}>
                        {formatCentsExact(invoice.amountCents)}
                      </p>
                      {(() => {
                        const state = displayState(invoice);
                        return (
                          <Badge tone={stateTone(state)} solid>
                            {DISPLAY_STATE_LABELS[state]}
                          </Badge>
                        );
                      })()}
                      {invoice.refundedCents > 0 && (
                        <p className="mt-0.5 text-[10px] text-white/35 tabular-nums">
                          {formatCentsExact(invoice.refundedCents)} back
                        </p>
                      )}
                    </div>
                  </div>
                  </Link>
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
                      <CopyButton value={invoice.paymentUrl} label="Copy pay link" />
                    )}
                    {/* "Not emailed" used to be the end of the sentence and
                        there was nothing to do about it. It is now a state
                        with a button beside it, so it says how many times
                        instead of only whether. */}
                    <span className="text-white/30">
                      {invoice.sendCount > 1
                        ? `Sent ${invoice.sendCount}× to ${invoice.sentToEmail}`
                        : invoice.sentToEmail
                          ? `Sent to ${invoice.sentToEmail}`
                          : 'Not emailed'}
                    </span>
                    <InvoiceActions invoice={invoice} onDone={loadInvoices} />
                  </div>
                  {/* The reason is the whole value of the record. An invoice
                      that changed and doesn't say why is the hardest thing to
                      explain a year later. */}
                  {(invoice.voidReason || invoice.refundReason) && (
                    <p className="mt-1 text-[11px] text-white/30">
                      {invoice.voidReason
                        ? `Cancelled: ${invoice.voidReason}`
                        : `${invoice.refundMethod === 'credit' ? 'Credited' : 'Refunded'}: ${invoice.refundReason}`}
                    </p>
                  )}

                  {/*
                    What the money was actually for.
                    The row carried a heading — "Second round of homepage
                    design" — and the total, which is not what a client asks.
                    They ask "what's the twelve hundred for", and answering it
                    meant opening the PDF, which is a download, a new tab, and
                    a document written for their accountant rather than for the
                    person on the phone. The lines were already in the payload
                    the whole time; nothing rendered them.

                    Behind a toggle rather than always open, because the sheet's
                    job is to be scanned. Collapsed by default puts the
                    breakdown one click from every row without making any row
                    three lines taller.
                  */}
                  {(() => {
                    const itemised = readInvoiceLines(invoice.lineItems);
                    const raisedBy = issuedByLabel(invoice.issuedBy);
                    if (itemised.length === 0 && !raisedBy) return null;
                    const open = expanded === invoice.id;

                    return (
                      <div className="mt-1">
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : invoice.id)}
                          aria-expanded={open}
                          className="text-[11px] text-white/35 transition-colors hover:text-white/70"
                        >
                          {open
                            ? 'Hide breakdown'
                            : itemised.length > 0
                              ? `${itemised.length} line${itemised.length === 1 ? '' : 's'}`
                              : 'Details'}
                        </button>
                        {open && (
                          <div className="mt-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                            <dl className="space-y-1">
                              {itemised.map((line, i) => (
                                <div key={i} className="flex justify-between gap-4 text-[11px]">
                                  <dt className="min-w-0 truncate text-white/55">{line.label}</dt>
                                  <dd className="shrink-0 tabular-nums text-white/45">
                                    {formatCentsExact(line.priceCents)}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                            {raisedBy && (
                              // Two people raise charges here, so "who billed
                              // this client" is a real question — and one the
                              // query already had the answer to.
                              <p className="mt-2 border-t border-white/[0.06] pt-1.5 text-[10px] text-white/30">
                                Raised by {raisedBy} · {invoice.project.name}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}
              {/* Said out loud rather than left to be discovered. A list that
                  quietly stops at a hundred reads as "that is all of them",
                  and the totals above are the reason it does not have to. */}
              {truncated && (
                <p className="pt-3 text-[11px] text-white/30">
                  Showing the {invoices.length} most recent of {matching} in{' '}
                  {LEDGER_FILTER_LABELS[filter].toLowerCase()}
                  {ledgerQuery.trim() ? ' — the search covers only these' : ''}. The figures above
                  cover every invoice.
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    </PageIn>
  );
}
