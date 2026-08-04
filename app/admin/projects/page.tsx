'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { amountPaidTowardProject } from '@/lib/billing';
import { AlertTriangle, FolderKanban, MessageSquare, Plus } from 'lucide-react';
import { Badge, Card, Kicker, PageIn, PageTitle, SearchFilter, matchesSearch } from '@/components/admin/ui';

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  timeline: string | null;
  createdAt: string;
  updatedAt: string;
  totalPrice: number;
  client: { company: string; email: string };
  messages: Array<{ isFromAdmin: boolean; createdAt: string }>;
  payments: Array<{ amount: number; type: string }>;
}

const STATUSES = ['all', 'discovery', 'design', 'build', 'launch', 'complete'];
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

/** Anything a PM would actually want to look at today, in one signal. */
function needsAttention(project: ProjectRow): boolean {
  return isAtRisk(project) || isAwaitingReply(project) || (project.status !== 'complete' && balanceDue(project) > 0);
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

export default function AdminProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'attention' | 'newest' | 'stalest'>('attention');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const query = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
        const response = await fetch(`/api/admin/projects${query}`);
        if (response.status === 401) {
          router.push('/admin/login');
          return;
        }
        const data = await response.json();
        if (data.success) {
          setProjects(data.projects);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router, statusFilter]);

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
      ) : shown.length === 0 ? (
        <Card className="p-12 text-center text-white/40">
          {search ? `Nothing matches "${search}".` : 'No projects found.'}
        </Card>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {shown.map((project) => (
              <Link
                key={project.id}
                href={`/admin/projects/${project.id}`}
                className={`block rounded-xl border bg-white/[0.04] backdrop-blur-xl p-4 transition-colors ${
                  needsAttention(project) ? 'border-amber-400/30' : 'border-white/[0.08] hover:border-white/20'
                }`}
              >
                <div className="flex justify-between items-start mb-1 gap-2">
                  <p className="font-semibold">{project.name}</p>
                  <Badge tone="neutral" solid>
                    <span className="capitalize">{project.status}</span>
                  </Badge>
                </div>
                <p className="text-sm text-white/50 mb-2">{project.client.company}</p>
                <div className="mb-2">
                  <HealthBadges project={project} />
                </div>
                <div className="flex justify-between text-xs text-white/40">
                  <span>{project.timeline || '—'}</span>
                  <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: table */}
          <Card className="hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-white/10">
                  <tr>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Project</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Client</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Status</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Health</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Timeline</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Created</th>
                    <th className="px-6 py-3 text-sm font-semibold text-white/40">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((project) => (
                    <tr key={project.id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-medium">{project.name}</td>
                      <td className="px-6 py-4 text-white/50">{project.client.company}</td>
                      <td className="px-6 py-4">
                        <Badge tone="neutral" solid>
                          <span className="capitalize">{project.status}</span>
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <HealthBadges project={project} />
                      </td>
                      <td className="px-6 py-4 text-white/50">{project.timeline || '—'}</td>
                      <td className="px-6 py-4 text-white/50">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/admin/projects/${project.id}`}
                          className="text-sky-300 font-semibold hover:underline"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </PageIn>
  );
}
