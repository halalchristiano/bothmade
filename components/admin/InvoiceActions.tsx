'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Ban, CalendarClock, Check, RotateCcw, Send } from 'lucide-react';
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
 * Everything that can happen to an invoice after it exists, wherever an
 * invoice is listed: send it, mark it paid, cancel it, refund it.
 *
 * One component rather than a copy on the billing page and another on the
 * project page, because these are the buttons where a second implementation
 * eventually disagrees with the first about what is allowed — and the
 * disagreement is always discovered by someone refunding the wrong amount.
 *
 * All four are deliberately behind a modal. Cancel, refund and mark-paid
 * because none is undoable and a one-click irreversible money action next to
 * "Copy pay link" is a mis-click waiting to happen; send because the mis-click
 * there is chasing a client who already paid.
 */

export interface ActionableInvoice {
  id: string;
  number: string;
  description: string;
  amountCents: number;
  status: string;
  refundedCents: number;
  sentToEmail: string | null;
  /** How the chase has gone. Absent on payloads written before sends were counted. */
  sendCount?: number;
  lastSentAt?: string | null;
  /**
   * One of the three scheduled payments on a project, rather than a one-off
   * charge. It is settled through a Checkout Session held on the Instalment
   * row, so the resend route refuses it and points at the project's schedule
   * — which is right, and was being said only after somebody had pressed
   * Send, read a confirmation and pressed Send again. Offering the action and
   * then refusing it is worse than not offering it.
   */
  isInstalment?: boolean;
  /** Where the schedule lives, for the link that replaces Send on one. */
  projectId?: string;
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
  const [open, setOpen] = useState<'void' | 'refund' | 'send' | 'paid' | null>(null);

  const remaining = invoice.amountCents - invoice.refundedCents;
  const canVoid = invoice.status === 'open';
  const canRefund = invoice.status === 'paid' && remaining > 0;
  /*
   * Both of these are "this invoice is still a request for money", which is
   * exactly what an open invoice is: a paid one has nothing to chase and a
   * cancelled one has nothing to pay. Named separately rather than shared,
   * because they answer different questions and the day one of them grows a
   * condition the other doesn't, a shared boolean is how it goes unnoticed.
   */
  // Not an instalment: those are sent from the project's schedule, which owns
  // the checkout session that pays them. Marking one paid by hand is fine and
  // stays — that route settles the instalment row alongside the invoice.
  const canSend = invoice.status === 'open' && !invoice.isInstalment;
  const canMarkPaid = invoice.status === 'open';
  const sendFromSchedule = invoice.status === 'open' && invoice.isInstalment && invoice.projectId;

  if (!canVoid && !canRefund && !canSend && !canMarkPaid) return null;

