'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PillCTA, SectionTag } from '@/components/ui';

interface Proposal {
  company: string;
  contactName: string | null;
  serviceLabel: string;
  addOnLabels: string[];
  timelineLabel: string;
  totalPrice: number;
  chargeAmount: number;
  depositOnly: boolean;
  depositAmount: number;
  balanceAmount: number;
  alreadySigned: boolean;
  sections: Array<{ heading: string; paragraphs: string[] }>;
}

const money = (cents: number) => `$${(cents / 100).toLocaleString()}`;

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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

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
      const res = await fetch(
        `/api/public/leads/${leadId}/agree-and-pay?t=${encodeURIComponent(shareToken || '')}`,
        { method: 'POST' }
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

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 mb-8">
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-white/50 text-sm">Total project fee</span>
            <span className="text-lg font-semibold">{money(proposal.totalPrice)}</span>
          </div>
          {proposal.depositOnly ? (
            <>
              <div className="flex justify-between items-baseline mb-2 pt-2 border-t border-white/10">
                <span className="text-white/50 text-sm">Due now (deposit)</span>
                <span className="text-2xl font-bold text-sky-300">{money(proposal.depositAmount)}</span>
              </div>
              <p className="text-xs text-white/30">Balance of {money(proposal.balanceAmount)} due before launch.</p>
            </>
          ) : (
            <div className="flex justify-between items-baseline pt-2 border-t border-white/10">
              <span className="text-white/50 text-sm">Due now (full amount)</span>
              <span className="text-2xl font-bold text-sky-300">{money(proposal.chargeAmount)}</span>
            </div>
          )}
        </div>

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
            <p className="text-sm text-emerald-300 mb-4">
              ✓ You already agreed to these terms. Continue below to complete payment.
            </p>
            <PillCTA type="button" busy={submitting} disabled={submitting} onClick={handleAgreeAndPay} size="lg">
              {submitting ? 'Redirecting to payment…' : `Continue to Payment — ${money(proposal.chargeAmount)}`}
            </PillCTA>
          </>
        ) : (
          <>
            <label className="flex items-start gap-3 mb-6 cursor-pointer text-sm text-white/70">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5"
              />
              I have read and agree to the terms above, and understand that proceeding to payment
              constitutes acceptance of this agreement.
            </label>
            {submitError && <p className="text-sm text-red-400 mb-4">{submitError}</p>}
            <PillCTA
              type="button"
              busy={submitting}
              disabled={!agreed || submitting}
              onClick={handleAgreeAndPay}
              size="lg"
            >
              {submitting ? 'Redirecting to payment…' : `Agree & Pay ${money(proposal.chargeAmount)}`}
            </PillCTA>
          </>
        )}
      </div>
    </main>
  );
}
