'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ClientHeader } from '@/components/portal/ClientHeader';
import { GridBackdrop } from '@/components/ui';
import { formatCents } from '@/lib/pricing';

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  statusStage: number;
  timeline: string | null;
  baseService: string;
  totalPrice: number;
  createdAt: string;
  updates: Array<{ createdAt: string }>;
  _count: { messages: number };
}

function hasUnseenActivity(project: ProjectSummary): boolean {
  const lastVisit = Number(localStorage.getItem(`bothmade_last_visit_${project.id}`) || 0);
  const latestUpdateAt = project.updates[0] ? new Date(project.updates[0].createdAt).getTime() : 0;
  const hasNewUpdate = lastVisit > 0 && latestUpdateAt > lastVisit;

  const seenMessages = Number(localStorage.getItem(`bothmade_seen_messages_${project.id}`) || 0);
  const hasNewMessage = project._count.messages > seenMessages;

  return hasNewUpdate || hasNewMessage;
}

const STATUS_STAGES = ['Discovery', 'Design', 'Build', 'Launch', 'Complete'];

export default function ClientProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [company, setCompany] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unseenIds, setUnseenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const [projectsRes, meRes] = await Promise.all([
          fetch('/api/client/projects'),
          fetch('/api/auth/me'),
        ]);
        if (projectsRes.status === 401) {
          router.push('/client/login');
          return;
        }
        const data = await projectsRes.json();
        if (data.success) {
          setProjects(data.projects);
          setUnseenIds(
            new Set(
              data.projects
                .filter((p: ProjectSummary) => hasUnseenActivity(p))
                .map((p: ProjectSummary) => p.id)
            )
          );
        } else {
          setError(data.error || 'Failed to load projects');
        }
        const me = await meRes.json().catch(() => null);
        if (me?.client?.contactName || me?.client?.company) {
          setCompany(me.client.contactName || me.client.company);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects');
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, [router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#05030a] text-white flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-[#05030a] text-white overflow-hidden">
      <GridBackdrop className="opacity-40" />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-96 w-[40rem] rounded-full blur-[140px] opacity-20"
        style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.5), transparent 70%)' }}
      />

      <div className="relative">
        <ClientHeader />

        <div className="max-w-6xl mx-auto px-6 py-12">
          <p className="text-sm text-white/40 mb-1">Welcome back{company ? `, ${company}` : ''}</p>
          <h1 className="text-3xl font-bold mb-8">Your Projects</h1>

          {error && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-red-300 mb-6">
              {error}
            </div>
          )}

          {projects.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-12 text-center">
              <h2 className="text-xl font-bold mb-2">No projects yet</h2>
              <p className="text-white/50">We'll reach out soon to get your project started!</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {projects.map((project) => {
                const stageIndex = Math.min(project.statusStage, 4);
                const progress = ((stageIndex + 1) / STATUS_STAGES.length) * 100;

                return (
                  <div
                    key={project.id}
                    className="group rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.03] backdrop-blur-xl p-8 hover:border-sky-400/30 hover:shadow-[0_0_50px_-15px_rgba(56,189,248,0.25)] transition-all"
                  >
                    <div className="flex justify-between items-start mb-5">
                      <div>
                        <h2 className="text-xl font-bold">{project.name}</h2>
                        <p className="text-sm text-white/50 capitalize">
                          {project.baseService.replace('-', ' ')} · {formatCents(project.totalPrice)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {unseenIds.has(project.id) && (
                          <span
                            className="h-2 w-2 rounded-full bg-emerald-400"
                            title="New activity"
                            aria-label="New activity"
                          />
                        )}
                        <span className="px-3 py-1 rounded-full bg-gradient-to-r from-sky-400 to-purple-500 text-black text-xs font-semibold whitespace-nowrap">
                          {STATUS_STAGES[stageIndex]}
                        </span>
                      </div>
                    </div>

                    <div className="mb-2">
                      <div className="w-full bg-white/10 rounded-full h-1.5">
                        <div
                          className="bg-gradient-to-r from-sky-400 to-purple-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] text-white/30 mb-6">
                      {STATUS_STAGES.map((stage, i) => (
                        <span key={stage} className={i <= stageIndex ? 'text-sky-300' : ''}>
                          {stage}
                        </span>
                      ))}
                    </div>

                    <Link
                      href={`/client/${project.id}`}
                      className="group/btn relative inline-block overflow-hidden rounded-full border border-white/25 hover:border-white px-6 py-2.5 text-sm font-medium transition-colors duration-500"
                    >
                      <span className="relative z-10 transition-colors duration-500 group-hover/btn:text-black">
                        Open project
                      </span>
                      <span className="absolute inset-0 translate-y-full bg-white transition-transform duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] group-hover/btn:translate-y-0" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
