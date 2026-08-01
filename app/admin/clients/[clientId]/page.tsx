'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, Building2, FolderKanban, MessageSquare } from 'lucide-react';
import { Card, CardHeader, PageIn, EmptyState, Badge } from '@/components/admin/ui';

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

  const inputClass =
    'w-full px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-transparent transition-all';

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
      <div className="flex items-center justify-center h-screen">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
      </div>
    );
  }

  return (
    <PageIn className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10 space-y-5">
      <Link href="/admin/clients" className="inline-flex items-center gap-1.5 text-white/50 hover:text-white text-sm transition-colors">
        <ArrowLeft size={14} />
        Back to Clients
      </Link>

      <Card className="p-6 md:p-8">
        <div className="flex justify-between items-start mb-6">
          <CardHeader icon={Building2} tone="purple" title={client.company} subtitle="Client" />
          <button
            onClick={() => setEditing(!editing)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/15 font-medium text-sm hover:bg-white/5 transition-colors"
          >
            <Pencil size={14} />
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {editing ? (
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium mb-2 text-white/70">Company</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-white/70">Contact Name</label>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-white/70">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 text-sm">
            <div>
              <p className="text-white/40 mb-1">Email</p>
              <p className="font-medium">{client.email}</p>
            </div>
            <div>
              <p className="text-white/40 mb-1">Contact Name</p>
              <p className="font-medium">{client.contactName || '—'}</p>
            </div>
            <div>
              <p className="text-white/40 mb-1">Phone</p>
              <p className="font-medium">{client.phone || '—'}</p>
            </div>
            <div>
              <p className="text-white/40 mb-1">Client Since</p>
              <p className="font-medium">{new Date(client.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6 md:p-8">
        <CardHeader icon={FolderKanban} tone="sky" title="Projects" />
        {client.projects.length === 0 ? (
          <EmptyState icon={FolderKanban} text="No projects yet." />
        ) : (
          <div className="space-y-2">
            {client.projects.map((project) => (
              <Link
                key={project.id}
                href={`/admin/projects/${project.id}`}
                className="flex justify-between items-center p-4 rounded-xl border border-white/10 hover:border-white/25 hover:bg-white/[0.03] transition-colors"
              >
                <span className="font-medium">{project.name}</span>
                <Badge tone="neutral">{project.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6 md:p-8">
        <CardHeader icon={MessageSquare} tone="emerald" title="Message All Projects" subtitle="Sends to every project thread for this client" />
        <textarea
          value={broadcastContent}
          onChange={(e) => setBroadcastContent(e.target.value)}
          rows={3}
          className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-transparent resize-none mb-4 transition-all"
          placeholder="Type a message to send to all their projects..."
        />
        {message && <p className="text-emerald-300 text-sm mb-4">{message}</p>}
        <button
          onClick={handleBroadcast}
          disabled={broadcasting || !broadcastContent.trim()}
          className="rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {broadcasting ? 'Sending...' : 'Send to All Projects'}
        </button>
      </Card>
    </PageIn>
  );
}
