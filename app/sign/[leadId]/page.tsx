'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PillCTA, SectionTag } from '@/components/ui';
import { CLICKWRAP_STATEMENT, SIGNER_NAME_MAX } from '@/lib/clickwrap';
import { isValidName, sanitizeNameInput } from '@/lib/validation';
import { formatCents } from '@/lib/pricing';

interface ScheduleRow {
  index: number;
  count: number;
  label: string;
  percent: number;
  amountCents: number;
  amountLabel: string;
  triggerLabel: string;
}

interface Proposal {
  company: string;
  contactName: string | null;
  serviceLabel: string;
  addOnLabels: string[];
  customItems: Array<{ label: string; description: string; price: string }>;
  timelineLabel: string;
  totalPrice: number;
  chargeAmount: number;
  depositOnly: boolean;
  depositAmount: number;
  balanceAmount: number;
  schedule: ScheduleRow[];
  alreadySigned: boolean;
  signerName: string | null;
  signedAt: string | null;
  sections: Array<{ heading: string; paragraphs: string[] }>;
}

/*
 * Pinned to en-US, like every other price in the system.
 *
 * This rolled its own with a bare `toLocaleString()`, which formats in the
 * BROWSER's locale — and this is the page where a client reads the fee and
 * signs for it. A German reader saw "$12.500" for twelve and a half thousand
 * dollars, which in their notation is twelve dollars fifty; a French one saw
 * "$12 500"; an Indian one saw lakh grouping on six figures. The dollar sign
 * was ours and the digit grouping was theirs, on a contract.
 *
 * formatCents has always existed for exactly this and is what the proposal,
 * the invoice and the emails use.
 */
const money = formatCents;

