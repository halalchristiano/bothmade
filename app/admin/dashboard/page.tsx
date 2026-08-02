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
} from 'lucide-react';
import { TasksWidget } from '@/components/admin/TasksWidget';
import { LeadsSpreadsheet } from '@/components/admin/LeadsSpreadsheet';
import { LogTouchPopover } from '@/components/admin/LogTouchPopover';
import { Card, CardHeader, StatRow, Badge, ListRow, EmptyState, PageIn, MiniBarChart } from '@/components/admin/ui';
import { formatCents } from '@/lib/pricing';
import { LEAD_STATUS_SHORT_LABELS } from '@/lib/leads';

interface SalesStats {
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
  sourcePerformance: Array<{ source: string; total: number; won: number }>;
  clientTypeBreakdown: Record<string, number>;
  wonDeals: Array<{ id: string; company: string; value: number; wonAt: string }>;
  totalWonValue: number;
}

interface OpsStats {
  newHandoffs: Array<{
    id: string;
    name: string;
    company: string;
    contactName: string | null;
    createdAt: string;
    onboardingTotal: number;
    onboardingAnswered: number;
    handoffAcknowledgedAt: string | null;
  }>;
  newClientsThisWeek: number;
  atRiskProjects: Array<{ id: string; name: string; company: string; status: string; daysSinceUpdate: number }>;
  overdueBalances: Array<{ id: string; name: string; company: string; balanceDue: number }>;
  projectsAwaitingReply: Array<{ id: string; name: string; company: string }>;
  awaitingSignature: Array<{ id: string; company: string; updatedAt: string }>;
  pendingMockups: Array<{ id: string; company: string; mockupRequestedAt: string | null }>;
  revenueThisMonth: number;
  revenueLastMonth: number;
  revenueHistory: Array<{ label: string; value: number }>;
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
}