  return (
    <>
      {canSend && (
        <button
          onClick={() => setOpen('send')}
          className="-my-1 inline-flex items-center gap-1 py-1 text-white/45 transition-colors hover:text-sky-300"
        >
          <Send size={11} /> {invoice.sendCount ? 'Send again' : 'Send'}
        </button>
      )}
      {sendFromSchedule && (
        // A link rather than a disabled button. "You can't do that here" with
        // no onward route is the version of this that sends somebody hunting
        // through the admin for where you can.
        <Link
          href={`/admin/projects/${invoice.projectId}`}
          className="-my-1 inline-flex items-center gap-1 py-1 text-white/45 transition-colors hover:text-sky-300"
          title="Scheduled payments are sent from the project, which holds the checkout that pays them."
        >
          <CalendarClock size={11} /> Send from schedule
        </Link>
      )}
      {canMarkPaid && (
        <button
          onClick={() => setOpen('paid')}
          className="-my-1 inline-flex items-center gap-1 py-1 text-white/45 transition-colors hover:text-emerald-300"
        >
          <Check size={11} /> Mark paid
        </button>
      )}
      {canVoid && (
        <button
          onClick={() => setOpen('void')}
          className="-my-1 inline-flex items-center gap-1 py-1 text-white/45 transition-colors hover:text-red-300"
        >
          <Ban size={11} /> Cancel
        </button>
      )}
      {canRefund && (
        <button
          onClick={() => setOpen('refund')}
          className="-my-1 inline-flex items-center gap-1 py-1 text-white/45 transition-colors hover:text-amber-300"
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
      {open === 'send' && (
        <SendModal invoice={invoice} onClose={() => setOpen(null)} onDone={onDone} />
      )}
      {open === 'paid' && (
        <MarkPaidModal invoice={invoice} onClose={() => setOpen(null)} onDone={onDone} />
      )}
    </>
  );
}

/**
 * The client paid, just not through us.
 *
 * A bank transfer, a cheque, a card taken over the phone — the invoice email
 * offers exactly this, and until now nothing could record that it happened.
 * The invoice stayed open, kept counting toward the outstanding total, and
 * kept showing the client a Pay button for money they had already sent.
 *
 * How it arrived is required, not optional. "Paid" on its own is the version
 * of this record nobody can reconcile against a bank statement a year later.
 */
function MarkPaidModal({
  invoice,
  onClose,
  onDone,
}: {
  invoice: ActionableInvoice;
  onClose: () => void;
  onDone: () => void;
}) {
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/billing/invoices/${invoice.id}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method }),
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
    <Modal onClose={onClose} title={`Mark ${invoice.number} paid`}>
      <div className="space-y-4">
        <p className="text-sm text-white/60">
          {invoice.description} — {formatCentsExact(invoice.amountCents)}
        </p>
        <p className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-white/45">
          For money that arrived outside Stripe. The payment link stops working immediately, so the
          client can&apos;t pay the same invoice a second time, and the amount goes into the ledger as
          a real payment rather than only flipping a status.
        </p>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">How did it arrive?</label>
          <input
            autoFocus
            value={method}
            maxLength={MAX_REASON_LENGTH}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="Bank transfer, ref ACME0312"
            className={inputClass}
          />
          <p className="mt-1 text-[11px] text-white/30">
            Enough to find it on a bank statement in a year&apos;s time.
          </p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <BrandButton variant="quiet" onClick={onClose}>
            Not yet
          </BrandButton>
          <BrandButton onClick={submit} disabled={busy || !method.trim()}>
            {busy ? 'Recording…' : `Record ${formatCentsExact(invoice.amountCents)} received`}
          </BrandButton>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Send this invoice to the client — the first time, or again.
 *
 * Behind a confirmation rather than one click, for a reason that is not
 * "money moves": it doesn't. It is that the recipient is a paying client and
 * the message is a request for money, and the mis-click cost is an
 * accidental second chase to somebody who already paid you last week. So the
 * screen says who it is going to and how many times they have had it, and
 * makes that the last thing read before pressing.
 */
function SendModal({
  invoice,
  onClose,
  onDone,
}: {
  invoice: ActionableInvoice;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  const sends = invoice.sendCount ?? 0;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/billing/invoices/${invoice.id}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        // The row may still have changed — a pay link can be minted on an
        // attempt whose email then failed, and the dashboards should show it.
        onDone();
        return;
      }
      if (data.warnings?.length) {
        // Sent, but not perfectly. Kept on screen rather than closing over it:
        // "the client can't pay this online" is the sentence that decides
        // whether somebody picks up the phone.
        setWarnings(data.warnings);
        onDone();
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
    <Modal onClose={onClose} title={`Send invoice ${invoice.number}`}>
      <div className="space-y-4">
        <p className="text-sm text-white/60">
          {invoice.description} — {formatCentsExact(invoice.amountCents)}
        </p>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-white/45">
          {sends === 0 ? (
            <>
              This invoice has never been emailed to the client.
              {invoice.sentToEmail
                ? ` A copy is addressed to ${invoice.sentToEmail}.`
                : ' It was raised for the record only.'}
            </>
          ) : (
            <>
              Already sent {sends === 1 ? 'once' : `${sends} times`}
              {invoice.sentToEmail ? ` to ${invoice.sentToEmail}` : ''}
              {invoice.lastSentAt ? `, last on ${new Date(invoice.lastSentAt).toLocaleDateString()}` : ''}.
            </>
          )}
          <span className="mt-2 block text-white/30">
            A missing PDF or payment link is rebuilt before it goes, so an invoice raised while
            Stripe was unreachable becomes payable now.
          </span>
        </div>

        {warnings.length > 0 && (
          <ul className="space-y-1">
            {warnings.map((warning, i) => (
              <li key={i} className="text-xs text-amber-300">
                {warning}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <BrandButton variant="quiet" onClick={onClose}>
            {warnings.length > 0 ? 'Done' : 'Not now'}
          </BrandButton>
          {warnings.length === 0 && (
            <BrandButton onClick={submit} disabled={busy}>
              {busy ? 'Sending…' : sends === 0 ? 'Send it' : 'Send it again'}
            </BrandButton>
          )}
        </div>
      </div>
    </Modal>
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