export default function SignAndPayPage() {
  const params = useParams();
  const leadId = params.leadId as string;

  // The capability token from the emailed link. Read off window rather than
  // useSearchParams() so this page needs no Suspense boundary to prerender.
  // Null means "not read yet"; '' means "no token in the URL", which the API
  // will reject like any other wrong token.
  const [shareToken, setShareToken] = useState<string | null>(null);

  useEffect(() => {
    setShareToken(new URLSearchParams(window.location.search).get('t') || '');
  }, []);

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [closed, setClosed] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Both halves of the affirmative act. The server checks the same two
  // things — this only decides whether the button looks pressable.
  const canSign = agreed && isValidName(signerName);

  useEffect(() => {
    if (shareToken === null) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/public/leads/${leadId}/proposal?t=${encodeURIComponent(shareToken)}`);
        const data = await res.json();
        if (res.ok && data.success) {
          setProposal(data.proposal);
        } else {
          setError(data.error || 'This link is no longer valid.');
          setClosed(!!data.closed);
        }
      } catch {
        setError('Something went wrong loading this page.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [leadId, shareToken]);

  const handleAgreeAndPay = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      // The consent travels with the request. Disabling the button is a
      // courtesy to the client; this is what the signature is recorded from.
      const res = await fetch(
        `/api/public/leads/${leadId}/agree-and-pay?t=${encodeURIComponent(shareToken || '')}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agreed, signerName: signerName.trim() }),
        }
      );
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setSubmitError(data.error || 'Could not start checkout. Please try again.');
        setSubmitting(false);
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#05030a] text-white flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400" />
      </main>
    );
  }

  if (error || !proposal) {
    return (
      <main className="min-h-screen bg-[#05030a] text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/40 mb-4">
            {closed ? 'Already closed' : 'Link not available'}
          </p>
          <h1 className="text-2xl font-bold mb-3">{error}</h1>
          <p className="text-white/50 text-sm">
            If you think this is a mistake, reply to the email this link came from and we'll sort it out.
          </p>
        </div>
      </main>
    );
  }

  // Links prepared before custom work needed describing carry items with no
  // scope to show; they stay in the fee, out of a panel with nothing in it.
  const describedCustom = (proposal.customItems ?? []).filter((i) => i.description.trim().length > 0);

  // The button names the payment, not just the number — the client should
  // never be one click from paying something they can't name.
  const firstRow = proposal.depositOnly ? proposal.schedule?.[0] : null;
  const chargeLabel = firstRow ? `${firstRow.label} — ${firstRow.amountLabel}` : money(proposal.chargeAmount);

  return (
    <main className="min-h-screen bg-[#05030a] text-white px-6 py-16 md:py-24">
      <div className="max-w-2xl mx-auto">
        <p className="font-bold tracking-tight mb-2">
          <span className="text-transparent" style={{ WebkitTextStroke: '1px rgba(125,211,252,0.9)' }}>both</span>made
        </p>
        <SectionTag className="mb-6">Project agreement &amp; payment</SectionTag>

        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">{proposal.company}</h1>
        <p className="text-white/50 mb-10">
          {proposal.serviceLabel}
          {proposal.addOnLabels.length > 0 ? ` + ${proposal.addOnLabels.join(', ')}` : ''} · {proposal.timelineLabel}
        </p>

        {/* The whole schedule, before they agree to any of it. A client who
            can see all three payments and what triggers each one is not
            being asked to trust a number — they're reading a plan. */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 mb-8">
          <div className="flex justify-between items-baseline mb-4">
            <span className="text-white/50 text-sm">Total project fee</span>
            <span className="text-lg font-semibold">{money(proposal.totalPrice)}</span>
          </div>

          {proposal.depositOnly && proposal.schedule?.length > 0 ? (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35 mb-3">
                Payment schedule
              </p>
              <ul className="space-y-2 mb-5">
                {proposal.schedule.map((row) => (
                  <li
                    key={row.index}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                      row.index === 1
                        ? 'border-sky-400/40 bg-sky-400/[0.07]'
                        : 'border-white/[0.07] bg-white/[0.01]'
                    }`}
                  >
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        row.index === 1 ? 'bg-sky-400 text-black' : 'bg-white/[0.07] text-white/45'
                      }`}
                    >
                      {row.index}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${row.index === 1 ? 'font-semibold text-white' : 'text-white/80'}`}>
                        {row.label}
                        <span className="text-white/35 font-normal"> · {row.percent}%</span>
                      </p>
                      <p className="text-xs text-white/40 capitalize">{row.triggerLabel}</p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold ${
                        row.index === 1 ? 'text-sky-300' : 'text-white/60'
                      }`}
                    >
                      {row.amountLabel}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex justify-between items-baseline pt-4 border-t border-white/10">
                <div>
                  <span className="text-white/50 text-sm block">Due today</span>
                  <span className="text-xs text-white/30">
                    {proposal.schedule[0].label} — the rest is invoiced at the milestones above
                  </span>
                </div>
                <span className="text-2xl font-bold text-sky-300 shrink-0 ml-4">
                  {proposal.schedule[0].amountLabel}
                </span>
              </div>
            </>
          ) : (
            <div className="flex justify-between items-baseline pt-2 border-t border-white/10">
              <span className="text-white/50 text-sm">Due today (paid in full)</span>
              <span className="text-2xl font-bold text-sky-300">{money(proposal.chargeAmount)}</span>
            </div>
          )}
        </div>

        {/* Custom work, spelled out above the fold rather than buried in the
            terms — the point of writing it down is that the client reads it
            before they agree, not after something arrives they didn't expect. */}
        {describedCustom.length > 0 && (
          <>
            <SectionTag className="mb-4">Custom work included</SectionTag>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 mb-8 space-y-4">
              {describedCustom.map((item, i) => (
                <div key={i}>
                  <div className="flex justify-between items-baseline gap-4">
                    <span className="font-semibold">{item.label}</span>
                    <span className="text-sm text-white/60 shrink-0">{item.price}</span>
                  </div>
                  <p className="text-sm text-white/60 leading-relaxed mt-1">{item.description}</p>
                </div>
              ))}
              <p className="text-xs text-white/35 pt-1">
                These descriptions are the agreed scope for this work. If anything here doesn't match what you
                expected, tell us before signing rather than after.
              </p>
            </div>
          </>
        )}

        <SectionTag className="mb-4">Terms &amp; conditions</SectionTag>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 mb-8 max-h-96 overflow-y-auto text-sm text-white/60 leading-relaxed space-y-6">
          {proposal.sections.map((section, i) => (
            <div key={i}>
              <p className="font-semibold text-white/80 mb-2">{section.heading}</p>
              {section.paragraphs.map((p, j) => (
                <p key={j} className="mb-2">
                  {p}
                </p>
              ))}
            </div>
          ))}
        </div>

        {proposal.alreadySigned ? (
          <>
            <p className="text-sm text-emerald-300 mb-1">
              ✓ Signed{proposal.signerName ? ` by ${proposal.signerName}` : ''}
              {proposal.signedAt ? ` on ${new Date(proposal.signedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}` : ''}. Continue below to complete payment.
            </p>
            <p className="text-xs text-white/30 mb-6">
              A copy of the signed agreement is already in your inbox — nothing to re-sign.
            </p>
            {submitError && <p className="text-sm text-red-400 mb-4">{submitError}</p>}
            <PillCTA type="button" busy={submitting} disabled={submitting} onClick={handleAgreeAndPay} size="lg">
              {submitting ? 'Redirecting to payment…' : `Continue to Payment — ${chargeLabel}`}
            </PillCTA>
          </>
        ) : (
          <>
            <label className="flex items-start gap-3 mb-5 cursor-pointer text-sm text-white/70">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5"
              />
              {CLICKWRAP_STATEMENT}
            </label>

            <label className="block mb-6">
              <span className="block font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 mb-2">
                Type your full name to sign
              </span>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(sanitizeNameInput(e.target.value))}
                maxLength={SIGNER_NAME_MAX}
                autoComplete="name"
                placeholder="Your full name"
                aria-label="Type your full name to sign"
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-lg text-white placeholder:text-white/20 outline-none focus:border-sky-400/60 focus:bg-white/[0.05]"
              />
              <span className="mt-2 block text-xs text-white/30">
                Recorded with the date, your IP address, and your browser as your electronic signature.
              </span>
            </label>

            {submitError && <p className="text-sm text-red-400 mb-4">{submitError}</p>}
            <PillCTA
              type="button"
              busy={submitting}
              disabled={!canSign || submitting}
              onClick={handleAgreeAndPay}
              size="lg"
            >
              {submitting ? 'Redirecting to payment…' : `Agree & Pay ${chargeLabel}`}
            </PillCTA>
          </>
        )}
      </div>
    </main>
  );
}
