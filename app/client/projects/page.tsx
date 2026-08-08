'use client';

import { useEffect, useState } from 'react';
import { loginWithReturn } from '@/lib/client-return-to';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, type Variants } from 'framer-motion';
import { ClientHeader } from '@/components/portal/ClientHeader';
import { GridBackdrop, CountUp } from '@/components/ui';
import { formatCents } from '@/lib/pricing';

const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};

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
          router.push(loginWithReturn(window.location.pathname, window.location.search));
          return;
        }
        const data = await projectsRes.json();
        // The server now refuses everything but the settings page until the
        // auto-generated password is replaced — follow it there.
        if (data?.code === 'PASSWORD_CHANGE_REQUIRED') {
          router.push('/client/settings?force=1');
          return;
        }
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
        setError('Failed to load projects');
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
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
            <p className="text-sm text-white/40 mb-1">Welcome back{company ? `, ${company}` : ''}</p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-8">Your Projects</h1>
          </motion.div>

          {error && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-red-300 mb-6">
              {error}
            </div>
          )}

          {projects.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}
              className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-12 text-center"
            >
              <h2 className="text-xl font-bold mb-2">No projects yet</h2>
              <p className="text-white/50">We'll reach out soon to get your project started!</p>
            </motion.div>
          ) : (
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              {projects.map((project) => {
                const stageIndex = Math.min(project.statusStage, 4);
                const progress = ((stageIndex + 1) / STATUS_STAGES.length) * 100;

                return (
                  <motion.div
                    key={project.id}
                    variants={fadeUp}
                    whileHover={{ y: -4 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className="group rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.03] backdrop-blur-xl p-8 hover:border-sky-400/30 hover:shadow-[0_0_50px_-15px_rgba(56,189,248,0.25)] transition-colors"
                  >
                    <div className="flex justify-between items-start mb-5 gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400/25 to-purple-500/25 border border-white/10 text-sm font-bold text-white/90">
                          {project.name.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <h2 className="text-xl font-bold break-words">{project.name}</h2>
                          <p className="text-sm text-white/50 capitalize">
                            {project.baseService.replace('-', ' ')} ·{' '}
                            <CountUp value={formatCents(project.totalPrice)} />
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {unseenIds.has(project.id) && (
                          <motion.span
                            animate={{ opacity: [1, 0.4, 1] }}
                            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
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
                      <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.9, ease: EASE, delay: 0.3 }}
                          className="bg-gradient-to-r from-sky-400 to-purple-500 h-1.5 rounded-full"
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
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      </div>
    </main>
  );
}
