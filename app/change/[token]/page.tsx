'use client';

import { use, useEffect, useState } from 'react';
import { PillCTA, SectionTag } from '@/components/ui';

interface ChangeItem {
  label: string;
  priceCents: number;
  kind: 'add' | 'remove';
  workStarted?: boolean;
  description?: string;
}

interface ScheduleLine {
  index: number;
  label: string;
  amountCents: number;
  frozen?: boolean;
}

interface ChangeOrder {
  number: string;
  summary: string;
  items: ChangeItem[];
  deltaCents: number;
  previousTotalCents: number;
  newTotalCents: number;
  timelineExtensionDays: number;
  status: string;
  schedule: ScheduleLine[];
  signedAt: string | null;
  signerName: string | null;
  company: string;
  contactName: string | null;
  projectName: string;
  statement: string;
}

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * The client's side of a Change Order.
 *
 * Section 9 requires the client to approve "the additional scope and fee in
 * writing" before any of it takes effect, so this page is a document with a
 * signature on it rather than a confirmation dialog. Everything the amendment
 * does is stated before the box: what is being added or removed, what the fee
 * was, what it becomes, how the remaining payments change, and how much
 * longer it takes.
 *
 * The revised schedule is the part most worth showing. A client told only
 * "your total is now $23,000" still has to work out what they will actually
 * be asked for and when — and a payment that turns out bigger than expected,
 * three weeks after agreeing to something, is where trust goes.
 */
