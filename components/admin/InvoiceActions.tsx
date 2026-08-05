'use client';

import { useState } from 'react';
import { Ban, RotateCcw } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { BrandButton, inputClass } from '@/components/admin/ui';
import { dollarsToCents } from '@/lib/billing';
import { formatCentsExact } from '@/lib/pricing';
import {
  MAX_REASON_LENGTH,
  REFUND_METHOD_LABELS,
  settlement,
  type RefundMethod,
} from '@/lib/invoice-lifecycle';

/**
 * The two things that can happen to an invoice after it exists, wherever an
 * invoice is listed.
 *
 * One component rather than a copy on the billing page and another on the
 * project page, because these are the buttons where a second implementation
 * eventually disagrees with the first about what is allowed — and the
 * disagreement is always discovered by someone refunding the wrong amount.
 *
 * Both are deliberately behind a modal with a typed reason. Neither is
 * undoable, and a one-click irreversible money action next to "Copy pay link"
 * is a mis-click waiting to happen.
 */

export interface ActionableInvoice {
  id: string;
  number: string;
  description: string;
  amountCents: number;
  status: string;
  refundedCents: number;
  sentToEmail: string | null;
}

interface Deduction {
  label: string;
  /** Dollars as typed. Converted once, on submit. */
  amount: string;
}

export function InvoiceActions({
  invoice,
  onDone,
}: {
  invoice: ActionableInvoice;
  onDone: () => void;
}) {
  const [open, setOpen] = useState<'void' | 'refund' | null>(null);

  const remaining = invoice.amountCents - invoice.refundedCents;
  const canVoid = invoice.status === 'open';
  const canRefund = invoice.status === 'paid' && remaining > 0;

  if (!canVoid && !canRefund) return null;

  return (
    <>
      {canVoid && (
        <button
          onClick={() => setOpen('void')}
          className="inline-flex items-center gap-1 text-white/45 hover:text-red-300 transition-colors"
        >
          <Ban size={11} /> Cancel
        </button>
      )}
      {canRefund && (
        <button
          onClick={() => setOpen('refund')}
          className="inline-flex items-center gap-1 text-white/45 hover:text-amber-300 transition-colors"
        >
          <RotateCcw size={11} /> Refund
        </button>
      )}

      {open === 'void' && (
        <VoidModal invoice={invoice} onClose={() => setOpen(null)} onDone={onDone} />
      )}
      {open === 'refund' && (
        <RefundModal invoice={invoice} onClose={() => setOpen(null)} onDone={onDone} />
      )}
    </>
  );
}

