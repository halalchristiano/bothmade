'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, ExternalLink, CheckCircle2, MessageSquare, PenTool, Send } from 'lucide-react';
import { Card, EmptyState, Kicker, PageIn, PageTitle, SearchFilter, matchesSearch } from '@/components/admin/ui';
import type { DesignStep } from '@/app/api/admin/design-queue/route';

/**
 * The design sequence, on one screen.
 *
 * Send it, wait, read what came back, send the next one. That is four steps
 * and it was spread across three screens, none of which showed the sequence
 * — where a project stood was answerable only by opening it.
 *
 * Ordered by who is waiting on whom. A project where the client has answered
 * and we owe them the next round is the most expensive thing here: their
 * clock has stopped, the payment gate behind it has stopped, and nothing is
 * chasing us. Then the ones with nothing sent at all, then the ones out for
 * review, then the settled ones for reference.
 */

interface DesignRow {
  id: string;
  name: string;
  company: string;
  contactName: string | null;
  designUrl: string | null;
  step: DesignStep;
  stage: { round: number; label: string; meaning: string; billable: boolean };
  nextStage: { round: number; label: string; meaning: string; billable: boolean };
  presentedAt: string | null;
  reviewEndsAt: string | null;
  approvedAt: string | null;
  deemed: boolean;
  revisions: { used: number; included: number; remaining: number; clientLine: string };
  latestFeedback: {
    id: string;
    round: number;
    createdAt: string;
    unread: boolean;
    liked: string | null;
    note: string | null;
  } | null;
}

const STEP_ORDER: Record<DesignStep, number> = {
  'changes-asked': 0,
  'to-send': 1,
  waiting: 2,
  approved: 3,
};

const STEP_LABEL: Record<DesignStep, string> = {
  'changes-asked': 'They answered — we owe them the next round',
  'to-send': 'Nothing sent yet',
  waiting: 'Out for review',
  approved: 'Approved',
};

const STEP_TONE: Record<DesignStep, string> = {
  'changes-asked': 'border-amber-400/30 bg-amber-400/[0.06]',
  'to-send': 'border-white/10 bg-white/[0.03]',
  waiting: 'border-sky-400/25 bg-sky-400/[0.05]',
  approved: 'border-emerald-400/25 bg-emerald-400/[0.05]',
};

const STEP_ICON: Record<DesignStep, typeof Clock> = {
  'changes-asked': MessageSquare,
  'to-send': Send,
  waiting: Clock,
  approved: CheckCircle2,
};

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const daysSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

export default function DesignPage() {
  const router = useRouter();
  const [rows, setRows] = useState<DesignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/design-queue');
        if (res.status === 401) {
          router.push('/admin/login');
          return;
        }
        const data = await res.json();
        if (data.success) setRows(data.projects);
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-white/40">Loading the design queue…</p>
      </div>
    );
  }

  const visible = rows
    .filter((r) => matchesSearch(search, r.company, r.name))
    .sort((a, b) => STEP_ORDER[a.step] - STEP_ORDER[b.step]);

  const owed = visible.filter((r) => r.step === 'changes-asked').length;

  return (
    <PageIn className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-10">
      <div className="mb-1">
        <Kicker className="mb-2">Delivery</Kicker>
        <PageTitle icon={PenTool} title="Design" />
        <p className="mt-1 text-sm text-white/45">
          {rows.length === 0
            ? 'No projects in design right now.'
            : owed > 0
              ? `${owed} waiting on us to send the next round — those are at the top. Their review clock has stopped, and so has the payment gate behind it.`
              : 'Send it, wait, read what came back, send the next one. Ordered by who is waiting on whom.'}
        </p>
      </div>

      <div className="mb-5 mt-5">
        <SearchFilter
          value={search}
          onChange={setSearch}
          placeholder="Find a project…"
          count={visible.length}
          total={rows.length}
        />
      </div>

      {visible.length === 0 && (
        <Card className="p-4">
          <EmptyState icon={PenTool} text="Nothing in design right now." tone="clear" />
        </Card>
      )}

      <div className="space-y-2">
        {visible.map((row) => {
          const Icon = STEP_ICON[row.step];
          return (
            <div key={row.id} className={`rounded-xl border p-4 ${STEP_TONE[row.step]}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/admin/projects/${row.id}`}
                    className="inline-flex items-center gap-1.5 break-words text-sm font-bold text-white/90 hover:underline"
                  >
                    {row.company}
                    <ExternalLink size={11} className="opacity-40" />
                  </Link>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/55">
                    <Icon size={12} />
                    {STEP_LABEL[row.step]}
                  </p>
                </div>
                {row.designUrl && (
                  <a
                    href={row.designUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/5"
                  >
                    Open the design
                  </a>
                )}
              </div>

              {/* Where they are in the sequence, in the same words the client
                  is given. The concept is not a revision, and both sides have
                  to be told the same thing about which round this is. */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-white/60">
                  {row.step === 'approved' || row.step === 'waiting'
                    ? row.stage.label
                    : `Next: ${row.nextStage.label}`}
                </span>
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-white/40">
                  {row.revisions.used} of {row.revisions.included} revision rounds used
                </span>
                {row.nextStage.billable && row.step !== 'approved' && (
                  <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-amber-200">
                    Next round is a change order
                  </span>
                )}
              </div>

              {row.step === 'waiting' && row.reviewEndsAt && (
                <p className="mt-2 text-xs text-white/45">
                  Sent {row.presentedAt ? dateLabel(row.presentedAt) : ''} — approved on its own on{' '}
                  {dateLabel(row.reviewEndsAt)} if they say nothing.
                </p>
              )}

              {row.step === 'approved' && row.approvedAt && (
                <p className="mt-2 text-xs text-white/45">
                  {row.deemed
                    ? `No reply by ${dateLabel(row.approvedAt)}, so it was approved under Section 4.`
                    : `Approved by the client on ${dateLabel(row.approvedAt)}.`}
                </p>
              )}

              {/* The feedback itself, not just the fact of it. The next round
                  gets built from this, and reading it should not require
                  opening another screen. */}
              {row.step === 'changes-asked' && row.latestFeedback && (
                <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[11px] uppercase tracking-wide text-white/40">
                    What they said {daysSince(row.latestFeedback.createdAt)}d ago
                    {row.latestFeedback.unread && (
                      <span className="ml-2 rounded bg-amber-400/20 px-1.5 py-0.5 text-amber-200">Unread</span>
                    )}
                  </p>
                  {row.latestFeedback.liked && (
                    <p className="mt-1.5 text-xs text-emerald-200/80">
                      <span className="text-white/40">Liked: </span>
                      {row.latestFeedback.liked}
                    </p>
                  )}
                  {row.latestFeedback.note && (
                    <p className="mt-1 text-xs text-white/60">{row.latestFeedback.note}</p>
                  )}
                  <Link
                    href={`/admin/projects/${row.id}`}
                    className="mt-2 inline-block text-[11px] font-medium text-sky-300 hover:text-sky-200"
                  >
                    Read it all and send {row.nextStage.label.toLowerCase()} →
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PageIn>
  );
}
