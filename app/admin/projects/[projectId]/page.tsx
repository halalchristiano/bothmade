'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { formatCents } from '@/lib/pricing';

interface Deliverable {
  id: string;
  name: string;
  url: string;
  size?: string;
}

interface ProjectDetail {
  id: string;
  name: string;
  status: string;
  statusStage: number;
  baseService: string;
  addOns: string[];
  timeline: string | null;
  basePrice: number;
  totalPrice: number;
  deliverables: Deliverable[];
  createdAt: string;
  client: { id: string; email: string; company: string };
  messages: Array<{
    id: string;
    content: string;
    isFromAdmin: boolean;
    createdAt: string;
    user?: { name: string } | null;
    client?: { company: string } | null;
  }>;
  updates: Array<{
    id: string;
    title: string;
    description: string;
    statusStage: string;
    createdAt: string;
    user?: { name: string } | null;
  }>;
}

const STATUSES = ['discovery', 'design', 'build', 'launch', 'complete'];

export default function AdminProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [statusDraft, setStatusDraft] = useState('');
  const [statusDescription, setStatusDescription] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  const [messageContent, setMessageContent] = useState('');
  const [messageSending, setMessageSending] = useState(false);

  const [deliverableName, setDeliverableName] = useState('');
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [deliverableSize, setDeliverableSize] = useState('');
  const [deliverableSaving, setDeliverableSaving] = useState(false);

  const loadProject = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await response.json();
      if (data.success) {
        setProject(data.project);
        setStatusDraft(data.project.status);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleStatusUpdate = async () => {
    setStatusSaving(true);
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusDraft, description: statusDescription }),
      });
      if (response.ok) {
        setStatusDescription('');
        loadProject();
      }
    } finally {
      setStatusSaving(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageContent.trim()) return;
    setMessageSending(true);
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: messageContent }),
      });
      if (response.ok) {
        setMessageContent('');
        loadProject();
      }
    } finally {
      setMessageSending(false);
    }
  };

  const handleAddDeliverable = async () => {
    if (!deliverableName.trim() || !deliverableUrl.trim()) return;
    setDeliverableSaving(true);
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/deliverables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: deliverableName,
          url: deliverableUrl,
          size: deliverableSize || undefined,
        }),
      });
      if (response.ok) {
        setDeliverableName('');
        setDeliverableUrl('');
        setDeliverableSize('');
        loadProject();
      }
    } finally {
      setDeliverableSaving(false);
    }
  };

  const handleDeleteDeliverable = async (id: string) => {
    await fetch(`/api/admin/projects/${projectId}/deliverables?id=${id}`, {
      method: 'DELETE',
    });
    loadProject();
  };

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  // Merge messages + updates into one chronological thread
  const thread = [
    ...project.updates.map((u) => ({ type: 'update' as const, at: u.createdAt, data: u })),
    ...project.messages.map((m) => ({ type: 'message' as const, at: m.createdAt, data: m })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href="/admin/projects" className="text-gray-600 hover:text-black text-sm">
          ← Back to Projects
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        {/* LEFT: Project Info */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h1 className="text-2xl font-bold mb-1">{project.name}</h1>
            <Link
              href={`/admin/clients/${project.client.id}`}
              className="text-sm text-gray-600 hover:text-black hover:underline"
            >
              {project.client.company}
            </Link>

            <div className="mt-6 space-y-4 text-sm">
              <div>
                <p className="text-gray-600 mb-1">Base Service</p>
                <p className="font-medium capitalize">{project.baseService.replace('-', ' ')}</p>
              </div>
              {project.addOns.length > 0 && (
                <div>
                  <p className="text-gray-600 mb-1">Add-ons</p>
                  <p className="font-medium capitalize">{project.addOns.join(', ')}</p>
                </div>
              )}
              <div>
                <p className="text-gray-600 mb-1">Timeline</p>
                <p className="font-medium">{project.timeline || '—'}</p>
              </div>
              <div>
                <p className="text-gray-600 mb-1">Total Price</p>
                <p className="font-medium">{formatCents(project.totalPrice)}</p>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm font-semibold mb-3">Current Status</p>
              <span className="inline-block px-3 py-1.5 bg-black text-white text-sm font-semibold rounded-full capitalize mb-4">
                {project.status}
              </span>

              <select
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3 capitalize"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s}
                  </option>
                ))}
              </select>
              <textarea
                value={statusDescription}
                onChange={(e) => setStatusDescription(e.target.value)}
                placeholder="Describe this update for the client..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none mb-3"
              />
              <button
                onClick={handleStatusUpdate}
                disabled={statusSaving || statusDraft === project.status && !statusDescription}
                className="w-full bg-black text-white py-2.5 rounded-lg font-semibold hover:bg-gray-900 disabled:opacity-50 transition-colors"
              >
                {statusSaving ? 'Saving...' : 'Send Status Update'}
              </button>
            </div>
          </div>
        </div>

        {/* CENTER: Messages & Updates */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4">Activity</h2>
            <div className="space-y-4 max-h-[500px] overflow-y-auto mb-6">
              {thread.length === 0 && (
                <p className="text-gray-600 text-sm">No activity yet.</p>
              )}
              {thread.map((item) => {
                if (item.type === 'update') {
                  const u = item.data;
                  return (
                    <div key={`u-${u.id}`} className="p-4 rounded-lg bg-gray-50 border-l-4 border-black">
                      <div className="flex justify-between items-start mb-1">
                        <p className="font-semibold text-sm">{u.title}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(u.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <p className="text-sm text-gray-700">{u.description}</p>
                    </div>
                  );
                }
                const m = item.data;
                return (
                  <div
                    key={`m-${m.id}`}
                    className={`p-4 rounded-lg ${
                      m.isFromAdmin ? 'bg-gray-100 border-l-4 border-gray-400' : 'bg-blue-50 border-l-4 border-blue-500'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-semibold text-sm">
                        {m.isFromAdmin ? m.user?.name || 'Team' : m.client?.company || 'Client'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(m.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <p className="text-sm text-gray-700">{m.content}</p>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm font-semibold mb-2">Send Message to Client</p>
              <textarea
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none mb-3"
                placeholder="Type a message..."
              />
              <button
                onClick={handleSendMessage}
                disabled={messageSending || !messageContent.trim()}
                className="bg-black text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-gray-900 disabled:opacity-50 transition-colors"
              >
                {messageSending ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Deliverables */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-bold mb-4">Deliverables</h2>

            <div className="space-y-3 mb-6">
              {project.deliverables.length === 0 && (
                <p className="text-gray-600 text-sm">No files yet.</p>
              )}
              {project.deliverables.map((file) => (
                <div key={file.id} className="p-3 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-start gap-2">
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:underline truncate"
                    >
                      {file.name}
                    </a>
                    <button
                      onClick={() => handleDeleteDeliverable(file.id)}
                      className="text-xs text-red-600 hover:underline shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                  {file.size && <p className="text-xs text-gray-500 mt-1">{file.size}</p>}
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-gray-200 space-y-2">
              <p className="text-sm font-semibold mb-1">Add File</p>
              <input
                value={deliverableName}
                onChange={(e) => setDeliverableName(e.target.value)}
                placeholder="File name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                value={deliverableUrl}
                onChange={(e) => setDeliverableUrl(e.target.value)}
                placeholder="File URL"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                value={deliverableSize}
                onChange={(e) => setDeliverableSize(e.target.value)}
                placeholder="Size (optional, e.g. 2.4 MB)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={handleAddDeliverable}
                disabled={deliverableSaving || !deliverableName.trim() || !deliverableUrl.trim()}
                className="w-full bg-black text-white py-2 rounded-lg text-sm font-semibold hover:bg-gray-900 disabled:opacity-50 transition-colors"
              >
                {deliverableSaving ? 'Adding...' : 'Add File'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
