'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { GridBackdrop } from '@/components/ui';

interface PublicProject {
  name: string;
  company: string;
  statusStage: number;
  estimatedCompletionDate: string | null;
  updates: Array<{ id: string; title: string; description: string; createdAt: string }>;
}

const STATUS_STAGES = ['Discovery', 'Design', 'Build', 'Launch', 'Complete'];

export default function PublicStatusPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  // The capability token from the shared link — the project ID on its own
  // isn't enough to read this page any more. Read off window rather than
  // useSearchParams() so this page needs no Suspense boundary to prerender.
  const [shareToken, setShareToken] = useState<string | null>(null);

  useEffect(() => {
    setShareToken(new URLSearchParams(window.location.search).get('t') || '');
  }, []);

  const [project, setProject] = useState<PublicProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (shareToken === null) return;
    fetch(`/api/public/projects/${projectId}/status?t=${encodeURIComponent(shareToken)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setProject(data.project);
        } else {
          setError(data.error || 'Failed to load project status');
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load project status'))
      .finally(() => setLoading(false));
  }, [projectId, shareToken]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#05030a] flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400" />
      </main>
    );
  }

  if (error || !project) {
    return (
      <main className="min-h-screen bg-[#05030a] text-white flex items-center justify-center px-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">Not found</h1>
          <p className="text-white/50">{error || "This status link doesn't exist or has expired."}</p>
        </div>
      </main>
    );
  }

  const stageIndex = Math.min(project.statusStage, 4);
  const currentStage = STATUS_STAGES[stageIndex];
  const progressPct = ((stageIndex + 1) / STATUS_STAGES.length) * 100;

  return (
    <main className="relative min-h-screen bg-[#05030a] text-white overflow-hidden">
      <GridBackdrop className="opacity-40" />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-96 w-[40rem] rounded-full blur-[140px] opacity-20"
        style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.5), transparent 70%)' }}
      />

      <div className="relative max-w-3xl mx-auto px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-300/80 mb-2">
          {project.company} · Read-only status
        </p>
        <h1 className="text-3xl md:text-4xl font-bold mb-10">{project.name}</h1>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold">{currentStage}</span>
            <span className="text-sm text-white/50">{stageIndex + 1}/5</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2 mb-2">
            <div
              className="bg-gradient-to-r from-sky-400 to-purple-500 h-2 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {project.estimatedCompletionDate && (
            <p className="text-xs text-white/40 mb-6">
              Estimated target:{' '}
              <span className="text-white/70 font-medium">
                {new Date(project.estimatedCompletionDate).toLocaleDateString(undefined, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </p>
          )}
          {!project.estimatedCompletionDate && <div className="mb-6" />}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {STATUS_STAGES.map((stage, idx) => (
              <div
                key={stage}
                className={`p-3 rounded-lg text-center text-sm font-medium transition-colors ${
                  idx <= stageIndex
                    ? 'bg-gradient-to-r from-sky-400/20 to-purple-500/20 border border-sky-400/30 text-white'
                    : 'bg-white/5 border border-white/10 text-white/30'
                }`}
              >
                {stage}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
          <h2 className="text-xl font-bold mb-6">Recent Updates</h2>
          {project.updates.length === 0 ? (
            <p className="text-sm text-white/40">No updates yet.</p>
          ) : (
            <div className="space-y-4">
              {project.updates.map((update) => (
                <div key={update.id} className="border-b border-white/10 pb-4 last:border-b-0 last:pb-0">
                  <h3 className="font-semibold mb-1">{update.title}</h3>
                  <p className="text-white/50 text-sm mb-2">{update.description}</p>
                  <p className="text-xs text-white/30">{new Date(update.createdAt).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-white/25 mt-10">
          Shared read-only view — no login required.
        </p>
      </div>
    </main>
  );
}
