'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { amountPaidTowardProject, projectBalance } from '@/lib/billing';
import { AlertTriangle, FolderKanban, MessageSquare, Plus } from 'lucide-react';
import { Badge, Card, Kicker, LoadError, matchesSearch, PageIn, PageTitle, SearchFilter } from '@/components/admin/ui';

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  timeline: string | null;
  createdAt: string;
  updatedAt: string;
  totalPrice: number;
  statusStage: number;
  client: { company: string; email: string };
  messages: Array<{ isFromAdmin: boolean; createdAt: string }>;
  payments: Array<{ amount: number; type: string }>;
  instalments?: Array<{
    index: number;
    label: string;
    amountCents: number;
    status: string;
    dueAt: string | null;
    trigger: string;
  }>;
}

const STATUSES = ['all', 'discovery', 'design', 'build', 'launch', 'complete'];
/** The delivery stages, in the order a project passes through them. */
const STAGES = ['discovery', 'design', 'build', 'launch', 'complete'] as const;
const AT_RISK_DAYS = 7;

function isAtRisk(project: ProjectRow): boolean {
  if (project.status === 'complete') return false;
  const days = (Date.now() - new Date(project.updatedAt).getTime()) / (24 * 60 * 60 * 1000);
  return days >= AT_RISK_DAYS;
}

function isAwaitingReply(project: ProjectRow): boolean {
  if (project.status === 'complete') return false;
  const last = project.messages[0];
  return !!last && !last.isFromAdmin;
}

function balanceDue(project: ProjectRow): number {
  return project.totalPrice - amountPaidTowardProject(project.payments);
}

/**
 * Anything a PM would actually want to look at today, in one signal.
 *
 * The money half asks what's *owed*, not what's left on the contract. Every
 * project carries a three-instalment schedule now, so "contracted price minus
 * paid" is above zero for the entire life of the job — which made this filter
 * select every live project and mean nothing.
 */
function needsAttention(project: ProjectRow): boolean {
  if (isAtRisk(project) || isAwaitingReply(project)) return true;
  if (project.status === 'complete') return false;
  return (
    projectBalance({
      totalPrice: project.totalPrice,
      statusStage: project.statusStage,
      payments: project.payments,
      instalments: project.instalments ?? [],
    }).dueNowCents > 0
  );
}

function AtRiskBadge({ project }: { project: ProjectRow }) {
  if (!isAtRisk(project)) return null;
  const days = Math.floor((Date.now() - new Date(project.updatedAt).getTime()) / (24 * 60 * 60 * 1000));
  return (
    <Badge tone="red" solid>
      <AlertTriangle size={11} className="inline -mt-0.5 mr-1" />
      {days}d quiet
    </Badge>
  );
}

function HealthBadges({ project }: { project: ProjectRow }) {
  const due = balanceDue(project);
  const badges: ReactNode[] = [];
  if (isAtRisk(project)) badges.push(<AtRiskBadge key="risk" project={project} />);
  if (isAwaitingReply(project)) {
    badges.push(
      <Badge key="reply" tone="sky" solid>
        <MessageSquare size={11} className="inline -mt-0.5 mr-1" />
        Awaiting reply
      </Badge>
    );
  }
  if (project.status !== 'complete' && due > 0) {
    badges.push(
      <Badge key="balance" tone="amber" solid>
        ${(due / 100).toLocaleString()} due
      </Badge>
    );
  }
  if (badges.length === 0) {
    return <Badge tone="emerald">On track</Badge>;
  }
  return <div className="flex flex-wrap gap-1.5">{badges}</div>;
}

/**
 * How far along the build is, as five pips rather than a word.
 *
 * A status column said "build" and left you to remember whether that was
 * nearly done or barely started. Five pips answer it without being read.
 */
function StagePips({ status }: { status: string }) {
  const at = STAGES.indexOf(status as (typeof STAGES)[number]);
  return (
    <div className="flex items-center gap-1" title={`Stage: ${status}`}>
      {STAGES.map((stage, i) => (
        <span
          key={stage}
          aria-hidden
          className={`h-1.5 rounded-full transition-colors ${
            i <= at ? 'w-6 bg-sky-400/70' : 'w-4 bg-white/[0.08]'
          }`}
        />
      ))}
      <span className="ml-2 text-xs capitalize text-white/50">{status}</span>
    </div>
  );
}

/**
 * Where the money is, as the same three payments the contract promised.
 *
 * This is the half of a project the delivery list never showed. A project can
 * be in "build" and fully paid, or in "launch" with two payments outstanding,
 * and those are completely different situations that used to look identical
 * on this page.
 */
