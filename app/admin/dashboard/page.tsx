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
  ChevronRight,
  Palette,
  Phone,
  Mail,
  RefreshCw,
  ExternalLink,
  ListChecks,
  BarChart3,
  UserCog,
} from 'lucide-react';
import { TasksWidget } from '@/components/admin/TasksWidget';
import { LogTouchPopover } from '@/components/admin/LogTouchPopover';
import { SnoozeButton } from '@/components/admin/SnoozeButton';
import { UndoToast } from '@/components/admin/UndoToast';
import { MockupDeliveryForm } from '@/components/admin/MockupDelivery';
import { MockupsCard } from '@/components/admin/MockupAttachments';
import { SignatureCertificatesCard } from '@/components/admin/SignatureCertificates';
import { BroadcastForm, describeBroadcast } from '@/components/admin/BroadcastForm';
import { Card, CardHeader, StatRow, Badge, ListRow, EmptyState, PageIn, MiniBarChart, Kicker, BrandButton } from '@/components/admin/ui';
import { Today } from '@/components/admin/dashboard/Today';
import { NotificationGuide } from '@/components/admin/dashboard/NotificationGuide';
import { localDayStartParam } from '@/lib/day-window';
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

/**
 * Opens the client's own status page in a new tab — the fastest way to see
 * exactly what they're seeing, without switching accounts.
 *
 * The token is not decoration. That page is a capability link: the API behind
 * it 404s on a missing or wrong `?t=`, deliberately and identically to an
 * unknown project, so that a cuid alone proves nothing. Linking by ID the way
 * this used to meant every one of these buttons opened "Not found".
 */
