'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ImageIcon, ExternalLink, Compass, Clock, Eye, Flame } from 'lucide-react';
import { Badge, Card, EmptyState, Kicker, PageIn, PageTitle, SearchFilter, matchesSearch } from '@/components/admin/ui';
import { PAIN_POINTS, parseSalesPoints, type PainPointKey } from '@/lib/leads';
import { formatCents } from '@/lib/pricing';
import { MockupDeliveryForm } from '@/components/admin/MockupDelivery';

interface QueueRow {
  id: string;
  company: string;
  contactName: string | null;
  mockupRequestedAt: string | null;
  hotLead: boolean;
  assignedTo: { name: string | null } | null;
  painPoints: string;
  salesNote: string | null;
  originalWebsite: string | null;
  currentSiteAssessment: string | null;
  customPainPoints: string | null;
  essentialPoints: string | null;
  estimateLowCents: number | null;
  estimateHighCents: number | null;
  estimatedValue: number | null;
}

/**
 * Everything needed to actually design the thing, read off the lead's own
 * dossier. Leads with what the mockup has to demonstrate, because that is the
 * promise it exists to make believable.
 */
function MockupBrief({ lead }: { lead: QueueRow }) {
  const essentials = parseSalesPoints(lead.essentialPoints);
  const written = parseSalesPoints(lead.customPainPoints);
  const ticked = lead.painPoints
    .split(',')
    .map((p) => p.trim())
    .filter((p): p is PainPointKey => p in PAIN_POINTS);

  const hasAnything =
    lead.originalWebsite ||
    lead.currentSiteAssessment ||
    essentials.length > 0 ||
    written.length > 0 ||
    ticked.length > 0 ||
    lead.salesNote;
  if (!hasAnything) return null;

  return (
    <div className="mt-3 space-y-3">
      {lead.originalWebsite && (
        <a
          href={lead.originalWebsite}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-400/10 px-3.5 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-400/20 transition-colors"
        >
          <Compass size={13} /> Open the site you&apos;re replacing <ExternalLink size={11} />
        </a>
      )}

      {lead.currentSiteAssessment && (
        <div className="rounded-xl bg-white/[0.03] px-3.5 py-3">
          <p className="text-[11px] uppercase tracking-wide text-white/40 font-semibold mb-1">
            What&apos;s wrong with it now
          </p>
          <p className="text-sm text-white/70 leading-relaxed break-words">{lead.currentSiteAssessment}</p>
        </div>
      )}

      {essentials.length > 0 && (
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-3.5 py-3">
          <p className="text-[11px] uppercase tracking-wide text-emerald-300/80 font-semibold mb-1.5">
            What the mockup has to show — this is what&apos;s being sold
          </p>
          <ul className="space-y-1">
            {essentials.slice(0, 8).map((e, i) => (
              <li key={i} className="text-sm text-emerald-50/85 leading-relaxed break-words">
                • {e.point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(written.length > 0 || ticked.length > 0) && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-red-300/70 font-semibold mb-1.5">
            Problems found
          </p>
          <div className="flex flex-wrap gap-1.5">
            {written.map((p, i) => (
              <span
                key={`w${i}`}
                className="rounded-md bg-red-400/10 border border-red-400/20 px-2 py-1 text-[11px] text-red-200"
              >
                {p.point}
              </span>
            ))}
            {ticked.map((k) => (
              <span
                key={k}
                className="rounded-md bg-white/[0.05] border border-white/10 px-2 py-1 text-[11px] text-white/55"
              >
                {PAIN_POINTS[k]}
              </span>
            ))}
          </div>
        </div>
      )}

      {lead.salesNote && (
        <p className="text-xs text-sky-200/70 leading-relaxed break-words">
          <span className="font-semibold text-sky-300/80">Note from sales: </span>
          {lead.salesNote}
        </p>
      )}

      {(lead.estimateLowCents || lead.estimatedValue) && (
        <p className="text-xs text-white/40 leading-relaxed">
          <span className="font-semibold text-white/60">Deal size: </span>
          {lead.estimateLowCents && lead.estimateHighCents
            ? `${formatCents(lead.estimateLowCents)} – ${formatCents(lead.estimateHighCents)}`
            : formatCents(lead.estimatedValue ?? lead.estimateLowCents ?? 0)}
          <span className="text-white/25"> — what tells you how much effort this justifies.</span>
        </p>
      )}
    </div>
  );
}

/** Whole days since the request — "waiting since yesterday" beats a raw date. */
function daysWaiting(requestedAt: string | null): number | null {
  if (!requestedAt) return null;
  const ms = Date.now() - new Date(requestedAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

interface LiveMockup {
  id: string;
  url: string;
  status: string;
  signal: string;
  viewCount: number;
  responseNote: string | null;
  expired: boolean;
  lead: { id: string; company: string; contactName: string | null; status: string; estimatedValue: number | null };
}

const LIVE_TONE: Record<string, string> = {
  sent: 'border-sky-400/25 bg-sky-400/[0.05]',
  viewed: 'border-purple-400/30 bg-purple-400/[0.06]',
  approved: 'border-emerald-400/30 bg-emerald-400/[0.06]',
  changes_requested: 'border-amber-400/30 bg-amber-400/[0.06]',
};

export default function MockupQueuePage() {
  const router = useRouter();
  const [leads, setLeads] = useState<QueueRow[]>([]);
  const [live, setLive] = useState<LiveMockup[]>([]);
  const [tab, setTab] = useState<'build' | 'out'>('build');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const load = async () => {
    try {
      const res = await fetch('/api/admin/leads/mockup-queue');
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setLeads(data.leads);
        setLive(data.live ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-white/40">Loading the mockup queue…</p>
      </div>
    );
  }

  const visible = leads.filter((l) => matchesSearch(search, l.company, l.contactName));
  // Approved and "changes asked" float up: both are somebody waiting on a
  // reply, and both go cold in a day.
  const liveVisible = [...live]
    .filter((m) => matchesSearch(search, m.lead.company, m.lead.contactName))
    .sort((a, b) => {
      const rank = (s: string) => (s === 'approved' ? 0 : s === 'changes_requested' ? 1 : s === 'viewed' ? 2 : 3);
      return rank(a.status) - rank(b.status);
    });
  const sortedByWait = [...visible].sort((a, b) => {
    if (a.hotLead !== b.hotLead) return a.hotLead ? -1 : 1;
    return (daysWaiting(a.mockupRequestedAt) ?? 0) - (daysWaiting(b.mockupRequestedAt) ?? 0) > 0 ? -1 : 1;
  });

  return (
    <PageIn className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-1">
        <Kicker className="mb-2">Sales</Kicker>
        <PageTitle icon={ImageIcon} title="Mockups" />
        <p className="text-sm text-white/45 mt-1">
          {tab === 'build'
            ? leads.length === 0
              ? 'Nothing waiting on a mockup right now.'
              : `${leads.length} ${leads.length === 1 ? 'lead is' : 'leads are'} waiting on a mockup, longest-waiting and hot leads first.`
            : liveVisible.length === 0
              ? 'Nothing out with a client yet. Send one from a lead and it appears here.'
              : `${liveVisible.length} out with clients. Anything opened is warm — ring it.`}
        </p>
      </div>

      {/* Two halves of one job. This page was named after mockups but only
          ever listed the ones still to build, so the moment a mockup was
          delivered it left the only screen named after it — and whether the
          client had opened it was nobody's screen at all. */}
      <div
        role="tablist"
        aria-label="Mockup views"
        className="mt-4 inline-flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1"
      >
        {(
          [
            ['build', 'To build', leads.length],
            ['out', 'Out with clients', live.length],
          ] as Array<['build' | 'out', string, number]>
        ).map(([key, label, count]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === key ? 'bg-white/[0.09] text-white' : 'text-white/45 hover:text-white/80 hover:bg-white/[0.04]'
            }`}
          >
            {label}
            {count > 0 && <span className="text-xs text-white/35">{count}</span>}
          </button>
        ))}
      </div>

      <div className="mt-5 mb-5">
        <SearchFilter
          value={search}
          onChange={setSearch}
          placeholder="Find a business..."
          count={visible.length}
          total={leads.length}
        />
      </div>

      {tab === 'out' ? (
        <div className="space-y-2">
          {liveVisible.length === 0 && (
            <Card className="p-4">
              <EmptyState icon={Eye} text="Nothing out with a client yet." tone="clear" />
            </Card>
          )}
          {liveVisible.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl border p-4 ${LIVE_TONE[m.status] ?? 'border-white/10 bg-white/[0.03]'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/admin/leads/${m.lead.id}`}
                    className="text-sm font-bold text-white/90 hover:underline break-words inline-flex items-center gap-1.5"
                  >
                    {m.lead.company}
                    <ExternalLink size={11} className="opacity-40" />
                  </Link>
                  <p className="text-xs mt-0.5 text-white/55">{m.signal}</p>
                  {m.responseNote && (
                    <p className="mt-2 text-xs italic text-white/60">&ldquo;{m.responseNote}&rdquo;</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {m.lead.estimatedValue ? (
                    <span className="text-xs text-white/35">{formatCents(m.lead.estimatedValue)}</span>
                  ) : null}
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/5 transition-colors"
                  >
                    Open
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
      {sortedByWait.length === 0 && !search && (
        <Card className="p-4">
          <EmptyState icon={ImageIcon} text="Nothing waiting on a mockup right now." tone="clear" />
        </Card>
      )}

      <div className="space-y-3">
        {sortedByWait.map((lead) => {
          const days = daysWaiting(lead.mockupRequestedAt);
          return (
            <div
              key={lead.id}
              className={`rounded-xl border p-4 min-w-0 ${
                lead.hotLead ? 'border-amber-400/25 bg-amber-400/[0.04]' : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <Link
                    href={`/admin/leads/${lead.id}`}
                    className="text-sm font-bold text-white/90 hover:underline break-words inline-flex items-center gap-1.5"
                  >
                    {lead.hotLead && <Flame size={13} className="text-amber-300 shrink-0" aria-label="Hot lead" />} {lead.company}
                    <ExternalLink size={11} className="opacity-40" />
                  </Link>
                  <p className="text-xs text-white/40 mt-0.5">
                    {days === null
                      ? 'Requested recently'
                      : days === 0
                      ? 'Requested today'
                      : `Waiting ${days} ${days === 1 ? 'day' : 'days'}`}
                    {lead.assignedTo?.name ? ` · ${lead.assignedTo.name}` : ''}
                  </p>
                </div>
                {days !== null && days >= 3 && (
                  <span className="shrink-0">
                    <Badge tone="red" solid>
                      <Clock size={11} className="inline align-[-1px] mr-1" aria-hidden="true" />
                      {days} days — sales is blocked
                    </Badge>
                  </span>
                )}
              </div>

              <MockupBrief lead={lead} />

              <div className="mt-4 pt-4 border-t border-white/[0.08]">
                <MockupDeliveryForm
                  leadId={lead.id}
                  onDelivered={() => setLeads((prev) => prev.filter((l) => l.id !== lead.id))}
                  placeholder="Paste the mockup link..."
                />
              </div>
            </div>
          );
        })}
      </div>
        </>
      )}
    </PageIn>
  );
}
