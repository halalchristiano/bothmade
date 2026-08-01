'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ClientHeader } from '@/components/portal/ClientHeader';

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  statusStage: number;
  timeline: string | null;
  baseService: string;
  totalPrice: number;
  createdAt: string;
}

const STATUS_STAGES = ['Discovery', 'Design', 'Build', 'Launch', 'Complete'];

export default function ClientProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await fetch('/api/client/projects');
        if (response.status === 401) {
          router.push('/client/login');
          return;
        }
        const data = await response.json();
        if (data.success) {
          setProjects(data.projects);
        } else {
          setError(data.error || 'Failed to load projects');
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
    <main className="min-h-screen bg-[#05030a] text-white">
      <ClientHeader />

      <div className="max-w-6xl mx-auto px-6 py-12">
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
                  className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 hover:border-white/20 transition-colors"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-xl font-bold">{project.name}</h2>
                      <p className="text-sm text-white/50 capitalize">
                        {project.baseService.replace('-', ' ')}
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-gradient-to-r from-sky-400 to-purple-500 text-black text-xs font-semibold">
                      {STATUS_STAGES[stageIndex]}
                    </span>
                  </div>

                  <div className="mb-6">
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div
                        className="bg-gradient-to-r from-sky-400 to-purple-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <Link
                    href={`/client/${project.id}`}
                    className="group relative inline-block overflow-hidden rounded-full border border-white/25 hover:border-white px-6 py-2.5 text-sm font-medium transition-colors duration-500"
                  >
                    <span className="relative z-10 transition-colors duration-500 group-hover:text-black">
                      Open project
                    </span>
                    <span className="absolute inset-0 translate-y-full bg-white transition-transform duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] group-hover:translate-y-0" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