function PaymentPips({ project }: { project: ProjectRow }) {
  const rows = project.instalments ?? [];
  if (rows.length === 0) {
    const due = balanceDue(project);
    return (
      <span className="text-xs text-white/40">
        {due > 0 ? `${(due / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} due` : 'Paid'}
      </span>
    );
  }
  const paid = rows.filter((r) => r.status === 'paid');
  const collected = paid.reduce((sum, r) => sum + r.amountCents, 0);
  const overdue = rows.some((r) => r.status === 'due' && r.dueAt && new Date(r.dueAt) < new Date());

  return (
    <div className="flex items-center gap-2" title={rows.map((r) => `${r.label}: ${r.status}`).join(' · ')}>
      <div className="flex items-center gap-1">
        {rows.map((r) => (
          <span
            key={r.index}
            aria-hidden
            className={`h-2.5 w-2.5 rounded-full ${
              r.status === 'paid'
                ? 'bg-emerald-400'
                : r.status === 'due'
                  ? overdue
                    ? 'bg-amber-400'
                    : 'bg-sky-400'
                  : 'bg-white/[0.12]'
            }`}
          />
        ))}
      </div>
      <span className={`text-xs tabular-nums ${overdue ? 'text-amber-300' : 'text-white/50'}`}>
        {paid.length}/{rows.length} ·{' '}
        {(collected / 100).toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        })}
      </span>
    </div>
  );
}

export default function AdminProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'attention' | 'newest' | 'stalest'>('attention');

      /*
       * "No X found" is a claim about the data, and a failed fetch is not
       * entitled to make it. See LoadError in components/admin/ui.
       */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const response = await fetch(`/api/admin/projects${query}`);
      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await response.json();
      if (!response.ok || !data?.success) {
        setFailed(true);
        return;
      }
      setProjects(data.projects ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [router, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = projects
    .filter((p) => matchesSearch(search, p.name, p.client.company, p.client.email, p.status))
    .filter((p) => !attentionOnly || needsAttention(p))
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === 'stalest') return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      // Attention-needed first, oldest-updated within that group first.
      const aAttn = needsAttention(a);
      const bAttn = needsAttention(b);
      if (aAttn !== bAttn) return aAttn ? -1 : 1;
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    });

  const attentionCount = projects.filter(needsAttention).length;

  return (
    <PageIn className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-6 md:mb-8">
        <div>
          <Kicker className="mb-2">Delivery</Kicker>
          <PageTitle icon={FolderKanban} title="Projects" />
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-transparent capitalize transition-all"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize bg-raised text-white">
                {s === 'all' ? 'All Statuses' : s}
              </option>
            ))}
          </select>
          <Link
            href="/admin/projects/new"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 text-sm font-semibold text-black hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <Plus size={16} />
            New Project
          </Link>
        </div>
      </div>

      <SearchFilter
        value={search}
        onChange={setSearch}
        placeholder="Find a project or client..."
        count={shown.length}
        total={projects.length}
      />

      <div className="flex flex-wrap items-center gap-3 mt-4 mb-2">
        <button
          onClick={() => setAttentionOnly((v) => !v)}
          className={`text-sm px-3.5 py-1.5 rounded-full border transition-colors ${
            attentionOnly
              ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
              : 'border-white/15 text-white/60 hover:bg-white/5'
          }`}
        >
          Needs attention {attentionCount > 0 && `(${attentionCount})`}
        </button>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="text-sm px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-white/70 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
        >
          <option value="attention" className="bg-raised text-white">Sort: Needs attention first</option>
          <option value="stalest" className="bg-raised text-white">Sort: Quietest first</option>
          <option value="newest" className="bg-raised text-white">Sort: Newest first</option>
        </select>
      </div>

      {loading ? (
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-sm text-white/40">Loading projects…</p>
        </div>
      ) : failed ? (
        <Card className="p-4">
          <LoadError what="the project list" onRetry={load} />
        </Card>
      ) : shown.length === 0 ? (
        <Card className="p-12 text-center text-white/40">
          {search ? `Nothing matches "${search}".` : 'No projects found.'}
        </Card>
      ) : (
        <div className="space-y-2">
          {shown.map((project) => (
            <Link
              key={project.id}
              href={`/admin/projects/${project.id}`}
              className={`group block rounded-2xl border p-4 transition-colors ${
                needsAttention(project)
                  ? 'border-amber-400/25 bg-amber-400/[0.03] hover:border-amber-400/45'
                  : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="truncate font-semibold text-white">{project.client.company}</p>
                  <p className="truncate text-xs text-white/40">{project.name}</p>
                </div>

                {/* The two halves of a project, side by side: how far the
                    build has got, and how much of it has been paid for. */}
                <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1.5">
                  <StagePips status={project.status} />
                  <PaymentPips project={project} />
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <HealthBadges project={project} />
                  <span className="text-[11px] text-white/25">
                    {project.timeline || '—'} · started{' '}
                    {new Date(project.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageIn>
  );
}
