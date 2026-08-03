'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  TrendingUp,
  Target,
  Trophy,
  Percent,
  Flame,
  AlertTriangle,
  Clock,
  XCircle,
  Radio,
  Building2,
  DollarSign,
  FolderKanban,
  UserPlus,
  Inbox,
  Wallet,
  Activity,
  FileSignature,
  MessageCircle,
  Megaphone,
  ArrowRight,
  Palette,
  Phone,
  Mail,
  RefreshCw,
  UserCog,
} from 'lucide-react';
import { TasksWidget } from '@/components/admin/TasksWidget';
import { LeadsSpreadsheet } from '@/components/admin/LeadsSpreadsheet';
import { LogTouchPopover } from '@/components/admin/LogTouchPopover';
import { SnoozeButton } from '@/components/admin/SnoozeButton';
import { UndoToast } from '@/components/admin/UndoToast';
import { MockupDeliveryForm } from '@/components/admin/MockupDelivery';
import { BroadcastForm, describeBroadcast } from '@/components/admin/BroadcastForm';
import { Card, CardHeader, StatRow, Badge, ListRow, EmptyState, PageIn, MiniBarChart } from '@/components/admin/ui';
import { formatCents } from '@/lib/pricing';
import { LEAD_STATUS_SHORT_LABELS } from '@/lib/leads';
import { USER_ROLE_LABELS, type UserRole } from '@/lib/roles';

type StatsRange = 'week' | 'month' | 'quarter';

const RANGE_OPTIONS: Array<{ value: StatsRange; label: string }> = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
];

