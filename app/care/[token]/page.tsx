'use client';

import { use, useEffect, useState } from 'react';
import { PillCTA, SectionTag } from '@/components/ui';

interface CareService {
  label: string;
  description: string;
  benefit: string;
  price: number;
  alreadyInScope: boolean;
}

interface CareOffer {
  status: string;
  company: string;
  contactName: string | null;
  projectName: string;
  planLabel: string;
  services: CareService[];
  note: string | null;
  monthlyCents: number;
  discountedCents: number;
  savingsPerMonth: number;
  firstYearSavings: number;
  freeMonths: number;
  discountMonths: number;
  standardRateFromMonth: number;
  scheduleLines: Array<{ period: string; detail: string }>;
}

const money = (cents: number) => `$${(cents / 100).toLocaleString()}`;

/**
 * The client's side of the care-plan upsell: what the plan covers, exactly
 * what it costs in each phase, and one button that opens Stripe.
 *
 * The schedule is the page rather than a footnote on it. The whole reason this
 * exists as a page instead of a bare payment link is that the price changes
 * twice over the first fifteen months — free, introductory, standard — and
 * someone agreeing to a recurring charge deserves to see all three before they
 * agree, not discover the third one on a statement a year later.
 */
export default function CarePlanOfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [offer, setOffer] = useState<CareOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  // True when the message came back because *we* are signed in — it carries
  // Stripe's own words, which a client must never be shown.
  const [errorIsForStaff, setErrorIsForStaff] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/public/care/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (res.ok && data.success) {
          setOffer(data.offer);
        } else {
          setError(data.error || 'This link is no longer valid.');
        }
      } catch {
        setError('Something went wrong loading this page.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const handleStart = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`/api/public/care/${encodeURIComponent(token)}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setSubmitError(data.error || 'Could not open checkout. Please try again.');
        setErrorIsForStaff(Boolean(data.staffOnly));
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

  if (error || !offer) {
    return (
      <main className="min-h-screen bg-[#05030a] text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/40 mb-4">
            Link not available
          </p>
          <h1 className="text-2xl font-bold mb-3">{error}</h1>
          <p className="text-white/50 text-sm">
            If you think this is a mistake, reply to the email this link came from and we&apos;ll
            sort it out.
          </p>
        </div>
      </main>
    );
  }

  const closed = offer.status !== 'sent';

  return (
    <main className="min-h-screen bg-[#05030a] text-white px-6 py-16 md:py-24">
      <div className="max-w-2xl mx-auto">
        <p className="font-bold tracking-tight mb-2">
          <span className="text-transparent" style={{ WebkitTextStroke: '1px rgba(125,211,252,0.9)' }}>
            both
          </span>
          made
        </p>
        <SectionTag className="mb-6">Ongoing care</SectionTag>

        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">{offer.planLabel}</h1>
        <p className="text-white/50 mb-10">
          For {offer.company} — {offer.projectName}
        </p>

        {closed && (
          <div className="mb-10 rounded-2xl border border-white/15 bg-white/[0.04] px-6 py-5">
            <p className="text-sm text-white/70">
              {offer.status === 'active'
                ? "This plan is already running — there's nothing more to do here."
                : 'This offer has been withdrawn. Get in touch and we can put a fresh one together.'}
            </p>
          </div>
        )}

        {offer.note && (
          <p className="mb-10 border-l-2 border-sky-400/60 pl-5 text-white/70 whitespace-pre-wrap">
            {offer.note}
          </p>
        )}

        {/* What it covers */}
        <div className="space-y-4 mb-12">
          {offer.services.map((service) => (
            <div
              key={service.label}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6"
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <h2 className="font-bold">{service.label}</h2>
                <span className="text-sm text-white/50 whitespace-nowrap">
                  {money(service.price)}/mo
                </span>
              </div>
              <p className="text-sm text-white/60 mb-2">{service.description}</p>
              <p className="text-sm text-sky-200/80">{service.benefit}</p>
              {service.alreadyInScope && (
                <p className="mt-3 text-xs text-white/40">
                  Already part of your project — this keeps it running.
                </p>
              )}
            </div>
          ))}
        </div>

        {/* The schedule — the part that matters most */}
        <SectionTag className="mb-5">What you pay</SectionTag>
        <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 md:p-8 mb-6">
          <dl className="space-y-4">
            {offer.scheduleLines.map((line) => (
              <div key={line.period} className="flex flex-col sm:flex-row sm:gap-6">
                <dt className="font-bold text-sm sm:w-40 shrink-0 mb-1 sm:mb-0">{line.period}</dt>
                <dd className="text-sm text-white/70">{line.detail}</dd>
              </div>
            ))}
          </dl>

          {offer.firstYearSavings > 0 && (
            <p className="mt-6 pt-6 border-t border-white/10 text-sky-300 font-semibold text-sm">
              {money(offer.firstYearSavings)} saved over the first year.
            </p>
          )}
        </div>

        <p className="text-sm text-white/40 mb-10">
          Monthly, cancel any time — reply to the email this came from and we&apos;ll stop it at
          the end of the month you&apos;ve paid for. The rate goes to {money(offer.monthlyCents)}
          /month from month {offer.standardRateFromMonth}; nothing changes without you seeing it
          here first. Billing is handled securely by Stripe, and we never see or store your card
          details.
        </p>

        {!closed && (
          <>
            <PillCTA onClick={handleStart} disabled={submitting} busy={submitting} size="lg">
              {offer.freeMonths > 0
                ? `Start the plan — first ${offer.freeMonths === 1 ? 'month' : `${offer.freeMonths} months`} free`
                : `Start the plan — ${money(offer.discountedCents)}/month`}
            </PillCTA>
            {submitting && (
              <p className="mt-4 text-sm text-white/40">Opening secure checkout…</p>
            )}
            {submitError && (
              <div
                className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                  errorIsForStaff
                    ? 'border-amber-400/30 bg-amber-400/[0.07] text-amber-200'
                    : 'border-red-400/30 bg-red-400/[0.06] text-red-300'
                }`}
              >
                <p>{submitError}</p>
                {errorIsForStaff && (
                  <p className="mt-1.5 text-xs text-amber-200/60">
                    You&apos;re seeing this because you&apos;re signed in to the admin. A client
                    would see a plain apology, not this.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