function OpenStatusButton({ projectId, shareToken }: { projectId: string; shareToken: string | null }) {
  if (!shareToken) return null;
  // `t` is spelled out rather than imported from lib/share-links: that module
  // pulls in node:crypto for the constant-time compare, which has no place in
  // a browser bundle.
  return (
    <a
      href={`/status/${projectId}?t=${encodeURIComponent(shareToken)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open their status page"
      className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-sky-300 transition-colors"
    >
      <ExternalLink size={13} />
    </a>
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
            range === opt.value ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
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
    shareToken: string | null;
  }>;
  newClientsThisWeek: number;
  atRiskProjects: Array<{
    id: string;
    name: string;
    company: string;
    status: string;
    daysSinceUpdate: number;
    shareToken: string | null;
  }>;
  waitingOnClient: Array<{
    id: string;
    name: string;
    company: string;
    daysSinceUpdate: number;
    daysSinceWeAsked: number | null;
    shareToken: string | null;
  }>;
  overdueBalances: Array<{
    id: string;
    name: string;
    company: string;
    balanceDue: number;
    lastPaymentReminderSentAt: string | null;
  }>;
  projectsAwaitingReply: Array<{ id: string; name: string; company: string; waitHours: number }>;
  awaitingSignatureCount: number;
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
  /**
   * The word on the badge. It used to be derived from the tone, which meant
   * three tones could only ever say three things — so a row could not say
   * what it was without also changing colour. A contract sitting unsigned is
   * urgent and is not a "hot lead"; it needed its own word, not its own hue.
   */
  badge: string;
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
    actions.push({ id: l.id, company: l.company, reason: 'Overdue follow-up', tone: 'red', badge: 'urgent', meta: new Date(l.nextFollowUpAt).toLocaleDateString(), phone: l.phone, email: l.email, previousNextFollowUpAt: l.nextFollowUpAt });
  }
  for (const l of stats.followUpsToday) {
    if (seen.has(l.id) || dismissed.has(l.id)) continue;
    seen.add(l.id);
    actions.push({ id: l.id, company: l.company, reason: 'Follow up today', tone: 'sky', badge: 'today', meta: '', phone: l.phone, email: l.email, previousNextFollowUpAt: null });
  }
  /**
   * Above the hot leads, below the dated promises.
   *
   * The endpoint has computed this from the start and nothing rendered it, so
   * a contract sitting with a client reached the browser and stopped there.
   * It only ever surfaced once the generic stall checks caught up with it —
   * as "Stalled in Contract Sent", which names the symptom and not the thing
   * to do about it. Ranked here because it is the closest any row gets to
   * money: they have the paperwork, and nobody has asked them to sign it.
   */
  for (const l of stats.awaitingSignature) {
    if (seen.has(l.id) || dismissed.has(l.id)) continue;
    seen.add(l.id);
    actions.push({
      id: l.id,
      company: l.company,
      reason:
        l.daysWaiting === 0
          ? 'Contract sent today — unsigned'
          : `Contract unsigned — ${l.daysWaiting}d with them`,
      tone: l.daysWaiting >= 3 ? 'red' : 'amber',
      badge: 'unsigned',
      meta: '',
      phone: l.phone,
      email: l.email,
      previousNextFollowUpAt: null,
    });
  }
  for (const l of stats.hotLeads) {
    if (seen.has(l.id) || dismissed.has(l.id)) continue;
    seen.add(l.id);
    actions.push({ id: l.id, company: l.company, reason: 'Hot lead', tone: 'amber', badge: 'hot', meta: l.estimatedValue ? formatCents(l.estimatedValue) : '', phone: l.phone, email: l.email, previousNextFollowUpAt: null });
  }
  for (const l of stats.staleLeads) {
    if (seen.has(l.id) || dismissed.has(l.id)) continue;
    seen.add(l.id);
    actions.push({ id: l.id, company: l.company, reason: 'Going stale — 5+ days idle', tone: 'red', badge: 'stale', meta: new Date(l.updatedAt).toLocaleDateString(), phone: l.phone, email: l.email, previousNextFollowUpAt: null });
  }
  for (const l of stats.stageAging) {
    if (seen.has(l.id) || dismissed.has(l.id)) continue;
    seen.add(l.id);
    actions.push({ id: l.id, company: l.company, reason: `Stalled in ${l.stageLabel} — ${l.daysIdle}d idle`, tone: 'red', badge: 'stalled', meta: l.estimatedValue ? formatCents(l.estimatedValue) : '', phone: l.phone, email: l.email, previousNextFollowUpAt: null });
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
                  <Badge tone={a.tone}>{a.badge}</Badge>
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

/*
 * Takes the stats and nothing else. It was also handed `name`, `range`,
 * `onRangeChange`, `lastUpdated`, `refreshing` and `onRefresh`, and read none
 * of them — six props that looked like this half owned a range picker and a
 * refresh control when both live in the header above it.
 */
function SalesDashboard({ stats }: { stats: SalesStats }) {
  const maxPipelineValue = Math.max(...stats.pipeline.map((p) => p.value), 1);

  return (
    <div>
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
          <CardHeader icon={FolderKanban} tone="sky" title="Pipeline by Stage" action={<Link href="/admin/sales?view=board" className="text-xs text-sky-300/70 hover:text-sky-300">Full board →</Link>} />
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {stats.pipeline
              .filter((p) => p.count > 0)
              .map((p) => (
                <Link
                  key={p.status}
                  href="/admin/sales?view=board"
                  className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition-colors"
                >
                  <span className="w-28 shrink-0 text-xs text-white/50 truncate">
                    {LEAD_STATUS_SHORT_LABELS[p.status as keyof typeof LEAD_STATUS_SHORT_LABELS] || p.status}
                  </span>
                  <span className="w-6 shrink-0 text-sm font-semibold text-right">{p.count}</span>
                  <div className="flex-1 bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-sky-400/60 group-hover:bg-sky-400/80 h-1.5 rounded-full transition-all"
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
      </div>

      <div className="mb-5">
        <NextActionsCard stats={stats} />
      </div>

      <div className="mb-5">
        <MockupsCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        <InsightsCard stats={stats} />

        <WonDealsCard stats={stats} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/sales?view=board"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/15 font-semibold hover:bg-white/5 transition-colors"
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
    </div>
  );
}

function BroadcastComposer() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <BrandButton variant="quiet" onClick={() => setOpen(true)} className="inline-flex items-center gap-2">
        <Megaphone size={16} />
        Broadcast to Clients
      </BrandButton>
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
            submitLabel="Attach"
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
          <OpenStatusButton projectId={handoff.id} shareToken={handoff.shareToken} />
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
                className="text-xs px-2.5 py-1 rounded-lg border border-emerald-400/40 text-emerald-300 font-semibold disabled:opacity-50 hover:bg-emerald-400/10 transition-colors whitespace-nowrap"
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

/**
 * Money that has been invoiced and not paid.
 *
 * The endpoint has always sent this and the page has always thrown it away —
 * the type was declared, the rows crossed the wire, and the only thing left
 * of the card that once read them was an unused `Wallet` import. So the page
 * whose own strapline is "sell it, get paid for it, ship it" covered the
 * selling and the shipping and went quiet in the middle.
 *
 * `balanceDue` is `projectBalance().dueNowCents` — invoiced and unpaid, not
 * "everything not yet paid". Work that hasn't reached its gate isn't late and
 * doesn't belong on a list you're meant to act on.
 *
 * The last-reminder date is here because it decides what you do next: chasing
 * somebody you emailed this morning is a different act from chasing somebody
 * nobody has contacted at all, and the row should not make you go and look.
 */
function UnpaidBalancesCard({ projects }: { projects: OpsStats['overdueBalances'] }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const shown = projects.slice(0, visible);
  const total = projects.reduce((sum, p) => sum + p.balanceDue, 0);

  return (
    <Card className="p-6 mb-5" glow={projects.length > 0 ? 'amber' : undefined}>
      <CardHeader
        icon={Wallet}
        tone="amber"
        title="Invoiced and unpaid"
        subtitle="Sent, past its gate, still outstanding"
        action={
          projects.length > 0 ? (
            <span className="text-sm text-amber-300 font-semibold">{formatCents(total)}</span>
          ) : undefined
        }
      />
      {projects.length === 0 ? (
        <EmptyState icon={Wallet} text="Nothing outstanding — everyone's paid up." tone="clear" />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {shown.map((p) => (
              <ListRow
                key={p.id}
                href={`/admin/projects/${p.id}`}
                title={p.company}
                subtitle={
                  p.lastPaymentReminderSentAt
                    ? `Reminded ${new Date(p.lastPaymentReminderSentAt).toLocaleDateString()}`
                    : 'Never reminded'
                }
                trailing={
                  <span className="text-amber-300/90 text-xs font-medium whitespace-nowrap">
                    {formatCents(p.balanceDue)}
                  </span>
                }
              />
            ))}
          </div>
          <ShowMoreButton remaining={projects.length - visible} onClick={() => setVisible((v) => v + PAGE_SIZE)} />
        </>
      )}
    </Card>
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
              <ListRow
                key={p.id}
                href={`/admin/projects/${p.id}`}
                title={p.company}
                trailing={
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Badge tone="red">{p.daysSinceUpdate}d</Badge>
                    <OpenStatusButton projectId={p.id} shareToken={p.shareToken} />
                  </div>
                }
              />
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
                trailing={
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Badge tone="amber">{p.daysSinceUpdate}d</Badge>
                    <OpenStatusButton projectId={p.id} shareToken={p.shareToken} />
                  </div>
                }
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
  range,
  onRangeChange,
  lastUpdated,
  refreshing,
  onRefresh,
  embedded = false,
}: {
  stats: OpsStats;
  name: string;
  range: StatsRange;
  onRangeChange: (r: StatsRange) => void;
  lastUpdated: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
  /**
   * Rendered below the sales half rather than on its own. The greeting, the
   * range picker and the refresh control are shared and already on screen, so
   * repeating them here would be three duplicate controls arguing over the
   * same piece of state.
   */
  embedded?: boolean;
}) {
  const [pendingMockups, setPendingMockups] = useState(stats.pendingMockups);
  const [newHandoffs, setNewHandoffs] = useState(stats.newHandoffs);
  const revenueTrend =
    stats.revenueLastMonth > 0
      ? Math.round(((stats.revenueThisMonth - stats.revenueLastMonth) / stats.revenueLastMonth) * 100)
      : undefined;

  const Shell = embedded ? 'div' : PageIn;

  return (
    <Shell className={embedded ? '' : 'max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10'}>
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-10 mb-6 pt-8 border-t border-white/10">
          <div>
            <p className="text-sm text-purple-300/70 font-medium mb-1">Operations</p>
            <p className="text-white/40 text-sm">Delivery, clients and money.</p>
          </div>
          <BroadcastComposer />
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-2">
            <div>
              <Kicker className="mb-2">Operations</Kicker>
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
        </>
      )}

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
            { icon: FileSignature, label: 'Awaiting Signature', value: String(stats.awaitingSignatureCount), tone: 'amber' },
          ]}
        />
      </div>

      {/* Before the six-month chart on purpose: what's owed now is something
          you can do about today, and revenue history is something to read. */}
      <UnpaidBalancesCard projects={stats.overdueBalances ?? []} />

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

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <ActivityFeedCard activity={stats.activityFeed} />

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

      <div className="mb-8">
        <SignatureCertificatesCard />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/priorities"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 text-black font-semibold hover:opacity-90 transition-opacity"
        >
          <ListChecks size={16} /> Priorities
        </Link>
        <Link
          href="/admin/clients"
          className="px-5 py-3 rounded-xl border border-white/15 font-semibold hover:bg-white/5 transition-colors"
        >
          View Clients
        </Link>
        <Link href="/admin/projects" className="px-5 py-3 rounded-xl border border-white/15 font-semibold hover:bg-white/5 transition-colors">
          View Projects
        </Link>
        <Link
          href="/admin/mockup-queue"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/15 font-semibold hover:bg-white/5 transition-colors"
        >
          <Palette size={16} /> Mockup Queue
        </Link>
        <Link
          href="/admin/analytics"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/15 font-semibold hover:bg-white/5 transition-colors"
        >
          <BarChart3 size={16} /> Analytics
        </Link>
        <Link href="/admin/team-chat" className="px-5 py-3 rounded-xl border border-white/15 font-semibold hover:bg-white/5 transition-colors">
          Team Chat
        </Link>
      </div>

    </Shell>
  );
}

/**
 * The dashboard.
 *
 * Three things shipped on top of each other here and the result was a page
 * nobody could land on: the Today panel, then a full sales dashboard, then a
 * full operations dashboard — twenty-odd cards, several answering the same
 * question twice, behind two heavyweight requests that had to finish before
 * anything appeared.
 *
 * Now it opens on what you can act on: the one sentence, three lanes, and
 * your own task list. The rest is still all here, and still one click away,
 * but it is explicitly "the full breakdown" rather than the page — and it
 * doesn't fetch until you ask for it, so landing costs one request instead
 * of three.
 *
 * The range picker lives inside the breakdown for the same reason. It only
 * ever controlled those two halves; sitting at the top of the page it looked
 * like it controlled Today, which ignores it.
 */
export default function AdminDashboardPage() {
  const router = useRouter();
  const [name, setName] = useState('');

  const [open, setOpen] = useState(false);
  const [salesStats, setSalesStats] = useState<SalesStats | null>(null);
  const [opsStats, setOpsStats] = useState<OpsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [todayUpdatedAt, setTodayUpdatedAt] = useState<Date | null>(null);
  const [todayRefreshing, setTodayRefreshing] = useState(false);
  const [range, setRange] = useState<StatsRange>('week');

  // Who is looking at it — cheap, and needed for the greeting whether or not
  // the breakdown is ever opened.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then((res) => {
        if (res.status === 401) {
          router.push('/admin/login');
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((me) => {
        if (!cancelled && me?.user) setName(me.user.name || '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Whether the breakdown was open last time. Someone who lives in it should
  // not have to reopen it every morning.
  useEffect(() => {
    try {
      if (localStorage.getItem('bothmade_dashboard_breakdown') === 'open') setOpen(true);
    } catch {
      /* private browsing — closed is a fine default */
    }
  }, []);

  // The heavy pair, fetched only once somebody actually wants them, and again
  // when the range changes underneath an open panel.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      if (salesStats || opsStats) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        // Both halves, for everyone. This used to fetch one or the other off
        // the signed-in role, which is what made two people in the same studio
        // unable to see the same screen — the rep couldn't see what was at
        // risk in delivery, and ops couldn't see what was about to land.
        // `dayStart` is what makes "follow up today" mean the viewer's today
        // rather than the server's — see lib/day-window.ts.
        const dayStart = encodeURIComponent(localDayStartParam());
        const [salesRes, opsRes] = await Promise.all([
          fetch(`/api/admin/sales-stats?range=${range}&dayStart=${dayStart}`),
          fetch(`/api/admin/ops-stats?range=${range}`),
        ]);
        if (salesRes.status === 401 || opsRes.status === 401) {
          router.push('/admin/login');
          return;
        }
        if (!salesRes.ok) throw new Error(`Failed to load sales data (${salesRes.status}).`);
        if (!opsRes.ok) throw new Error(`Failed to load operations data (${opsRes.status}).`);
        const [salesData, opsData] = await Promise.all([salesRes.json(), opsRes.json()]);
        if (!salesData.success) throw new Error(salesData.error || 'Failed to load sales data.');
        if (!opsData.success) throw new Error(opsData.error || 'Failed to load operations data.');

        if (cancelled) return;
        setSalesStats(salesData.stats);
        setOpsStats(opsData.stats);
        setLastUpdated(new Date());
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Something went wrong loading the breakdown.');
        }
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
  }, [open, range, retryCount, router]);

  const toggle = () => {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      try {
        localStorage.setItem('bothmade_dashboard_breakdown', next ? 'open' : 'closed');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const onRefresh = () => {
    setTodayRefreshing(true);
    setRetryCount((c) => c + 1);
  };

  /*
   * What the "Updated Xm ago" label is allowed to claim.
   *
   * Two things load independently — the Today card above, and the breakdown
   * below — so the honest answer is the staler of whatever is currently on
   * screen. Claiming the fresher one would put a confident timestamp over a
   * list that had not moved.
   */
  const shownUpdatedAt =
    open && lastUpdated && todayUpdatedAt
      ? new Date(Math.min(lastUpdated.getTime(), todayUpdatedAt.getTime()))
      : todayUpdatedAt ?? (open ? lastUpdated : null);
  const anyRefreshing = todayRefreshing || (open && (refreshing || loading));

  return (
    <PageIn className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-6">
        <Kicker className="mb-2">Studio</Kicker>
        <h1 className="text-3xl font-bold tracking-tight mb-1">
          Welcome back{name ? `, ${name}` : ''}
        </h1>
        <p className="text-white/40">Sell it, get paid for it, ship it — in that order.</p>
      </div>

      {/* What you can act on, before any of the detail. */}
      <div className="mb-5">
        <Today
          refreshSignal={retryCount}
          onSettled={(at) => {
            setTodayRefreshing(false);
            if (at) setTodayUpdatedAt(at);
          }}
        />
      </div>

      {/* One instance. This used to mount inside both halves, so the same
          personal to-do list rendered twice on one page — and it belongs
          above the fold rather than buried in a breakdown nobody opened. */}
      <div className="mb-6">
        <TasksWidget />
      </div>

      {/* Beside the breakdown rather than in Settings, because the question
          "why is it so quiet — is anything actually watching?" occurs to you
          while you are looking at this page. */}
      <div className="mb-4">
        <NotificationGuide />
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.01]">
        {/*
          The controls are siblings of the toggle, not children of it.
          They used to sit inside the <button>, which put buttons inside a
          button — invalid, and it took an onClick stopPropagation on a
          wrapper span to stop every range change from also collapsing the
          panel it was meant to filter. They were also `hidden sm:flex` and
          rendered nowhere else, so below 640px there was no way to change
          the range or refresh at all — the sales half ignores these props
          entirely, and the ops half only renders copies of its own when it
          isn't embedded, which on this page it always is.
        */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-5 py-4">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls="dashboard-breakdown"
            className="-m-2 flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left hover:bg-white/[0.02] transition-colors"
          >
            <ChevronRight
              size={16}
              className={`shrink-0 text-white/35 transition-transform ${open ? 'rotate-90' : ''}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">The full breakdown</p>
              <p className="text-xs text-white/35">
                Pipeline by stage, revenue history, at-risk projects, handoffs, activity and the team.
              </p>
            </div>
          </button>
          {/*
            The range picker belongs to the breakdown and hides with it. The
            refresh control does not: the Today card above stays on screen
            either way, so collapsing the panel used to take away the only way
            to refresh the one thing still visible.
          */}
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
            {open && <RangePicker range={range} onChange={setRange} />}
            <RefreshIndicator
              lastUpdated={shownUpdatedAt}
              refreshing={anyRefreshing}
              onRefresh={onRefresh}
            />
          </div>
        </div>

        {open && (
          <div id="dashboard-breakdown" className="border-t border-white/[0.07] px-4 md:px-5 pb-6 pt-2">
            {loading && !salesStats && (
              <p className="py-10 text-center text-sm text-white/40">Loading the breakdown…</p>
            )}

            {error && (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <AlertTriangle className="text-red-400" size={26} />
                <div>
                  <p className="font-semibold mb-1">Couldn&apos;t load the breakdown</p>
                  <p className="text-white/40 text-sm">{error}</p>
                </div>
                <BrandButton variant="primary" onClick={onRefresh}>
                  Try again
                </BrandButton>
              </div>
            )}

            {salesStats && (
              <SalesDashboard stats={salesStats} />
            )}
            {opsStats && (
              <OpsDashboard
                stats={opsStats}
                name={name}
                range={range}
                onRangeChange={setRange}
                lastUpdated={lastUpdated}
                refreshing={refreshing}
                onRefresh={onRefresh}
                embedded
              />
            )}
          </div>
        )}
      </div>
    </PageIn>
  );
}
