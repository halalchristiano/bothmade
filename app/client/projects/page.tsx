'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/client/login');
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-black mb-4"></div>
          <p className="text-gray-600">Loading your projects...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold">Your Projects</h1>
          <div className="flex items-center gap-6">
            <Link href="/client/settings" className="text-gray-600 hover:text-black transition-colors">
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-gray-600 hover:text-black transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6">
            {error}
          </div>
        )}

        {projects.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <h2 className="text-2xl font-bold mb-2">No projects yet</h2>
            <p className="text-gray-600">We'll reach out soon to get your project started!</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {projects.map((project) => {
              const stageIndex = Math.min(project.statusStage, 4);
              const progress = ((stageIndex + 1) / STATUS_STAGES.length) * 100;

              return (
                <div key={project.id} className="bg-white rounded-2xl shadow-lg p-8">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-xl font-bold">{project.name}</h2>
                      <p className="text-sm text-gray-600 capitalize">
                        {project.baseService.replace('-', ' ')}
                      </p>
                    </div>
                    <span className="px-3 py-1 bg-black text-white text-xs font-semibold rounded-full">
                      {STATUS_STAGES[stageIndex]}
                    </span>
                  </div>

                  <div className="mb-6">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-black h-2 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <Link
                    href={`/client/${project.id}`}
                    className="inline-block bg-black text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-gray-900 transition-colors"
                  >
                    Open project
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
