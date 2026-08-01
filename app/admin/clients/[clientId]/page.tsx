'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface ClientDetail {
  id: string;
  email: string;
  company: string;
  phone: string | null;
  contactName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  projects: Array<{
    id: string;
    name: string;
    status: string;
    totalPrice: number;
  }>;
}

export default function AdminClientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const clientId = params.clientId as string;

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const [saving, setSaving] = useState(false);

  const [broadcastContent, setBroadcastContent] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [message, setMessage] = useState('');

  const loadClient = async () => {
    try {
      const response = await fetch(`/api/admin/clients/${clientId}`);
      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await response.json();
      if (data.success) {
        setClient(data.client);
        setCompany(data.client.company);
        setPhone(data.client.phone || '');
        setContactName(data.client.contactName || '');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClient();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, phone, contactName }),
      });
      if (response.ok) {
        setEditing(false);
        loadClient();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastContent.trim()) return;
    setBroadcasting(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: broadcastContent }),
      });
      const data = await response.json();
      if (data.success) {
        setMessage(`Sent to ${data.projectsNotified} project(s).`);
        setBroadcastContent('');
      }
    } finally {
      setBroadcasting(false);
    }
  };

  if (loading || !client) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <div>
        <Link href="/admin/clients" className="text-gray-600 hover:text-black text-sm">
          ← Back to Clients
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-8">
        <div className="flex justify-between items-start mb-6">
          <h1 className="text-3xl font-bold">{client.company}</h1>
          <button
            onClick={() => setEditing(!editing)}
            className="px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {editing ? (
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium mb-2">Company</label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Contact Name</label>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-black text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-gray-900 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 text-sm">
            <div>
              <p className="text-gray-600 mb-1">Email</p>
              <p className="font-medium">{client.email}</p>
            </div>
            <div>
              <p className="text-gray-600 mb-1">Contact Name</p>
              <p className="font-medium">{client.contactName || '—'}</p>
            </div>
            <div>
              <p className="text-gray-600 mb-1">Phone</p>
              <p className="font-medium">{client.phone || '—'}</p>
            </div>
            <div>
              <p className="text-gray-600 mb-1">Client Since</p>
              <p className="font-medium">{new Date(client.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-xl font-bold mb-4">Projects</h2>
        {client.projects.length === 0 ? (
          <p className="text-gray-600 text-sm">No projects yet.</p>
        ) : (
          <div className="space-y-3">
            {client.projects.map((project) => (
              <Link
                key={project.id}
                href={`/admin/projects/${project.id}`}
                className="flex justify-between items-center p-4 rounded-lg border border-gray-200 hover:border-gray-400 transition-colors"
              >
                <span className="font-medium">{project.name}</span>
                <span className="text-xs px-2 py-1 bg-gray-100 rounded-full capitalize">
                  {project.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-xl font-bold mb-4">Message All Projects</h2>
        <p className="text-sm text-gray-600 mb-4">
          Sends the same message to every project thread for this client.
        </p>
        <textarea
          value={broadcastContent}
          onChange={(e) => setBroadcastContent(e.target.value)}
          rows={3}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black resize-none mb-4"
          placeholder="Type a message to send to all their projects..."
        />
        {message && <p className="text-green-700 text-sm mb-4">{message}</p>}
        <button
          onClick={handleBroadcast}
          disabled={broadcasting || !broadcastContent.trim()}
          className="bg-black text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-gray-900 disabled:opacity-50 transition-colors"
        >
          {broadcasting ? 'Sending...' : 'Send to All Projects'}
        </button>
      </div>
    </div>
  );
}