function NextActionsCard({ stats }: { stats: SalesStats }) {
  const seen = new Set<string>();
  const actions: NextAction[] = [];

  for (const l of stats.followUpsOverdue) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    actions.push({ id: l.id, company: l.company, reason: 'Overdue follow-up', tone: 'red', meta: new Date(l.nextFollowUpAt).toLocaleDateString(), phone: l.phone, email: l.email });
  }
  for (const l of stats.followUpsToday) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    actions.push({ id: l.id, company: l.company, reason: 'Follow up today', tone: 'sky', meta: '', phone: l.phone, email: l.email });
  }
  for (const l of stats.hotLeads) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    actions.push({ id: l.id, company: l.company, reason: 'Hot lead', tone: 'amber', meta: l.estimatedValue ? formatCents(l.estimatedValue) : '', phone: l.phone, email: l.email });
  }
  for (const l of stats.staleLeads) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    actions.push({ id: l.id, company: l.company, reason: 'Going stale — 5+ days idle', tone: 'red', meta: new Date(l.updatedAt).toLocaleDateString(), phone: l.phone, email: l.email });
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
        <EmptyState icon={Flame} text="Nothing urgent — you're caught up." />
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
                      className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-amber-300 transition-colors"
                    >
                      <Phone size={13} />
                    </a>
                  )}
                  {a.email && (
                    <a
                      href={`mailto:${a.email}`}
                      title={`Email ${a.email}`}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-sky-300 transition-colors"
                    >
                      <Mail size={13} />
                    </a>
                  )}
                  <LogTouchPopover leadId={a.id} />
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
      <CardHeader icon={Radio} tone="purple" title="Insights" subtitle="Why deals win, lose, and where they come from" />
      <div className="flex gap-1.5 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
              tab === t.key ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'lost' &&
        (Object.keys(stats.lostReasonCounts).length === 0 ? (
          <EmptyState icon={XCircle} text="No lost deals recorded yet." />
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

      {tab === 'source' && (
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
      )}

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

function SalesDashboard({ stats, name }: { stats: SalesStats; name: string }) {
  const maxPipelineValue = Math.max(...stats.pipeline.map((p) => p.value), 1);

  return (
    <PageIn className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-8">
        <p className="text-sm text-sky-300/70 font-medium mb-1">Sales</p>
        <h1 className="text-3xl font-bold tracking-tight mb-1">Welcome back, {name}</h1>
        <p className="text-white/40">Here's where your pipeline stands.</p>
      </div>

      <CallListBanner />

      <div className="mb-6">
        <StatRow
          items={[
            { icon: TrendingUp, label: 'Pipeline Value', value: formatCents(stats.totalPipelineValue), tone: 'sky' },
            { icon: Target, label: 'Weighted Forecast', value: formatCents(stats.weightedForecast), tone: 'purple', accent: true },
            { icon: Trophy, label: 'Won This Week', value: formatCents(stats.thisWeek.revenue), tone: 'emerald' },
            { icon: Percent, label: 'Conversion Rate', value: `${Math.round(stats.conversionRate * 100)}%`, tone: 'amber' },
          ]}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-5">
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
              <p className="text-white/40 text-xs mb-1">New Leads This Week</p>
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

      <div className="grid lg:grid-cols-2 gap-5 mb-8">
        <InsightsCard stats={stats} />

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
            <div className="space-y-0.5 max-h-64 overflow-y-auto">
              {stats.wonDeals.map((d) => (
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
        </Card>
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
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');

  const handleSend = async () => {
    if (!content.trim()) return;
    setSending(true);
    setStatus('');
    try {
      const response = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, segment: 'active' }),
      });
      const data = await response.json();
      if (data.success) {
        setStatus(`Sent to ${data.projectsNotified} project${data.projectsNotified === 1 ? '' : 's'} (${data.emailsSent} email${data.emailsSent === 1 ? '' : 's'} sent).`);
        setContent('');
      }
    } finally {
      setSending(false);
    }
  };

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
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="e.g. We'll be closed for the holiday on Dec 25 — replies may be a day slower than usual."
        rows={3}
        className="w-full px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder:text-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-transparent transition-all mb-3"
      />
      {status && <p className="text-sm text-emerald-300 mb-3">{status}</p>}
      <button
        onClick={handleSend}
        disabled={sending || !content.trim()}
        className="rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {sending ? 'Sending...' : 'Send to All Active Clients'}
      </button>
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
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!url.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/leads/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockupUrl: url.trim() }),
      });
      setUrl('');
      setOpen(false);
      onDelivered();
    } finally {
      setSaving(false);
    }
  };

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
            className="text-xs px-2.5 py-1 rounded-lg border border-white/20 hover:bg-white/5 transition-colors whitespace-nowrap"
          >
            {open ? 'Cancel' : 'Add Link'}
          </button>
        </div>
      </div>
      {open && (
        <div className="flex gap-2 mt-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste mockup link..."
            autoFocus
            className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-white placeholder:text-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/50"
          />
          <button
            onClick={handleSave}
            disabled={saving || !url.trim()}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 text-black text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            {saving ? 'Saving...' : 'Deliver'}
          </button>
        </div>
      )}
    </div>
  );
}