function VoidModal({
  invoice,
  onClose,
  onDone,
}: {
  invoice: ActionableInvoice;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [notifyClient, setNotifyClient] = useState(Boolean(invoice.sentToEmail));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/billing/invoices/${invoice.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, notifyClient }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      onDone();
      onClose();
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={`Cancel invoice ${invoice.number}`}>
      <div className="space-y-4">
        <p className="text-sm text-white/60">
          {invoice.description} — {formatCentsExact(invoice.amountCents)}
        </p>
        <p className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-white/45">
          The payment link stops working immediately, so nobody can pay an invoice you&apos;ve
          written off. The invoice itself stays on the books as cancelled — it isn&apos;t deleted.
        </p>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">
            Why is it being cancelled?
          </label>
          <input
            autoFocus
            value={reason}
            maxLength={MAX_REASON_LENGTH}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Raised against the wrong project"
            className={inputClass}
          />
          <p className="mt-1 text-[11px] text-white/30">
            Goes on the record, and into the client&apos;s email if you send one.
          </p>
        </div>

        {invoice.sentToEmail && (
          <label className="flex items-start gap-2.5 text-sm text-white/60">
            <input
              type="checkbox"
              checked={notifyClient}
              onChange={(e) => setNotifyClient(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Tell {invoice.sentToEmail} it&apos;s cancelled
              <span className="block text-[11px] text-white/30">
                They were sent this invoice, so they&apos;re expecting to pay it.
              </span>
            </span>
          </label>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <BrandButton variant="quiet" onClick={onClose}>
            Keep it
          </BrandButton>
          <BrandButton onClick={submit} disabled={busy || !reason.trim()}>
            {busy ? 'Cancelling…' : 'Cancel this invoice'}
          </BrandButton>
        </div>
      </div>
    </Modal>
  );
}

function RefundModal({
  invoice,
  onClose,
  onDone,
}: {
  invoice: ActionableInvoice;
  onClose: () => void;
  onDone: () => void;
}) {
  const remaining = invoice.amountCents - invoice.refundedCents;

  const [amount, setAmount] = useState((remaining / 100).toFixed(2));
  const [method, setMethod] = useState<RefundMethod>('stripe');
  const [reason, setReason] = useState('');
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [notifyClient, setNotifyClient] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const amountCents = dollarsToCents(amount);
  const deductionCents = deductions.map((d) => ({
    label: d.label.trim(),
    amountCents: dollarsToCents(d.amount) ?? 0,
  }));
  // The same function the route and the email use, so what's previewed here
  // and what the client receives cannot be two different statements.
  const preview =
    amountCents !== null ? settlement({ refundCents: amountCents, deductions: deductionCents }) : null;

  const amountProblem =
    amountCents === null
      ? 'Enter an amount like 250 or 250.00.'
      : amountCents <= 0
        ? 'Enter an amount above zero.'
        : amountCents > remaining
          ? `The most you can refund is ${formatCentsExact(remaining)}.`
          : null;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/billing/invoices/${invoice.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents,
          method,
          reason,
          notifyClient,
          deductions: deductionCents.filter((d) => d.label && d.amountCents > 0),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      onDone();
      onClose();
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={`Refund invoice ${invoice.number}`}>
      <div className="space-y-4">
        <p className="text-sm text-white/60">
          {invoice.description} — {formatCentsExact(invoice.amountCents)}
          {invoice.refundedCents > 0 && (
            <span className="block text-xs text-amber-300/80">
              {formatCentsExact(invoice.refundedCents)} has already gone back —{' '}
              {formatCentsExact(remaining)} left.
            </span>
          )}
        </p>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">How is it going back?</label>
          <div className="space-y-1.5">
            {(Object.keys(REFUND_METHOD_LABELS) as RefundMethod[]).map((key) => (
              <label
                key={key}
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors ${
                  method === key
                    ? 'border-sky-400/40 bg-sky-400/[0.07]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]'
                }`}
              >
                <input
                  type="radio"
                  name="refund-method"
                  checked={method === key}
                  onChange={() => setMethod(key)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  {REFUND_METHOD_LABELS[key]}
                  <span className="block text-[11px] text-white/35">
                    {key === 'stripe'
                      ? 'Money leaves the account now, through Stripe. This cannot be undone.'
                      : key === 'manual'
                        ? "You send it yourself — bank transfer, cheque. This only writes it down."
                        : 'Nothing moves. The value is held against their next invoice.'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">How much?</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className={inputClass}
          />
          {amountProblem && <p className="mt-1 text-[11px] text-amber-300">{amountProblem}</p>}
        </div>

        {/* Section 8(d) allows processor fees and the administration charge to
            be withheld; 8(f) allows non-recoverable third-party costs, and
            requires them itemised in writing. This is that itemisation. */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-white/50">Anything withheld?</label>
            <button
              onClick={() => setDeductions((d) => [...d, { label: '', amount: '' }])}
              className="text-[11px] text-sky-300 hover:text-sky-200"
            >
              + Add a deduction
            </button>
          </div>
          {deductions.length === 0 ? (
            <p className="text-[11px] text-white/30">
              Nothing withheld — the full amount goes back. Add a line for processor fees, the
              administration charge, or a third-party cost we can&apos;t recover.
            </p>
          ) : (
            <div className="space-y-2">
              {deductions.map((d, i) => (
                // Wrappers rather than width classes on the inputs:
                // inputClass already carries w-full, and w-28 beside it is a
                // coin toss decided by stylesheet order rather than by what
                // is written here.
                <div key={i} className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <input
                      value={d.label}
                      onChange={(e) =>
                        setDeductions((prev) =>
                          prev.map((row, j) => (j === i ? { ...row, label: e.target.value } : row))
                        )
                      }
                      placeholder="Domain registration"
                      className={inputClass}
                    />
                  </div>
                  <div className="w-28 shrink-0">
                    <input
                      value={d.amount}
                      onChange={(e) =>
                        setDeductions((prev) =>
                          prev.map((row, j) => (j === i ? { ...row, amount: e.target.value } : row))
                        )
                      }
                      placeholder="18.00"
                      inputMode="decimal"
                      className={inputClass}
                    />
                  </div>
                  <button
                    onClick={() => setDeductions((prev) => prev.filter((_, j) => j !== i))}
                    className="px-2 text-white/30 hover:text-red-300"
                    aria-label="Remove this deduction"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">Why?</label>
          <input
            value={reason}
            maxLength={MAX_REASON_LENGTH}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Removed the SEO add-on before work started"
            className={inputClass}
          />
        </div>

        {/* The contract's two lines, previewed before anything happens. */}
        {preview && !amountProblem && (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.15em] text-white/30">
              Settlement
            </p>
            <dl className="space-y-1.5 text-sm">
              {preview.deductions.map((d) => (
                <div key={d.label} className="flex justify-between text-white/40">
                  <dt>Less: {d.label}</dt>
                  <dd className="tabular-nums">−{formatCentsExact(d.amountCents)}</dd>
                </div>
              ))}
              <div
                className={`flex justify-between border-t border-white/10 pt-1.5 ${
                  preview.dueFromClientCents > 0 ? 'font-semibold text-amber-300' : 'text-white/35'
                }`}
              >
                <dt>Amount due from the client</dt>
                <dd className="tabular-nums">{formatCentsExact(preview.dueFromClientCents)}</dd>
              </div>
              <div
                className={`flex justify-between ${
                  preview.returnedToClientCents > 0 ? 'font-semibold text-emerald-300' : 'text-white/35'
                }`}
              >
                <dt>Amount returned to the client</dt>
                <dd className="tabular-nums">{formatCentsExact(preview.returnedToClientCents)}</dd>
              </div>
            </dl>
          </div>
        )}

        <label className="flex items-start gap-2.5 text-sm text-white/60">
          <input
            type="checkbox"
            checked={notifyClient}
            onChange={(e) => setNotifyClient(e.target.checked)}
            className="mt-0.5"
          />
          <span>Email the client this settlement</span>
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <BrandButton variant="quiet" onClick={onClose}>
            Cancel
          </BrandButton>
          <BrandButton onClick={submit} disabled={busy || !!amountProblem || !reason.trim()}>
            {busy
              ? 'Working…'
              : method === 'stripe'
                ? `Refund ${formatCentsExact(preview?.returnedToClientCents ?? 0)} to the card`
                : method === 'credit'
                  ? 'Apply the credit'
                  : 'Record the refund'}
          </BrandButton>
        </div>
      </div>
    </Modal>
  );
}