export default function ChangeOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [order, setOrder] = useState<ChangeOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [signerName, setSignerName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declineNote, setDeclineNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState<'signed' | 'declined' | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/public/change/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (res.ok && data.success) setOrder(data.changeOrder);
        else setError(data.error || 'This link is no longer valid.');
      } catch {
        setError('Something went wrong loading this page.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const submit = async (decision: 'sign' | 'decline') => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`/api/public/change/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          decision === 'sign' ? { decision, signerName, agreed } : { decision, note: declineNote }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      setDone(decision === 'sign' ? 'signed' : 'declined');
    } catch {
      setSubmitError('Something went wrong. Please try again.');
    } finally {
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

  if (error || !order) {
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

  const settled = done !== null || order.status === 'signed' || order.status === 'declined';
  const wasSigned = done === 'signed' || order.status === 'signed';
  const up = order.deltaCents > 0;

  return (
    <main className="min-h-screen bg-[#05030a] text-white px-6 py-16 md:py-24">
      <div className="max-w-2xl mx-auto">
        <p className="font-bold tracking-tight mb-2">
          <span className="text-transparent" style={{ WebkitTextStroke: '1px rgba(125,211,252,0.9)' }}>
            both
          </span>
          made
        </p>
        <SectionTag className="mb-6">Change order {order.number}</SectionTag>

        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">{order.projectName}</h1>
        <p className="text-white/50 mb-10">For {order.company}</p>

        {settled && (
          <div className="mb-10 rounded-2xl border border-white/15 bg-white/[0.04] px-6 py-5">
            <p className="text-sm text-white/70">
              {wasSigned
                ? `Agreed${order.signerName ? ` by ${order.signerName}` : ''}. Your project total is now ${money(order.newTotalCents)}, and your remaining payments have been updated to match. There's nothing else to do here.`
                : "You've declined this change. Nothing about your project has changed. We'll be in touch."}
            </p>
          </div>
        )}

        <p className="mb-10 border-l-2 border-sky-400/60 pl-5 text-white/75 whitespace-pre-wrap">
          {order.summary}
        </p>

        {/* What is actually changing */}
        <SectionTag className="mb-5">What changes</SectionTag>
        <div className="space-y-3 mb-10">
          {order.items.map((item, i) => (
            <div
              key={`${item.label}-${i}`}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold">
                    <span
                      className={`mr-2 text-xs uppercase tracking-wider ${
                        item.kind === 'add' ? 'text-emerald-300' : 'text-amber-300'
                      }`}
                    >
                      {item.kind === 'add' ? 'Adding' : 'Removing'}
                    </span>
                    {item.label}
                  </p>
                  {item.description && (
                    <p className="mt-1.5 text-sm text-white/55">{item.description}</p>
                  )}
                  {/* Section 9: an item already started keeps its price. Said
                      plainly here, because a client who discovers it later
                      discovers it as a surprise on an invoice. */}
                  {item.kind === 'remove' && item.workStarted && (
                    <p className="mt-2 text-xs text-amber-200/70">
                      Work on this had already begun, so its price stays as agreed and we&apos;ll
                      deliver what exists of it.
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    item.kind === 'add'
                      ? 'text-emerald-300'
                      : item.workStarted
                        ? 'text-white/30'
                        : 'text-amber-300'
                  }`}
                >
                  {item.kind === 'add' ? '+' : item.workStarted ? '' : '−'}
                  {money(item.priceCents)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* The fee */}
        <SectionTag className="mb-5">What it costs</SectionTag>
        <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 md:p-8 mb-6">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between text-white/50">
              <dt>Project total was</dt>
              <dd className="tabular-nums">{money(order.previousTotalCents)}</dd>
            </div>
            <div className={`flex justify-between ${up ? 'text-emerald-300' : 'text-amber-300'}`}>
              <dt>This change</dt>
              <dd className="tabular-nums">
                {up ? '+' : '−'}
                {money(Math.abs(order.deltaCents))}
              </dd>
            </div>
            <div className="flex justify-between border-t border-white/10 pt-3 text-base font-bold">
              <dt>New project total</dt>
              <dd className="tabular-nums">{money(order.newTotalCents)}</dd>
            </div>
          </dl>
          {order.timelineExtensionDays > 0 && (
            <p className="mt-5 border-t border-white/10 pt-5 text-sm text-white/55">
              This adds {order.timelineExtensionDays} day
              {order.timelineExtensionDays === 1 ? '' : 's'} to the timeline.
            </p>
          )}
        </div>

        {/* The revised schedule — the part that answers "what will I be asked
            for, and when". */}
        {order.schedule.length > 0 && (
          <>
            <SectionTag className="mb-5">Your payments after this</SectionTag>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 mb-10">
              <dl className="space-y-3">
                {order.schedule.map((line) => (
                  <div key={line.index} className="flex items-baseline justify-between gap-4 text-sm">
                    <dt className="min-w-0 text-white/60">
                      {line.label}
                      {line.frozen && (
                        // `inline-block whitespace-nowrap` so the note wraps as
                        // one thing. Left as plain inline text it was a
                        // continuation of the label's line flow, so at 390px it
                        // split mid-phrase — "already settled" stayed on the
                        // label's line and "or invoiced" dropped underneath on
                        // its own, reading as a stray fragment against the next
                        // payment rather than as a note about this one.
                        <span className="ml-2 inline-block whitespace-nowrap text-xs text-white/30">
                          already settled or invoiced
                        </span>
                      )}
                    </dt>
                    {/* An amount must never wrap or be squeezed by a long
                        label — it is the number the client is checking. */}
                    <dd
                      className={`shrink-0 tabular-nums ${line.frozen ? 'text-white/40' : 'font-semibold'}`}
                    >
                      {money(line.amountCents)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 border-t border-white/10 pt-4 text-xs text-white/35">
                Anything already paid or already invoiced stays exactly as it was. Only the payments
                still ahead of you change.
              </p>
            </div>
          </>
        )}

        {!settled && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-8">
            {!declining ? (
              <>
                <label className="mb-2 block text-sm font-medium text-white/70">
                  Type your full name to sign
                </label>
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Your full name"
                  className="mb-4 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white placeholder:text-white/25 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                />
                <label className="mb-6 flex cursor-pointer items-start gap-3 text-sm text-white/60">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-1 shrink-0"
                  />
                  {/* The statement comes from the server, so a crafted request
                      cannot put different words in the client's mouth. */}
                  <span>{order.statement}</span>
                </label>

                <PillCTA
                  onClick={() => submit('sign')}
                  disabled={submitting || !signerName.trim() || !agreed}
                  busy={submitting}
                  size="lg"
                >
                  Agree to this change
                </PillCTA>

                {/*
                  `py-1` for the same reason as Logout in the portal header:
                  without it this measured 20px tall, under the 24px WCAG 2.5.8
                  asks for. It is the only way to say no on a document that
                  changes what somebody pays, which is a poor control to make
                  people aim at on a phone.
                */}
                <button
                  onClick={() => setDeclining(true)}
                  className="mt-4 block py-1 text-sm text-white/40 transition-colors hover:text-white/70"
                >
                  This isn&apos;t right — decline it
                </button>
              </>
            ) : (
              <>
                <p className="mb-3 text-sm text-white/70">
                  Tell us what&apos;s wrong and we&apos;ll sort it out. Nothing about your project
                  changes.
                </p>
                <textarea
                  value={declineNote}
                  onChange={(e) => setDeclineNote(e.target.value)}
                  rows={4}
                  placeholder="What doesn't look right?"
                  className="mb-4 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white placeholder:text-white/25 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                />
                <div className="flex flex-wrap gap-3">
                  <PillCTA onClick={() => submit('decline')} disabled={submitting} busy={submitting}>
                    Send this back
                  </PillCTA>
                  <button
                    onClick={() => setDeclining(false)}
                    className="text-sm text-white/40 transition-colors hover:text-white/70"
                  >
                    Never mind
                  </button>
                </div>
              </>
            )}

            {submitError && (
              <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/[0.06] px-4 py-3 text-sm text-red-300">
                {submitError}
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-xs text-white/30">
          This is an amendment to your project agreement. Nothing here takes effect, and no work on
          it begins, until you agree.
        </p>
      </div>
    </main>
  );
}
