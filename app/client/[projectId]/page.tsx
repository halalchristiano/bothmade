'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

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

export default function ClientDashboard() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'messages' | 'settings'>('overview');
  const [messageContent, setMessageContent] = useState('');
  const [preferences, setPreferences] = useState({
    notificationsEnabled: true,
    digestFrequency: 'daily',
    statusUpdates: true,
    messages: true,
  });

  useEffect(() => {
    loadProject();
    loadPreferences();
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

  const loadPreferences = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/email-preferences`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPreferences(data.preferences);
        }
      }
    } catch (err) {
      console.error('Failed to load preferences:', err);
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

  const handleUpdatePreferences = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/email-preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });

      if (response.ok) {
        alert('Preferences updated successfully');
      }
    } catch (err) {
      alert('Failed to update preferences');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/client/login');
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-black mb-4"></div>
            <p className="text-gray-600">Loading project...</p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !project) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md">
          <h1 className="text-2xl font-bold mb-4">Error</h1>
          <p className="text-gray-600 mb-6">{error || 'Project not found'}</p>
          <Link href="/client/login" className="text-black font-semibold hover:underline">
            Back to Login
          </Link>
        </div>
      </main>
    );
  }

  const statusStages = ['Discovery', 'Design', 'Build', 'Launch', 'Complete'];
  const currentStage = statusStages[Math.min(project.statusStage, 4)];

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <p className="text-gray-600 text-sm">
              {project.client.company} • Created {new Date(project.createdAt).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-gray-600 hover:text-black transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-gray-200">
          {(['overview', 'timeline', 'messages', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-600 hover:text-black'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Current Status */}
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold mb-6">Project Status</h2>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">{currentStage}</span>
                    <span className="text-sm text-gray-600">
                      {Math.min(project.statusStage + 1, 5)}/5
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-black h-3 rounded-full transition-all"
                      style={{
                        width: `${((Math.min(project.statusStage + 1, 5)) / 5) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                  {statusStages.map((stage, idx) => (
                    <div
                      key={stage}
                      className={`p-4 rounded-lg text-center text-sm font-medium ${
                        idx <= Math.min(project.statusStage, 4)
                          ? 'bg-black text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {stage}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Project Details */}
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold mb-6">Project Details</h2>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm text-gray-600 mb-1">Service Type</h3>
                  <p className="text-lg font-semibold capitalize">{project.baseService.replace('-', ' ')}</p>
                </div>

                <div>
                  <h3 className="text-sm text-gray-600 mb-1">Timeline</h3>
                  <p className="text-lg font-semibold">{project.timeline || 'To be determined'}</p>
                </div>

                <div>
                  <h3 className="text-sm text-gray-600 mb-1">Project Value</h3>
                  <p className="text-lg font-semibold">${(project.totalPrice / 100).toLocaleString()}</p>
                </div>

                {project.addOns.length > 0 && (
                  <div>
                    <h3 className="text-sm text-gray-600 mb-1">Add-ons</h3>
                    <p className="text-lg font-semibold">
                      {project.addOns.map((addon) => addon.charAt(0).toUpperCase() + addon.slice(1)).join(', ')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Deliverables */}
            {project.deliverables.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-8">
                <h2 className="text-2xl font-bold mb-6">Deliverables</h2>
                <div className="space-y-3">
                  {project.deliverables.map((file) => (
                    <a
                      key={file.id}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex justify-between items-center p-4 rounded-lg border border-gray-200 hover:border-gray-400 transition-colors"
                    >
                      <div>
                        <p className="font-medium">{file.name}</p>
                        {file.size && <p className="text-xs text-gray-500">{file.size}</p>}
                      </div>
                      <span className="text-sm font-semibold text-black">Download</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Latest Updates */}
            {project.updates.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-8">
                <h2 className="text-2xl font-bold mb-6">Latest Updates</h2>

                <div className="space-y-4">
                  {project.updates.slice(0, 3).map((update) => (
                    <div key={update.id} className="border-b border-gray-200 pb-4 last:border-b-0">
                      <h3 className="font-semibold mb-1">{update.title}</h3>
                      <p className="text-gray-600 text-sm mb-2">{update.description}</p>
                      <p className="text-xs text-gray-500">
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
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold mb-6">Project Timeline</h2>

            <div className="space-y-4">
              {project.updates.length > 0 ? (
                project.updates.map((update, idx) => (
                  <div key={update.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-4 h-4 bg-black rounded-full"></div>
                      {idx < project.updates.length - 1 && <div className="w-1 h-16 bg-gray-300"></div>}
                    </div>
                    <div className="flex-1 pb-8">
                      <h3 className="font-semibold mb-1">{update.title}</h3>
                      <p className="text-gray-600 mb-2">{update.description}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(update.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-600">No updates yet. Check back soon!</p>
              )}
            </div>
          </div>
        )}

        {/* Messages Tab */}
        {activeTab === 'messages' && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold mb-6">Project Messages</h2>

            <div className="space-y-4 mb-8 max-h-96 overflow-y-auto">
              {project.messages.length > 0 ? (
                project.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`p-4 rounded-lg ${
                      message.isFromAdmin
                        ? 'bg-gray-100 border-l-4 border-black'
                        : 'bg-blue-50 border-l-4 border-blue-500'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-semibold">
                        {message.isFromAdmin ? message.user?.name || 'Team' : 'You'}
                      </p>
                      <p className="text-xs text-gray-600">
                        {new Date(message.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <p className="text-gray-700">{message.content}</p>
                  </div>
                ))
              ) : (
                <p className="text-gray-600">No messages yet. Start a conversation with the team!</p>
              )}
            </div>

            <form onSubmit={handleSendMessage} className="space-y-4">
              <textarea
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder="Type your message..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black resize-none"
                rows={4}
              />
              <button
                type="submit"
                disabled={!messageContent.trim()}
                className="bg-black text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50 hover:bg-gray-900 transition-colors"
              >
                Send Message
              </button>
            </form>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold mb-6">Email Preferences</h2>

            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                <div>
                  <h3 className="font-semibold">Notifications</h3>
                  <p className="text-sm text-gray-600">Receive email notifications</p>
                </div>
                <button
                  onClick={() =>
                    setPreferences({
                      ...preferences,
                      notificationsEnabled: !preferences.notificationsEnabled,
                    })
                  }
                  className={`w-12 h-6 rounded-full transition-colors ${
                    preferences.notificationsEnabled ? 'bg-black' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      preferences.notificationsEnabled
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="pb-4 border-b border-gray-200">
                <h3 className="font-semibold mb-3">Email Frequency</h3>
                <select
                  value={preferences.digestFrequency}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      digestFrequency: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                >
                  <option value="immediate">Immediate</option>
                  <option value="daily">Daily Digest</option>
                  <option value="weekly">Weekly Digest</option>
                </select>
              </div>

              <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                <div>
                  <h3 className="font-semibold">Status Updates</h3>
                  <p className="text-sm text-gray-600">When project status changes</p>
                </div>
                <button
                  onClick={() =>
                    setPreferences({
                      ...preferences,
                      statusUpdates: !preferences.statusUpdates,
                    })
                  }
                  className={`w-12 h-6 rounded-full transition-colors ${
                    preferences.statusUpdates ? 'bg-black' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      preferences.statusUpdates
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">New Messages</h3>
                  <p className="text-sm text-gray-600">When team sends a message</p>
                </div>
                <button
                  onClick={() =>
                    setPreferences({
                      ...preferences,
                      messages: !preferences.messages,
                    })
                  }
                  className={`w-12 h-6 rounded-full transition-colors ${
                    preferences.messages ? 'bg-black' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      preferences.messages ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <button
                onClick={handleUpdatePreferences}
                className="w-full bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-900 transition-colors mt-8"
              >
                Save Preferences
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