function HandoffRow({
  handoff,
  onAcknowledged,
}: {
  handoff: OpsStats['newHandoffs'][number];
  onAcknowledged: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const handleAcknowledge = async () => {
    setSaving(true);
    try {
      await fetch(`/api/projects/${handoff.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledgeHandoff: true }),
      });
      onAcknowledged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 px-3 py-2.5">
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
            <button
              onClick={handleAcknowledge}
              disabled={saving}
              className="text-xs px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-400 to-sky-500 text-black font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              {saving ? 'Saving...' : "I've got this"}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-white/30 mt-1">{handoff.name}</p>
    </div>
  );
}

function OpsDashboard({ stats, name, showLeadsSpreadsheet }: { stats: OpsStats; name: string; showLeadsSpreadsheet: boolean }) {
  const [pendingMockups, setPendingMockups] = useState(stats.pendingMockups);
  const [newHandoffs, setNewHandoffs] = useState(stats.newHandoffs);
  const revenueTrend =
    stats.revenueLastMonth > 0
      ? Math.round(((stats.revenueThisMonth - stats.revenueLastMonth) / stats.revenueLastMonth) * 100)
      : undefined;

  return (
    <PageIn className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8">
        <div>
          <p className="text-sm text-purple-300/70 font-medium mb-1">Operations</p>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Welcome back, {name}</h1>
          <p className="text-white/40">Here's what needs you today.</p>
        </div>
        <BroadcastComposer />
      </div>

      {pendingMockups.length > 0 && (
        <Card className="p-6 mb-6" glow="amber">
          <CardHeader icon={Palette} tone="amber" title="Mockup Requests" subtitle="Evan's waiting on these" />
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
              label: 'Revenue This Month',
              value: formatCents(stats.revenueThisMonth),
              tone: 'emerald',
              accent: true,
              trend: revenueTrend !== undefined ? { value: revenueTrend } : undefined,
              note: `Your cut (${Math.round(COMMISSION_RATE * 100)}%): ${formatCents(Math.round(stats.revenueThisMonth * COMMISSION_RATE))}`,
            },
            { icon: UserPlus, label: 'New Clients This Week', value: String(stats.newClientsThisWeek), tone: 'purple' },
            { icon: FileSignature, label: 'Awaiting Signature', value: String(stats.awaitingSignature.length), tone: 'amber' },
          ]}
        />
      </div>

      <Card className="p-6 mb-5">
        <CardHeader icon={TrendingUp} tone="emerald" title="Revenue — Last 6 Months" />
        <MiniBarChart data={stats.revenueHistory} formatValue={(v) => formatCents(v)} />
      </Card>

      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        <Card className="p-6" glow="emerald">
          <CardHeader icon={Inbox} tone="emerald" title="New Handoffs" subtitle="Give them a first touch" />
          {newHandoffs.length === 0 ? (
            <EmptyState icon={Inbox} text="Nothing new this week." />
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
                />
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6" glow="red">
          <CardHeader icon={AlertTriangle} tone="red" title="At-Risk Projects" subtitle="No update in 7+ days" />
          {stats.atRiskProjects.length === 0 ? (
            <EmptyState icon={AlertTriangle} text="Everything's current." />
          ) : (
            <div className="space-y-0.5">
              {stats.atRiskProjects.map((p) => (
                <ListRow key={p.id} href={`/admin/projects/${p.id}`} title={p.company} trailing={<Badge tone="red">{p.daysSinceUpdate}d</Badge>} />
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <CardHeader icon={Wallet} tone="amber" title="Overdue Balances" />
          {stats.overdueBalances.length === 0 ? (
            <EmptyState icon={Wallet} text="Nothing outstanding." />
          ) : (
            <div className="space-y-0.5">
              {stats.overdueBalances.map((p) => (
                <ListRow key={p.id} href={`/admin/projects/${p.id}`} title={p.company} trailing={<Badge tone="amber">{formatCents(p.balanceDue)}</Badge>} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        <Card className="lg:col-span-2 p-6">
          <CardHeader icon={Activity} tone="sky" title="Activity Feed" />
          {stats.activityFeed.length === 0 ? (
            <EmptyState icon={Activity} text="Nothing new." />
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {stats.activityFeed.map((a) => (
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
          )}
        </Card>

        <TasksWidget />
      </div>

      {stats.projectsAwaitingReply.length > 0 && (
        <Card className="p-6 mb-5" glow="sky">
          <CardHeader icon={MessageCircle} tone="sky" title="Awaiting Your Reply" subtitle="Client messaged last" />
          <div className="grid sm:grid-cols-2 gap-1">
            {stats.projectsAwaitingReply.map((p) => (
              <ListRow key={p.id} href={`/admin/projects/${p.id}`} title={p.company} subtitle={p.name} />
            ))}
          </div>
        </Card>
      )}

      {stats.awaitingSignature.length > 0 && (
        <Card className="p-6 mb-8" glow="purple">
          <CardHeader icon={FileSignature} tone="purple" title="Contracts Awaiting Signature" />
          <div className="grid sm:grid-cols-2 gap-1">
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

  useEffect(() => {
    const load = async () => {
      try {
        const meResponse = await fetch('/api/auth/me');
        if (meResponse.status === 401) {
          router.push('/admin/login');
          return;
        }
        const me = await meResponse.json();
        const userRole = me.user?.role || 'admin';
        setRole(userRole);
        setName(me.user?.name || '');

        if (userRole === 'sales') {
          const res = await fetch('/api/admin/sales-stats');
          const data = await res.json();
          if (data.success) setSalesStats(data.stats);
        } else {
          const res = await fetch('/api/admin/ops-stats');
          const data = await res.json();
          if (data.success) setOpsStats(data.stats);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)] lg:h-screen">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
      </div>
    );
  }

  if (role === 'sales' && salesStats) {
    return <SalesDashboard stats={salesStats} name={name} />;
  }

  if (opsStats) {
    return <OpsDashboard stats={opsStats} name={name} showLeadsSpreadsheet={role !== 'sales'} />;
  }

  return null;
}
