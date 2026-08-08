'use client';

import { useState } from 'react';
import { BadgeDollarSign, Send, X } from 'lucide-react';
import { formatCentsExact } from '@/lib/pricing';

/**
 * "That move just made a payment due. Send it?"
 *
 * Section 7 has the second and third instalments "invoiced on the day of
 * approval". In practice that day passed unmarked: somebody moved the project
 * to Build, the money became payable, and nothing anywhere said so. It sat
 * uninvoiced until a person happened to think of it, which is the only kind
 * of missing revenue that is entirely the studio's own fault.
 *
 * Two things this deliberately does not do.
 *
 * It does not invoice on its own. Money leaving for a client's inbox with no
 * human pressing send is how you bill somebody the morning after they
 * complained about the work. Every path here ends at a button.
 *
 * And it does not pretend the gate is a fact. The contract's gate is Design
 * Approval; a dropdown moving to Build is our evidence for it, not the thing
 * itself, and those are usually the same event and occasionally are not. So
 * the assumption is written on the prompt in the contract's own words, with
 * the clause underneath it, and "Not yet" is a first-class answer.
 */

/*
 * The server's shape, not a copy of it.
 *
 * This was declared again here, field for field, and the two promptly
 * disagreed: lib/stage-gates grew a field and this file could not see it, so
 * the component that renders the prompt was type-checked against a gate that
 * no longer existed. A duplicated type is a type that drifts, and it drifts
 * silently because both halves compile.
 */
export type { OpenedGate } from '@/lib/stage-gates';
import type { OpenedGate } from '@/lib/stage-gates';

export function GatePrompt({
  gate,
  projectId,
  company,
  onDone,
  onDismiss,
}: {
  gate: OpenedGate;
  projectId: string;
  company: string;
  onDone: () => void;
  onDismiss: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/instalments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: gate.index }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not send the payment.');
        return;
      }
      setSent(
        data.emailSent
          ? `${gate.label} sent — invoice ${data.instalment?.invoiceNumber ?? ''} is in their inbox.`
          : `Invoice ${data.instalment?.invoiceNumber ?? ''} and the payment link are ready, but the email didn't send. Copy the link from the schedule and send it by hand.`
      );
      onDone();
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] p-4">
        <p className="text-sm text-emerald-200">{sent}</p>
        <button
          onClick={onDismiss}
          className="mt-2 text-[11px] text-white/45 transition-colors hover:text-white"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-200">
          <BadgeDollarSign size={15} />
          {gate.label} is now due
        </p>
        <button
          onClick={onDismiss}
          aria-label="Not now"
          className="shrink-0 text-white/30 transition-colors hover:text-white/70"
        >
          <X size={14} />
        </button>
      </div>

      {/* The assumption, stated. An inference you can see is a very different
          thing from one buried in a condition. */}
      {gate.lead ? (
        /* Not an inference. Recording that the client approved is the event
           the contract names, so it does not get the sentence written for a
           guess — "you moved them to Build" is not what happened. */
        <p className="text-sm text-white/70">
          {gate.lead.replace(/ payable now\.$/, '')}{' '}
          <span className="font-semibold text-emerald-300">
            {formatCentsExact(gate.amountCents)}
          </span>{' '}
          — payable now.
        </p>
      ) : (
        <p className="text-sm text-white/70">
          You moved {company} to <span className="capitalize text-white">{gate.stage}</span>. The
          contract treats that as <span className="text-white">{gate.claim}</span>, which makes{' '}
          {gate.label} — <span className="font-semibold text-emerald-300">
            {formatCentsExact(gate.amountCents)}
          </span>{' '}
          — payable now.
        </p>
      )}

      {gate.clauseText && (
        <p className="mt-2.5 border-l-2 border-white/15 pl-3 text-[11px] leading-relaxed text-white/40">
          {gate.clause}: {gate.clauseText}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={send}
          disabled={sending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Send size={12} />
          {sending ? 'Sending…' : `Invoice ${formatCentsExact(gate.amountCents)} now`}
        </button>
        <button
          onClick={onDismiss}
          className="rounded-lg px-3 py-2 text-xs font-medium text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          Not yet
        </button>
      </div>

      {/* Dismissing is not the same as deciding, and the difference matters:
          this is the one thing on the page that is money the studio has
          earned and never asked for. */}
      <p className="mt-2 text-[11px] text-white/30">
        &ldquo;Not yet&rdquo; keeps it on your dashboard under &ldquo;Earned — nobody has invoiced
        it&rdquo; until it&apos;s sent.
      </p>
    </div>
  );
}