function formatRelativeTime(date: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

function RefreshIndicator({
  lastUpdated,
  refreshing,
  onRefresh,
}: {
  lastUpdated: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [, forceTick] = useState(0);

  // Re-render every 30s so the "Xm ago" label stays current without a refetch.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <button
      onClick={onRefresh}
      disabled={refreshing}
      className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-60"
      title="Refresh dashboard data"
      aria-label="Refresh dashboard data"
    >
      <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
      {refreshing ? 'Refreshing…' : lastUpdated ? `Updated ${formatRelativeTime(lastUpdated)}` : ''}
    </button>
  );
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/[0.06] ${className}`} />;
}

/**
 * Shaped to roughly match the dashboard layout (header, stat row, card
 * grid) instead of a bare spinner — reduces the jarring "page replaced
 * with nothing" feel on first load.
 */
function DashboardSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex justify-between items-start mb-8">
        <div className="space-y-2">
          <SkeletonBlock className="h-4 w-16" />
          <SkeletonBlock className="h-8 w-64" />
          <SkeletonBlock className="h-4 w-48" />
        </div>
        <SkeletonBlock className="h-9 w-40 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-xl overflow-hidden mb-6 border border-white/[0.07]">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-5 bg-white/[0.02] space-y-2">
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="h-7 w-24" />
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        <SkeletonBlock className="lg:col-span-2 h-64 rounded-xl" />
        <SkeletonBlock className="h-64 rounded-xl" />
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <SkeletonBlock className="h-52 rounded-xl" />
        <SkeletonBlock className="h-52 rounded-xl" />
      </div>
    </div>
  );
}

function RangePicker({ range, onChange }: { range: StatsRange; onChange: (r: StatsRange) => void }) {
  return (
    <div className="inline-flex gap-1 rounded-xl border border-white/10 p-1 bg-white/[0.02]">
      {RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
            range === opt.value
              ? 'bg-gradient-to-r from-sky-400 to-purple-500 text-black shadow-sm'
              : 'text-white/40 hover:text-white/70'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface SalesStats {
  periodLabel: string;
  pipeline: Array<{ status: string; count: number; value: number }>;
  weightedForecast: number;
  totalPipelineValue: number;
  thisWeek: { newLeads: number; activityLogged: number; won: number; revenue: number };
  conversionRate: number;
  avgDealSize: number;
  lostReasonCounts: Record<string, number>;
  hotLeads: Array<{ id: string; company: string; estimatedValue: number | null; phone: string | null; email: string | null }>;
  followUpsToday: Array<{ id: string; company: string; phone: string | null; email: string | null }>;
  followUpsOverdue: Array<{ id: string; company: string; nextFollowUpAt: string; phone: string | null; email: string | null }>;
  staleLeads: Array<{ id: string; company: string; updatedAt: string; phone: string | null; email: string | null }>;
  stageAging: Array<{
    id: string;
    company: string;
    estimatedValue: number | null;
    phone: string | null;
    email: string | null;
    stageLabel: string;
    daysIdle: number;
  }>;
  awaitingSignature: Array<{ id: string; company: string; phone: string | null; email: string | null; daysWaiting: number }>;
  sourcePerformance: Array<{ source: string; total: number; won: number }>;
  clientTypeBreakdown: Record<string, number>;
  wonDeals: Array<{ id: string; company: string; value: number; wonAt: string }>;
  totalWonValue: number;
}

interface OpsStats {
  periodLabel: string;
  newHandoffs: Array<{
    id: string;
    name: string;
    company: string;
    contactName: string | null;
    createdAt: string;
    onboardingTotal: number;
    onboardingAnswered: number;
    handoffAcknowledgedAt: string | null;
    daysWaiting: number;
  }>;
  newClientsThisWeek: number;
  atRiskProjects: Array<{ id: string; name: string; company: string; status: string; daysSinceUpdate: number }>;
  waitingOnClient: Array<{
    id: string;
    name: string;
    company: string;
    daysSinceUpdate: number;
    daysSinceWeAsked: number | null;
  }>;
  overdueBalances: Array<{
    id: string;
    name: string;
    company: string;
    balanceDue: number;
    lastPaymentReminderSentAt: string | null;
  }>;
  projectsAwaitingReply: Array<{ id: string; name: string; company: string; waitHours: number }>;
  awaitingSignature: Array<{ id: string; company: string; updatedAt: string }>;
  pendingMockups: Array<{ id: string; company: string; mockupRequestedAt: string | null }>;
  revenueThisMonth: number;
  revenueLastMonth: number;
  revenueHistory: Array<{ label: string; value: number; year: number; month: number }>;
  activeProjectCount: number;
  activityFeed: Array<{
    type: 'message' | 'payment' | 'proposal';
    id: string;
    projectId: string | null;
    leadId?: string;
    label: string;
    preview: string;
    createdAt: string;
  }>;
}

// Commission split: Evan 25% · Kiana 25% · company 30% · taxes 20%.
const COMMISSION_RATE = 0.25;

const CLIENT_TIER_LABELS: Record<string, string> = {
  'startup-tier': 'Startup-tier',
  'smb-tier': 'SMB-tier',
  'enterprise-tier': 'Enterprise-tier',
  unscoped: 'Unscoped',
};

type ActionTone = 'red' | 'sky' | 'amber';

interface NextAction {
  id: string;
  company: string;
  reason: string;
  tone: ActionTone;
  meta: string;
  phone: string | null;
  email: string | null;
  previousNextFollowUpAt: string | null;
}

function NextActionsCard({ stats }: { stats: SalesStats }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const seen = new Set<string>();
  const actions: NextAction[] = [];

  for (const l of stats.followUpsOverdue) {
    if (seen.has(l.id) || dismissed.has(l.id)) continue;
    seen.add(l.id);
    actions.push({ id: l.id, company: l.company, reason: 'Overdue follow-up', tone: 'red', meta: new Date(l.nextFollowUpAt).toLocaleDateString(), phone: l.phone, email: l.email, previousNextFollowUpAt: l.nextFollowUpAt });
  }
  for (const l of stats.followUpsToday) {
    if (seen.has(l.id) || dismissed.has(l.id)) continue;
    seen.add(l.id);
    actions.push({ id: l.id, company: l.company, reason: 'Follow up today', tone: 'sky', meta: '', phone: l.phone, email: l.email, previousNextFollowUpAt: null });
  }
  for (const l of stats.hotLeads) {
    if (seen.has(l.id) || dismissed.has(l.id)) continue;
    seen.add(l.id);
    actions.push({ id: l.id, company: l.company, reason: 'Hot lead', tone: 'amber', meta: l.estimatedValue ? formatCents(l.estimatedValue) : '', phone: l.phone, email: l.email, previousNextFollowUpAt: null });
  }
  for (const l of stats.staleLeads) {
    if (seen.has(l.id) || dismissed.has(l.id)) continue;
    seen.add(l.id);
    actions.push({ id: l.id, company: l.company, reason: 'Going stale — 5+ days idle', tone: 'red', meta: new Date(l.updatedAt).toLocaleDateString(), phone: l.phone, email: l.email, previousNextFollowUpAt: null });
  }
  for (const l of stats.stageAging) {
    if (seen.has(l.id) || dismissed.has(l.id)) continue;
    seen.add(l.id);
    actions.push({ id: l.id, company: l.company, reason: `Stalled in ${l.stageLabel} — ${l.daysIdle}d idle`, tone: 'red', meta: l.estimatedValue ? formatCents(l.estimatedValue) : '', phone: l.phone, email: l.email, previousNextFollowUpAt: null });
  }

  return (
    <Card className="p-6" glow={actions.length > 0 ? 'amber' : undefined}>
      <CardHeader
        icon={Flame}
        tone="amber"
        title="Do This Next"
        subtitle="Every lead here needs a touch, ranked by urgency"
        action={actions.length > 0 ? <Badge solid tone={actions.length > 5 ? 'red' : 'amber'}>{actions.length}</Badge> : undefined}
      />
      {actions.length === 0 ? (
        <EmptyState icon={Flame} text="Nothing urgent — you're caught up." tone="clear" />
      ) : (
        <div className="space-y-0.5">
          {actions.map((a) => (
            <ListRow
              key={a.id}
              href={`/admin/leads/${a.id}`}
              title={a.company}
              subtitle={a.reason}
              trailing={
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {a.meta && <span className="text-white/40 text-xs whitespace-nowrap hidden sm:inline">{a.meta}</span>}
                  <Badge tone={a.tone}>{a.tone === 'red' ? 'urgent' : a.tone === 'sky' ? 'today' : 'hot'}</Badge>
                  {a.phone && (
                    <a
                      href={`tel:${a.phone}`}
                      title={`Call ${a.phone}`}
                      aria-label={`Call ${a.company}`}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-amber-300 transition-colors"
                    >
                      <Phone size={13} />
                    </a>
                  )}
                  {a.email && (
                    <a
                      href={`mailto:${a.email}`}
                      title={`Email ${a.email}`}
                      aria-label={`Email ${a.company}`}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-sky-300 transition-colors"
                    >
                      <Mail size={13} />
                    </a>
                  )}
                  <LogTouchPopover leadId={a.id} />
                  <SnoozeButton
                    leadId={a.id}
                    previousNextFollowUpAt={a.previousNextFollowUpAt}
                    onSnoozed={() => setDismissed((prev) => new Set(prev).add(a.id))}
                    onUndo={() =>
                      setDismissed((prev) => {
                        const next = new Set(prev);
                        next.delete(a.id);
                        return next;
                      })
                    }
                  />
                </div>
              }
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function InsightsCard({ stats }: { stats: SalesStats }) {
  const [tab, setTab] = useState<'lost' | 'source' | 'tier'>('lost');
  const tabs: Array<{ key: 'lost' | 'source' | 'tier'; label: string }> = [
    { key: 'lost', label: 'Lost Reasons' },
    { key: 'source', label: 'Sources' },
    { key: 'tier', label: 'Client Tier' },
  ];

  return (
    <Card className="p-6">
      <CardHeader
        icon={Radio}
        tone="purple"
        title="Insights"
        subtitle={
          tab === 'tier'
            ? 'Current active pipeline, by estimated deal size'
            : `Lost reasons and sources, ${stats.periodLabel.toLowerCase()}`
        }
      />
      <div className="flex gap-1.5 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-colors ${
              tab === t.key ? 'bg-purple-500/25 text-purple-200 ring-1 ring-purple-400/40' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'lost' &&
        (Object.keys(stats.lostReasonCounts).length === 0 ? (
          <EmptyState icon={XCircle} text={`No deals lost ${stats.periodLabel.toLowerCase()}.`} />
        ) : (
          <div className="space-y-2">
            {Object.entries(stats.lostReasonCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([reason, count]) => (
                <div key={reason} className="flex justify-between text-sm px-1">
                  <span className="text-white/70">{reason}</span>
                  <span className="text-white/40">{count}</span>
                </div>
              ))}
          </div>
        ))}

      {tab === 'source' &&
        (stats.sourcePerformance.length === 0 ? (
          <EmptyState icon={Radio} text={`No new leads ${stats.periodLabel.toLowerCase()}.`} />
        ) : (
          <div className="space-y-2">
            {stats.sourcePerformance.map((s) => (
              <div key={s.source} className="flex justify-between text-sm px-1">
                <span className="text-white/70">{s.source}</span>
                <span className="text-white/40">
                  {s.won}/{s.total} won
                </span>
              </div>
            ))}
          </div>
        ))}

      {tab === 'tier' &&
        (Object.keys(stats.clientTypeBreakdown).length === 0 ? (
          <EmptyState icon={Building2} text="No active leads yet." />
        ) : (
          <div className="space-y-2">
            {Object.entries(stats.clientTypeBreakdown).map(([tier, count]) => (
              <div key={tier} className="flex justify-between text-sm px-1">
                <span className="text-white/70">{CLIENT_TIER_LABELS[tier] || tier}</span>
                <span className="text-white/40">{count}</span>
              </div>
            ))}
          </div>
        ))}
    </Card>
  );
}

type WonDealsSort = 'recent' | 'value';

function WonDealsCard({ stats }: { stats: SalesStats }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<WonDealsSort>('recent');

  const deals = stats.wonDeals
    .filter((d) => d.company.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (sort === 'value' ? b.value - a.value : new Date(b.wonAt).getTime() - new Date(a.wonAt).getTime()));

  return (
    <Card className="p-6" glow="emerald">
      <CardHeader
        icon={DollarSign}
        tone="emerald"
        title="Won Deals"
        subtitle={`Your commission log · ${Math.round(COMMISSION_RATE * 100)}% of closed value`}
        action={
          <span className="text-sm text-emerald-300 font-semibold">
            {formatCents(Math.round(stats.totalWonValue * COMMISSION_RATE))}
          </span>
        }
      />
      {stats.wonDeals.length === 0 ? (
        <EmptyState icon={DollarSign} text="No deals closed yet." />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search company..."
              className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
            />
            <div className="flex gap-1 rounded-lg border border-white/10 p-1 bg-white/[0.02] shrink-0">
              {(['recent', 'value'] as WonDealsSort[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`text-xs px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    sort === s ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/40' : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {s === 'recent' ? 'Recent' : 'Value'}
                </button>
              ))}
            </div>
          </div>
          {deals.length === 0 ? (
            <p className="text-sm text-white/30 py-4 text-center">No deals match "{query}".</p>
          ) : (
            <div className="space-y-0.5 max-h-64 overflow-y-auto">
              {deals.map((d) => (
                <ListRow
                  key={d.id}
                  href={`/admin/leads/${d.id}`}
                  title={d.company}
                  subtitle={`Deal value ${formatCents(d.value)}`}
                  trailing={
                    <span className="text-white/40 text-xs whitespace-nowrap">
                      <span className="text-emerald-300/80 font-medium">
                        {formatCents(Math.round(d.value * COMMISSION_RATE))}
                      </span>{' '}
                      · {new Date(d.wonAt).toLocaleDateString()}
                    </span>
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * The first thing a rep should see: how many businesses are waiting on a
 * call, and a way straight into them.
 *
 * The dashboard opened on pipeline value and conversion rate — useful to an
 * owner, and not an answer to "what do I do now". Reads the same endpoint the
 * call list does, so the numbers here and the list there can't disagree.
 */
function CallListBanner() {
  const [counts, setCounts] = useState<{ bounced: number; overdue: number; today: number; total: number } | null>(
    null
  );

  useEffect(() => {
    fetch('/api/admin/leads/call-list')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.success) return;
        const rows: Array<{ reason: string }> = d.callable ?? [];
        setCounts({
          bounced: rows.filter((r) => r.reason === 'bounced').length,
          overdue: rows.filter((r) => r.reason === 'overdue').length,
          today: rows.filter((r) => r.reason === 'today').length,
          total: rows.length,
        });
      })
      .catch(() => {});
  }, []);

  if (!counts) return null;

  if (counts.total === 0) {
    return (
      <Link
        href="/admin/call-list"
        className="block mb-6 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 hover:bg-white/[0.05] transition-colors"
      >
        <p className="text-sm font-semibold text-white/70">Nothing waiting on a call right now.</p>
        <p className="text-xs text-white/40 mt-0.5">Every lead is booked for later, won, or closed off.</p>
      </Link>
    );
  }

  const urgent = counts.bounced + counts.overdue;

  return (
    <Link
      href="/admin/call-list"
      className={`block mb-6 rounded-2xl border px-5 py-4 transition-colors ${
        urgent > 0
          ? 'border-amber-400/30 bg-amber-400/[0.08] hover:bg-amber-400/[0.13]'
          : 'border-sky-400/25 bg-sky-400/[0.07] hover:bg-sky-400/[0.12]'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold text-white/90">
            <Phone size={14} />
            {counts.total} {counts.total === 1 ? 'business' : 'businesses'} to call
          </p>
          <p className="text-xs text-white/50 mt-1 leading-relaxed">
            {[
              counts.bounced > 0 && `${counts.bounced} whose email bounced — phone is the only way in`,
              counts.overdue > 0 && `${counts.overdue} overdue`,
              counts.today > 0 && `${counts.today} due today`,
            ]
              .filter(Boolean)
              .join(' · ') || 'Nothing urgent — work down the list when you can.'}
          </p>
        </div>
        <span className="shrink-0 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 text-sm font-semibold text-black">
          Start calling
        </span>
      </div>
    </Link>
  );
}

function SalesDashboard({
  stats,
  name,
  range,
  onRangeChange,
  lastUpdated,
  refreshing,
  onRefresh,
}: {
  stats: SalesStats;
  name: string;
  range: StatsRange;
  onRangeChange: (r: StatsRange) => void;
  lastUpdated: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const maxPipelineValue = Math.max(...stats.pipeline.map((p) => p.value), 1);

  return (
    <PageIn className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-2">
        <div>
          <p className="text-sm text-sky-300/70 font-medium mb-1">Sales</p>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Welcome back, {name}</h1>
          <p className="text-white/40">Here's where your pipeline stands.</p>
        </div>
        <RangePicker range={range} onChange={onRangeChange} />
      </div>
      <div className="flex justify-end mb-6">
        <RefreshIndicator lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={onRefresh} />
      </div>

      <CallListBanner />

      <div className="mb-6">
        <StatRow
          items={[
            { icon: TrendingUp, label: 'Pipeline Value', value: formatCents(stats.totalPipelineValue), tone: 'sky' },
            { icon: Target, label: 'Weighted Forecast', value: formatCents(stats.weightedForecast), tone: 'purple', accent: true },
            { icon: Trophy, label: `Won ${stats.periodLabel}`, value: formatCents(stats.thisWeek.revenue), tone: 'emerald' },
            { icon: Percent, label: 'Conversion Rate', value: `${Math.round(stats.conversionRate * 100)}%`, tone: 'amber' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <Card className="lg:col-span-2 p-6">
          <CardHeader icon={FolderKanban} tone="sky" title="Pipeline by Stage" action={<Link href="/admin/pipeline" className="text-xs text-sky-300/70 hover:text-sky-300">Full board →</Link>} />
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {stats.pipeline
              .filter((p) => p.count > 0)
              .map((p) => (
                <Link
                  key={p.status}
                  href="/admin/pipeline"
                  className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition-colors"
                >
                  <span className="w-28 shrink-0 text-xs text-white/50 truncate">
                    {LEAD_STATUS_SHORT_LABELS[p.status as keyof typeof LEAD_STATUS_SHORT_LABELS] || p.status}
                  </span>
                  <span className="w-6 shrink-0 text-sm font-semibold text-right">{p.count}</span>
                  <div className="flex-1 bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-sky-400 to-purple-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.max((p.value / maxPipelineValue) * 100, p.value > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-xs text-white/40 text-right">{formatCents(p.value)}</span>
                </Link>
              ))}
            {stats.pipeline.every((p) => p.count === 0) && (
              <p className="text-sm text-white/30 py-4 text-center">Nothing in the pipeline yet.</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-white/[0.07] text-sm">
            <div>
              <p className="text-white/40 text-xs mb-1">Avg Deal Size</p>
              <p className="font-semibold">{formatCents(stats.avgDealSize)}</p>
            </div>
            <div>
              <p className="text-white/40 text-xs mb-1">New Leads {stats.periodLabel}</p>
              <p className="font-semibold">{stats.thisWeek.newLeads}</p>
            </div>
            <div>
              <p className="text-white/40 text-xs mb-1">Activity Logged</p>
              <p className="font-semibold">{stats.thisWeek.activityLogged}</p>
            </div>
          </div>
        </Card>

        <TasksWidget />
      </div>

      <div className="mb-5">
        <NextActionsCard stats={stats} />
      </div>

      {stats.awaitingSignature.length > 0 && (
        <div className="mb-5">
          <Card className="p-6" glow="amber">
            <CardHeader
              icon={FileSignature}
              tone="amber"
              title="Awaiting Signature"
              subtitle="Contracts sitting with the client, unsigned"
              action={<Badge tone="amber">{stats.awaitingSignature.length}</Badge>}
            />
            <div className="space-y-0.5">
              {stats.awaitingSignature.map((l) => (
                <ListRow
                  key={l.id}
                  href={`/admin/leads/${l.id}`}
                  title={l.company}
                  subtitle={`Waiting ${l.daysWaiting}d`}
                  trailing={
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {l.phone && (
                        <a
                          href={`tel:${l.phone}`}
                          title={`Call ${l.phone}`}
                          aria-label={`Call ${l.company}`}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-amber-300 transition-colors"
                        >
                          <Phone size={13} />
                        </a>
                      )}
                      {l.email && (
                        <a
                          href={`mailto:${l.email}`}
                          title={`Email ${l.email}`}
                          aria-label={`Email ${l.company}`}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-sky-300 transition-colors"
                        >
                          <Mail size={13} />
                        </a>
                      )}
                    </div>
                  }
                />
              ))}
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        <InsightsCard stats={stats} />

        <WonDealsCard stats={stats} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/pipeline"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 text-black font-semibold hover:opacity-90 transition-opacity"
        >
          View Pipeline <ArrowRight size={16} />
        </Link>
        <Link
          href="/admin/team-chat"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/15 font-semibold hover:bg-white/5 transition-colors"
        >
          Team Chat
        </Link>
      </div>
    </PageIn>
  );
}

function BroadcastComposer() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/15 font-semibold hover:bg-white/5 transition-colors"
      >
        <Megaphone size={16} />
        Broadcast to Clients
      </button>
    );
  }

  return (
    <Card className="p-6 mb-6">
      <div className="flex justify-between items-center mb-3">
        <CardHeader icon={Megaphone} tone="purple" title="Broadcast to All Active Clients" />
        <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white text-sm -mt-4">
          Cancel
        </button>
      </div>
      <BroadcastForm
        endpoint="/api/admin/broadcast"
        body={{ segment: 'active' }}
        placeholder="e.g. We'll be closed for the holiday on Dec 25 — replies may be a day slower than usual."
        submitLabel="Send to All Active Clients"
        describeResult={describeBroadcast}
      />
    </Card>
  );
}

function MockupRequestRow({
  request,
  onDelivered,
}: {
  request: { id: string; company: string; mockupRequestedAt: string | null };
  onDelivered: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-white/10 px-3 py-2.5">
      <div className="flex justify-between items-center gap-2">
        <Link href={`/admin/leads/${request.id}`} className="text-sm font-medium hover:underline">
          {request.company}
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/30 whitespace-nowrap">
            {request.mockupRequestedAt ? new Date(request.mockupRequestedAt).toLocaleDateString() : ''}
          </span>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="text-xs px-2.5 py-1 rounded-lg border border-white/20 hover:bg-white/5 transition-colors whitespace-nowrap"
          >
            {open ? 'Cancel' : 'Add Link'}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-2">
          <MockupDeliveryForm
            leadId={request.id}
            onDelivered={() => {
              setOpen(false);
              onDelivered();
            }}
            submitLabel="Deliver"
            size="sm"
            autoFocus
          />
        </div>
      )}
    </div>
  );
}

function HandoffRow({
  handoff,
  onAcknowledged,
  onUnacknowledged,
}: {
  handoff: OpsStats['newHandoffs'][number];
  onAcknowledged: () => void;
  onUnacknowledged?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showUndo, setShowUndo] = useState(false);

  const setAcknowledged = async (acknowledgeHandoff: boolean) => {
    const res = await fetch(`/api/projects/${handoff.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acknowledgeHandoff }),
    });
    return res.ok;
  };

  const handleAcknowledge = async () => {
    setSaving(true);
    setError('');
    try {
      const ok = await setAcknowledged(true);
      if (ok) {
        onAcknowledged();
        setShowUndo(true);
      } else {
        setError("Couldn't mark this picked up — try again.");
      }
    } catch {
      setError('Could not reach the server — check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    const ok = await setAcknowledged(false);
    if (ok) onUnacknowledged?.();
  };

  return (
    <div className="rounded-xl border border-white/10 px-3 py-2.5">
      {showUndo && (
        <UndoToast
          message={`Picked up ${handoff.company}`}
          onUndo={handleUndo}
          onDismiss={() => setShowUndo(false)}
        />
      )}
      <div className="flex justify-between items-center gap-2">
        <Link href={`/admin/projects/${handoff.id}`} className="text-sm font-medium hover:underline truncate">
          {handoff.company}
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          {handoff.onboardingTotal > 0 && (
            <Badge tone={handoff.onboardingAnswered === handoff.onboardingTotal ? 'emerald' : 'amber'}>
              Onboarding {handoff.onboardingAnswered}/{handoff.onboardingTotal}
            </Badge>
          )}
          {handoff.handoffAcknowledgedAt ? (
            <Badge tone="emerald">Picked up</Badge>
          ) : (
            <>
              {handoff.daysWaiting >= 2 && (
                <Badge tone={handoff.daysWaiting >= 4 ? 'red' : 'amber'} solid>
                  Waiting {handoff.daysWaiting}d
                </Badge>
              )}
              <button
                onClick={handleAcknowledge}
                disabled={saving}
                className="text-xs px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-400 to-sky-500 text-black font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                {saving ? 'Saving...' : "I've got this"}
              </button>
            </>
          )}
        </div>
      </div>
      <p className="text-xs text-white/30 mt-1">{handoff.name}</p>
      {error && <p className="text-xs text-red-300 mt-1">{error}</p>}
    </div>
  );
}

interface RevenueBreakdownPayment {
  id: string;
  amount: number;
  type: string;
  createdAt: string;
  projectId: string;
  projectName: string;
  company: string;
}

function RevenueChartCard({ revenueHistory }: { revenueHistory: OpsStats['revenueHistory'] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [payments, setPayments] = useState<RevenueBreakdownPayment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBarClick = async (index: number) => {
    if (selectedIndex === index) {
      setSelectedIndex(null);
      setPayments(null);
      return;
    }
    setSelectedIndex(index);
    setPayments(null);
    setError(null);
    setLoading(true);
    const bar = revenueHistory[index];
    try {
      const res = await fetch(`/api/admin/revenue-breakdown?year=${bar.year}&month=${bar.month}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load breakdown.');
      setPayments(data.payments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load breakdown.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 mb-5">
      <CardHeader icon={TrendingUp} tone="emerald" title="Revenue — Last 6 Months" subtitle="Click a bar to see what made up that month" />
      <MiniBarChart data={revenueHistory} formatValue={(v) => formatCents(v)} onBarClick={handleBarClick} selectedIndex={selectedIndex} />

      {selectedIndex !== null && (
        <div className="mt-5 pt-5 border-t border-white/[0.07]">
          <p className="text-xs text-white/40 mb-3">{revenueHistory[selectedIndex].label} payments</p>
          {loading && <p className="text-sm text-white/30 py-2">Loading...</p>}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-300/80">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          {payments && payments.length === 0 && <p className="text-sm text-white/30 py-2">No payments that month.</p>}
          {payments && payments.length > 0 && (
            <div className="space-y-0.5 max-h-56 overflow-y-auto">
              {payments.map((p) => (
                <ListRow
                  key={p.id}
                  href={`/admin/projects/${p.projectId}`}
                  title={p.company}
                  subtitle={`${p.projectName} · ${p.type}`}
                  trailing={
                    <span className="text-white/40 text-xs whitespace-nowrap">
                      <span className="text-emerald-300/80 font-medium">{formatCents(p.amount)}</span> ·{' '}
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

type OverdueSort = 'amount' | 'name';

// Reminders sent under this long ago don't need a second confirmation — long
// enough that a same-session double-click is still caught, short enough that
// legitimately reminding again tomorrow doesn't feel like fighting the UI.
const REMINDER_COOLDOWN_HOURS = 24;

function RemindButton({
  projectId,
  lastSentAt,
}: {
  projectId: string;
  lastSentAt: string | null;
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [confirming, setConfirming] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(lastSentAt);

  const hoursSinceSent = sentAt ? (Date.now() - new Date(sentAt).getTime()) / (1000 * 60 * 60) : Infinity;
  const recentlyReminded = hoursSinceSent < REMINDER_COOLDOWN_HOURS;

  const send = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
    setState('sending');
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/payment-reminder`, { method: 'POST' });
      if (res.ok) {
        setState('sent');
        setSentAt(new Date().toISOString());
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  };

  if (state === 'sent') return <span className="text-[11px] text-emerald-300/80 whitespace-nowrap">Reminder sent</span>;

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <span className="text-[11px] text-amber-200/70 whitespace-nowrap">Already reminded — again?</span>
        <button
          onClick={send}
          className="text-[11px] px-2 py-1 rounded-md border border-amber-400/40 text-amber-200 hover:bg-amber-400/10 transition-colors"
        >
          Yes
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirming(false);
          }}
          className="text-[11px] px-2 py-1 rounded-md border border-white/15 text-white/50 hover:bg-white/5 transition-colors"
        >
          No
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={(e) => {
        if (recentlyReminded) {
          e.preventDefault();
          e.stopPropagation();
          setConfirming(true);
          return;
        }
        send(e);
      }}
      disabled={state === 'sending'}
      title={recentlyReminded ? `Reminded ${formatRelativeTime(new Date(sentAt!))}` : undefined}
      className={`text-[11px] px-2 py-1 rounded-md border font-medium whitespace-nowrap transition-colors disabled:opacity-50 ${
        state === 'error'
          ? 'border-red-400/30 text-red-300 hover:bg-red-400/10'
          : 'border-white/15 text-white/50 hover:text-amber-200 hover:border-amber-400/30 hover:bg-amber-400/10'
      }`}
    >
      {state === 'sending'
        ? 'Sending…'
        : state === 'error'
          ? 'Failed — retry'
          : recentlyReminded
            ? `Reminded ${formatRelativeTime(new Date(sentAt!))}`
            : 'Remind'}
    </button>
  );
}

function OverdueBalancesCard({ balances }: { balances: OpsStats['overdueBalances'] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<OverdueSort>('amount');

  const filtered = balances
    .filter((p) => p.company.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (sort === 'amount' ? b.balanceDue - a.balanceDue : a.company.localeCompare(b.company)));

  return (
    <Card className="p-6">
      <CardHeader icon={Wallet} tone="amber" title="Overdue Balances" />
      {balances.length === 0 ? (
        <EmptyState icon={Wallet} text="Nothing outstanding." tone="clear" />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search company..."
              className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
            />
            <div className="flex gap-1 rounded-lg border border-white/10 p-1 bg-white/[0.02] shrink-0">
              {(['amount', 'name'] as OverdueSort[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`text-xs px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    sort === s ? 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/40' : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {s === 'amount' ? 'Amount' : 'Name'}
                </button>
              ))}
            </div>
          </div>
          {filtered.length === 0 ? (
            <p className="text-sm text-white/30 py-4 text-center">No matches for "{query}".</p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((p) => (
                <ListRow
                  key={p.id}
                  href={`/admin/projects/${p.id}`}
                  title={p.company}
                  trailing={
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Badge tone="amber">{formatCents(p.balanceDue)}</Badge>
                      <RemindButton projectId={p.id} lastSentAt={p.lastPaymentReminderSentAt} />
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

const PAGE_SIZE = 10;

function ShowMoreButton({ remaining, onClick }: { remaining: number; onClick: () => void }) {
  if (remaining <= 0) return null;
  return (
    <button
      onClick={onClick}
      className="w-full mt-2 text-xs text-white/40 hover:text-white/70 font-medium py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
    >
      Show {Math.min(remaining, PAGE_SIZE)} more ({remaining} left)
    </button>
  );
}

function AtRiskProjectsCard({ projects }: { projects: OpsStats['atRiskProjects'] }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const shown = projects.slice(0, visible);

  return (
    <Card className="p-6" glow="red">
      <CardHeader
        icon={AlertTriangle}
        tone="red"
        title="Needs you"
        subtitle="Stalled 7+ days and the ball is with us"
      />
      {projects.length === 0 ? (
        <EmptyState icon={AlertTriangle} text="Everything's current." tone="clear" />
      ) : (
        <>
          <div className="space-y-0.5">
            {shown.map((p) => (
              <ListRow key={p.id} href={`/admin/projects/${p.id}`} title={p.company} trailing={<Badge tone="red">{p.daysSinceUpdate}d</Badge>} />
            ))}
          </div>
          <ShowMoreButton remaining={projects.length - visible} onClick={() => setVisible((v) => v + PAGE_SIZE)} />
        </>
      )}
    </Card>
  );
}

/**
 * Projects stalled because the client hasn't come back, kept apart from the
 * ones stalled on us. Same symptom, opposite action: these need chasing, not
 * working on, and a rep-style guilt list buries that distinction.
 */
function WaitingOnClientCard({ projects }: { projects: OpsStats['waitingOnClient'] }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const shown = projects.slice(0, visible);

  return (
    <Card className="p-6" glow="amber">
      <CardHeader
        icon={Clock}
        tone="amber"
        title="Waiting on them"
        subtitle="You asked, they haven't come back — chase these"
      />
      {projects.length === 0 ? (
        <EmptyState icon={Clock} text="Nobody's holding you up." />
      ) : (
        <>
          <div className="space-y-0.5">
            {shown.map((p) => (
              <ListRow
                key={p.id}
                href={`/admin/projects/${p.id}`}
                title={p.company}
                subtitle={
                  p.daysSinceWeAsked !== null
                    ? `You messaged ${p.daysSinceWeAsked === 0 ? 'today' : `${p.daysSinceWeAsked}d ago`}`
                    : undefined
                }
                trailing={<Badge tone="amber">{p.daysSinceUpdate}d</Badge>}
              />
            ))}
          </div>
          <ShowMoreButton remaining={projects.length - visible} onClick={() => setVisible((v) => v + PAGE_SIZE)} />
        </>
      )}
    </Card>
  );
}

function ActivityFeedCard({ activity }: { activity: OpsStats['activityFeed'] }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const shown = activity.slice(0, visible);

  return (
    <Card className="lg:col-span-2 p-6">
      <CardHeader icon={Activity} tone="sky" title="Activity Feed" />
      {activity.length === 0 ? (
        <EmptyState icon={Activity} text="Nothing new." />
      ) : (
        <>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {shown.map((a) => (
              <Link
                key={`${a.type}-${a.id}`}
                href={a.projectId ? `/admin/projects/${a.projectId}` : a.leadId ? `/admin/leads/${a.leadId}` : '#'}
                className="block px-3 py-2.5 rounded-xl hover:bg-white/[0.05] border-l-2 border-sky-400/40 transition-colors"
              >
                <div className="flex justify-between items-start gap-2">
                  <p className="text-sm font-medium">{a.label}</p>
                  <span className="text-[10px] text-white/30 whitespace-nowrap">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-white/40 mt-0.5">{a.preview}</p>
              </Link>
            ))}
          </div>
          <ShowMoreButton remaining={activity.length - visible} onClick={() => setVisible((v) => v + PAGE_SIZE)} />
        </>
      )}
    </Card>
  );
}

interface TeamMemberSummary {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

/**
 * Who's on the team, and whether the roles are actually wired up.
 *
 * The warning is the reason this is on the dashboard rather than only on
 * /admin/team: inbound leads are assigned to whoever holds `sales`, and with
 * nobody holding it they arrive unassigned and silently miss the call list
 * and the daily follow-up digest. That is invisible from every other screen —
 * the leads are all there, they just never reach anyone.
 */
function TeamCard() {
  const [members, setMembers] = useState<TeamMemberSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.users) setMembers(d.users);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const missingSales = loaded && members.length > 0 && !members.some((m) => m.role === 'sales');

  return (
    <Card className="p-6" glow={missingSales ? 'amber' : undefined}>
      <CardHeader
        icon={UserCog}
        tone={missingSales ? 'amber' : 'purple'}
        title="Team"
        subtitle={loaded ? `${members.length} account${members.length === 1 ? '' : 's'}` : 'Loading…'}
        action={
          <Link href="/admin/team" className="text-xs text-sky-300/70 hover:text-sky-300">
            Manage →
          </Link>
        }
      />

      {missingSales && (
        <p className="text-[13px] text-amber-200/80 mb-4 leading-relaxed">
          Nobody has the Sales role, so inbound leads arrive unassigned and stay out of the
          call list and daily follow-ups.{' '}
          <Link href="/admin/team" className="underline hover:text-amber-100">
            Assign it
          </Link>
          .
        </p>
      )}

      <div className="space-y-1">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-sm text-white/80 truncate">{m.name || m.email}</span>
            <Badge tone={m.role === 'sales' ? 'sky' : m.role === 'owner' ? 'purple' : 'neutral'}>
              {USER_ROLE_LABELS[m.role as UserRole] ?? m.role}
            </Badge>
          </div>
        ))}
        {loaded && members.length === 0 && (
          <p className="text-sm text-white/40">Nobody yet.</p>
        )}
      </div>
    </Card>
  );
}

function OpsDashboard({
  stats,
  name,
  showLeadsSpreadsheet,
  range,
  onRangeChange,
  lastUpdated,
  refreshing,
  onRefresh,
}: {
  stats: OpsStats;
  name: string;
  showLeadsSpreadsheet: boolean;
  range: StatsRange;
  onRangeChange: (r: StatsRange) => void;
  lastUpdated: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [pendingMockups, setPendingMockups] = useState(stats.pendingMockups);
  const [newHandoffs, setNewHandoffs] = useState(stats.newHandoffs);
  const revenueTrend =
    stats.revenueLastMonth > 0
      ? Math.round(((stats.revenueThisMonth - stats.revenueLastMonth) / stats.revenueLastMonth) * 100)
      : undefined;

  return (
    <PageIn className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-2">
        <div>
          <p className="text-sm text-purple-300/70 font-medium mb-1">Operations</p>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Welcome back, {name}</h1>
          <p className="text-white/40">Here's what needs you today.</p>
        </div>
        <div className="flex items-center gap-3">
          <RangePicker range={range} onChange={onRangeChange} />
          <BroadcastComposer />
        </div>
      </div>
      <div className="flex justify-end mb-6">
        <RefreshIndicator lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={onRefresh} />
      </div>

      {pendingMockups.length > 0 && (
        <Card className="p-6 mb-6" glow="amber">
          <CardHeader
            icon={Palette}
            tone="amber"
            title="Mockup Requests"
            subtitle="Evan's waiting on these"
            action={
              <Link href="/admin/mockup-queue" className="text-xs text-amber-300/70 hover:text-amber-300">
                Full briefs →
              </Link>
            }
          />
          <div className="space-y-2">
            {pendingMockups.map((r) => (
              <MockupRequestRow
                key={r.id}
                request={r}
                onDelivered={() => setPendingMockups((prev) => prev.filter((p) => p.id !== r.id))}
              />
            ))}
          </div>
        </Card>
      )}

      <div className="mb-6">
        <StatRow
          items={[
            { icon: FolderKanban, label: 'Active Projects', value: String(stats.activeProjectCount), tone: 'sky' },
            {
              icon: DollarSign,
              label: `Revenue ${stats.periodLabel}`,
              value: formatCents(stats.revenueThisMonth),
              tone: 'emerald',
              accent: true,
              trend: revenueTrend !== undefined ? { value: revenueTrend } : undefined,
              note: `Your cut (${Math.round(COMMISSION_RATE * 100)}%): ${formatCents(Math.round(stats.revenueThisMonth * COMMISSION_RATE))}`,
            },
            { icon: UserPlus, label: `New Clients ${stats.periodLabel}`, value: String(stats.newClientsThisWeek), tone: 'purple' },
            { icon: FileSignature, label: 'Awaiting Signature', value: String(stats.awaitingSignature.length), tone: 'amber' },
          ]}
        />
      </div>

      <RevenueChartCard revenueHistory={stats.revenueHistory} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <Card className="p-6" glow="emerald">
          <CardHeader icon={Inbox} tone="emerald" title="New Handoffs" subtitle="Give them a first touch" />
          {newHandoffs.length === 0 ? (
            <EmptyState icon={Inbox} text="Nothing waiting to be picked up." />
          ) : (
            <div className="space-y-2">
              {newHandoffs.map((p) => (
                <HandoffRow
                  key={p.id}
                  handoff={p}
                  onAcknowledged={() =>
                    setNewHandoffs((prev) =>
                      prev.map((h) => (h.id === p.id ? { ...h, handoffAcknowledgedAt: new Date().toISOString() } : h))
                    )
                  }
                  onUnacknowledged={() =>
                    setNewHandoffs((prev) => prev.map((h) => (h.id === p.id ? { ...h, handoffAcknowledgedAt: null } : h)))
                  }
                />
              ))}
            </div>
          )}
        </Card>

        <AtRiskProjectsCard projects={stats.atRiskProjects} />
        <WaitingOnClientCard projects={stats.waitingOnClient ?? []} />

        <OverdueBalancesCard balances={stats.overdueBalances} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <ActivityFeedCard activity={stats.activityFeed} />

        <TasksWidget />

        <TeamCard />
      </div>

      {stats.projectsAwaitingReply.length > 0 && (
        <Card className="p-6 mb-5" glow="sky">
          <CardHeader icon={MessageCircle} tone="sky" title="Awaiting Your Reply" subtitle="Client messaged last, longest wait first" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {stats.projectsAwaitingReply.map((p) => (
              <ListRow
                key={p.id}
                href={`/admin/projects/${p.id}`}
                title={p.company}
                subtitle={p.name}
                trailing={
                  <Badge tone={p.waitHours >= 48 ? 'red' : p.waitHours >= 12 ? 'amber' : 'neutral'}>
                    {p.waitHours < 24 ? `${p.waitHours}h` : `${Math.floor(p.waitHours / 24)}d`}
                  </Badge>
                }
              />
            ))}
          </div>
        </Card>
      )}

      {stats.awaitingSignature.length > 0 && (
        <Card className="p-6 mb-8" glow="purple">
          <CardHeader icon={FileSignature} tone="purple" title="Contracts Awaiting Signature" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {stats.awaitingSignature.map((l) => (
              <ListRow
                key={l.id}
                href={`/admin/leads/${l.id}`}
                title={l.company}
                trailing={<span className="text-white/40 text-xs">{new Date(l.updatedAt).toLocaleDateString()}</span>}
              />
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/clients"
          className="px-5 py-3 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 text-black font-semibold hover:opacity-90 transition-opacity"
        >
          View Clients
        </Link>
        <Link href="/admin/projects" className="px-5 py-3 rounded-xl border border-white/15 font-semibold hover:bg-white/5 transition-colors">
          View Projects
        </Link>
        <Link href="/admin/team-chat" className="px-5 py-3 rounded-xl border border-white/15 font-semibold hover:bg-white/5 transition-colors">
          Team Chat
        </Link>
      </div>

      {showLeadsSpreadsheet && (
        <div className="mt-8">
          <LeadsSpreadsheet />
        </div>
      )}
    </PageIn>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [salesStats, setSalesStats] = useState<SalesStats | null>(null);
  const [opsStats, setOpsStats] = useState<OpsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [range, setRange] = useState<StatsRange>('week');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (hasLoadedOnce) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const meResponse = await fetch('/api/auth/me');
        if (meResponse.status === 401) {
          router.push('/admin/login');
          return;
        }
        if (!meResponse.ok) throw new Error(`Failed to load your session (${meResponse.status}).`);
        const me = await meResponse.json();
        const userRole = me.user?.role || 'admin';

        const statsUrl = userRole === 'sales' ? '/api/admin/sales-stats' : '/api/admin/ops-stats';
        const res = await fetch(`${statsUrl}?range=${range}`);
        if (!res.ok) throw new Error(`Failed to load dashboard data (${res.status}).`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to load dashboard data.');

        if (cancelled) return;
        setRole(userRole);
        setName(me.user?.name || '');
        if (userRole === 'sales') {
          setSalesStats(data.stats);
        } else {
          setOpsStats(data.stats);
        }
        setLastUpdated(new Date());
        setHasLoadedOnce(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong loading your dashboard.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, retryCount, range]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-[calc(100vh-56px)] lg:h-screen px-4 text-center">
        <AlertTriangle className="text-red-400" size={32} />
        <div>
          <p className="font-semibold mb-1">Couldn't load your dashboard</p>
          <p className="text-white/40 text-sm">{error}</p>
        </div>
        <button
          onClick={() => setRetryCount((c) => c + 1)}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 text-black font-semibold hover:opacity-90 transition-opacity"
        >
          Try Again
        </button>
      </div>
    );
  }

  const onRefresh = () => setRetryCount((c) => c + 1);

  if (role === 'sales' && salesStats) {
    return (
      <SalesDashboard
        stats={salesStats}
        name={name}
        range={range}
        onRangeChange={setRange}
        lastUpdated={lastUpdated}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    );
  }

  if (opsStats) {
    return (
      <OpsDashboard
        stats={opsStats}
        name={name}
        showLeadsSpreadsheet={role !== 'sales'}
        range={range}
        onRangeChange={setRange}
        lastUpdated={lastUpdated}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    );
  }

  return null;
}
