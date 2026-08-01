'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ClientHeader } from '@/components/portal/ClientHeader';

interface Project {
  id: string;
  name: string;
  status: string;
  statusStage: number;
  timeline: string;
  baseService: string;
  addOns: string[];
  totalPrice: number;
  createdAt: string;
  updatedAt: string;
  messages: any[];
  updates: any[];
  deliverables: Array<{ id: string; name: string; url: string; size?: string }>;
  client: any;
}

const STATUS_STAGES = ['Discovery', 'Design', 'Build', 'Launch', 'Complete'];

const STAGE_EXPLANATIONS: Record<string, string> = {
  Discovery:
    "We're mapping out exactly what you need — the requirements, the pages or screens involved, and how it should all work together. This is the planning phase before anything is designed or built.",
  Design:
    "We're designing how your product looks and feels — layouts and mockups for you to review, before a single line of code is written.",
  Build:
    "Our engineers are writing the actual software — turning the approved designs into a real, working product.",
  Launch:
    "We're testing everything end-to-end, fixing edge cases, and getting your product live — deployed to the web, or submitted to the App Store.",
  Complete:
    "Your project is live and delivered. We're here for any follow-up support you need.",
};

export default function ClientDashboard() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'messages'>('overview');
  const [messageContent, setMessageContent] = useState('');

  useEffect(() => {
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadProject = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (response.status === 401) {
        router.push('/client/login');
        return;
      }
      const data = await response.json();
      if (data.success) {
        setProject(data.project);
      } else {
        setError(data.error || 'Failed to load project');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageContent.trim()) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: messageContent }),
      });

      if (response.ok) {
        setMessageContent('');
        loadProject();
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#05030a] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400 mb-4"></div>
          <p className="text-white/50 text-sm">Loading project...</p>
        </div>
      </main>
    );
  }

  if (error || !project) {
    return (
      <main className="min-h-screen bg-[#05030a] text-white flex items-center justify-center px-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 max-w-md">
          <h1 className="text-2xl font-bold mb-4">Error</h1>
          <p className="text-white/50 mb-6">{error || 'Project not found'}</p>
          <Link href="/client/login" className="text-sky-300 font-semibold hover:underline">
            Back to Login
          </Link>
        </div>
      </main>
    );
  }

  const currentStage = STATUS_STAGES[Math.min(project.statusStage, 4)];
  const progressPct = ((Math.min(project.statusStage + 1, 5)) / 5) * 100;

  return (
    <main className="min-h-screen bg-[#05030a] text-white">
      <ClientHeader />

      {/* Project header */}
      <div className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="text-white/50 text-sm mt-1">
            {project.client.company} • Created {new Date(project.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-white/10">
          {(['overview', 'timeline', 'messages'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-sky-400 text-white'
                  : 'border-transparent text-white/40 hover:text-white'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Current Status */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
              <h2 className="text-xl font-bold mb-6">Project Status</h2>

              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold">{currentStage}</span>
                <span className="text-sm text-white/50">
                  {Math.min(project.statusStage + 1, 5)}/5
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 mb-8">
                <div
                  className="bg-gradient-to-r from-sky-400 to-purple-500 h-2 rounded-full transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {STATUS_STAGES.map((stage, idx) => {
                  const reached = idx <= Math.min(project.statusStage, 4);
                  return (
                    <div
                      key={stage}
                      className={`p-3 rounded-lg text-center text-sm font-medium transition-colors ${
                        reached
                          ? 'bg-gradient-to-r from-sky-400/20 to-purple-500/20 border border-sky-400/30 text-white'
                          : 'bg-white/5 border border-white/10 text-white/30'
                      }`}
                    >
                      {stage}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 rounded-lg bg-white/5 border border-white/10 p-4">
                <p className="text-sm font-semibold text-sky-300 mb-1">What's happening in {currentStage}?</p>
                <p className="text-sm text-white/60">{STAGE_EXPLANATIONS[currentStage]}</p>
              </div>
            </div>

            {/* Project Details */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
              <h2 className="text-xl font-bold mb-6">Project Details</h2>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm text-white/40 mb-1">Service Type</h3>
                  <p className="text-lg font-semibold capitalize">{project.baseService.replace('-', ' ')}</p>
                </div>

                <div>
                  <h3 className="text-sm text-white/40 mb-1">Timeline</h3>
                  <p className="text-lg font-semibold">{project.timeline || 'To be determined'}</p>
                </div>

                <div>
                  <h3 className="text-sm text-white/40 mb-1">Project Value</h3>
                  <p className="text-lg font-semibold">${(project.totalPrice / 100).toLocaleString()}</p>
                </div>

                {project.addOns.length > 0 && (
                  <div>
                    <h3 className="text-sm text-white/40 mb-1">Add-ons</h3>
                    <p className="text-lg font-semibold">
                      {project.addOns.map((addon) => addon.charAt(0).toUpperCase() + addon.slice(1)).join(', ')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Deliverables */}
            {project.deliverables.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
                <h2 className="text-xl font-bold mb-6">Deliverables</h2>
                <div className="space-y-3">
                  {project.deliverables.map((file) => (
                    <a
                      key={file.id}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex justify-between items-center p-4 rounded-lg border border-white/10 hover:border-white/25 transition-colors"
                    >
                      <div>
                        <p className="font-medium">{file.name}</p>
                        {file.size && <p className="text-xs text-white/40">{file.size}</p>}
                      </div>
                      <span className="text-sm font-semibold text-sky-300">Download</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Latest Updates */}
            {project.updates.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
                <h2 className="text-xl font-bold mb-6">Latest Updates</h2>

                <div className="space-y-4">
                  {project.updates.slice(0, 3).map((update) => (
                    <div key={update.id} className="border-b border-white/10 pb-4 last:border-b-0 last:pb-0">
                      <h3 className="font-semibold mb-1">{update.title}</h3>
                      <p className="text-white/50 text-sm mb-2">{update.description}</p>
                      <p className="text-xs text-white/30">
                        {new Date(update.createdAt).toLocaleDateString()} by {update.user?.name || 'Bothmade'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Timeline Tab */}
        {activeTab === 'timeline' && (
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
            <h2 className="text-xl font-bold mb-6">Project Timeline</h2>

            <div className="space-y-4">
              {project.updates.length > 0 ? (
                project.updates.map((update, idx) => (
                  <div key={update.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-gradient-to-r from-sky-400 to-purple-500"></div>
                      {idx < project.updates.length - 1 && (
                        <div className="w-px h-16 bg-white/10 mt-1"></div>
                      )}
                    </div>
                    <div className="flex-1 pb-8">
                      <h3 className="font-semibold mb-1">{update.title}</h3>
                      <p className="text-white/50 mb-2 text-sm">{update.description}</p>
                      <p className="text-xs text-white/30">
                        {new Date(update.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-white/50">No updates yet. Check back soon!</p>
              )}
            </div>
          </div>
        )}

        {/* Messages Tab */}
        {activeTab === 'messages' && (
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
            <h2 className="text-xl font-bold mb-6">Project Messages</h2>

            <div className="space-y-4 mb-8 max-h-96 overflow-y-auto">
              {project.messages.length > 0 ? (
                project.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`p-4 rounded-lg border-l-2 ${
                      message.isFromAdmin
                        ? 'bg-white/5 border-white/30'
                        : 'bg-sky-400/10 border-sky-400/50'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-semibold text-sm">
                        {message.isFromAdmin ? message.user?.name || 'Team' : 'You'}
                      </p>
                      <p className="text-xs text-white/30">
                        {new Date(message.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <p className="text-white/70 text-sm">{message.content}</p>
                  </div>
                ))
              ) : (
                <p className="text-white/50">No messages yet. Start a conversation with the team!</p>
              )}
            </div>

            <form onSubmit={handleSendMessage} className="space-y-4">
              <textarea
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder="Type your message..."
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent resize-none transition-colors"
                rows={4}
              />
              <button
                type="submit"
                disabled={!messageContent.trim()}
                className="rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-6 py-3 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                Send Message
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
