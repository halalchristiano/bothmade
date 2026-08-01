'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, Building2, FolderKanban, MessageSquare, Archive, ArchiveRestore, Trash2, AlertTriangle, Mail } from 'lucide-react';
import { Card, CardHeader, PageIn, EmptyState, Badge } from '@/components/admin/ui';
import { EmailComposer } from '@/components/admin/EmailComposer';

interface ClientDetail {
  id: string;
  email: string;
  company: string;
  phone: string | null;
  contactName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  archivedAt: string | null;
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

  const [archiving, setArchiving] = useState(false);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [composingEmail, setComposingEmail] = useState(false);

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

  const handleToggleArchive = async () => {
    if (!client) return;
    setArchiving(true);
    try {
      const response = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !client.archivedAt }),
      });
      if (response.ok) loadClient();
    } finally {
      setArchiving(false);
    }
  };

  const handleDelete = async () => {
    if (!client || confirmDeleteText !== client.company) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/clients/${clientId}`, { method: 'DELETE' });
      if (response.ok) router.push('/admin/clients');
    } finally {
      setDeleting(false);
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
      <div className="flex items-center justify-between">
        <Link href="/admin/clients" className="inline-flex items-center gap-1.5 text-white/50 hover:text-white text-sm transition-colors">
          <ArrowLeft size={14} />
          Back to Clients
        </Link>
        <button
          onClick={() => setComposingEmail(true)}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 hover:bg-white/10 transition-colors"
        >
          <Mail size={13} /> Compose email
        </button>
      </div>

      {composingEmail && (
        <EmailComposer
          recipientEmail={client.email}
          recipientName={client.contactName || undefined}
          company={client.company}
          clientId={clientId}
          onClose={() => setComposingEmail(false)}
        />
      )}

      {client.archivedAt && (
        <Card className="p-4 flex items-center justify-between" glow="amber">
          <p className="text-sm text-amber-200">
            <Archive size={14} className="inline mr-1.5 -mt-0.5" />
            Decommissioned {new Date(client.archivedAt).toLocaleDateString()} — hidden from active lists, login blocked.
          </p>
          <button
            onClick={handleToggleArchive}
            disabled={archiving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 text-sm hover:bg-white/5 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <ArchiveRestore size={14} />
            {archiving ? 'Restoring...' : 'Reactivate'}
          </button>
        </Card>
      )}

      <Card className="p-6 md:p-8">
        <div className="flex justify-between items-start mb-6">
          <CardHeader icon={Building2} tone="purple" title={client.company} subtitle="Client" />
          <div className="flex items-center gap-2">
            {!client.archivedAt && (
              <button
                onClick={handleToggleArchive}
                disabled={archiving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/15 font-medium text-sm hover:bg-white/5 disabled:opacity-50 transition-colors"
              >
                <Archive size={14} />
                {archiving ? 'Decommissioning...' : 'Decommission'}
              </button>
            )}
            <button
              onClick={() => setEditing(!editing)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/15 font-medium text-sm hover:bg-white/5 transition-colors"
            >
              <Pencil size={14} />
              {editing ? 'Cancel' : 'Edit'}
            </button>
          </div>
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

      <Card className="p-6 md:p-8" glow="red">
        <CardHeader icon={AlertTriangle} tone="red" title="Danger Zone" subtitle="Permanently deletes this client and every project, payment, and message tied to it" />
        <p className="text-xs text-white/40 mb-3">
          This cannot be undone. If you just want to offboard a client while keeping their records, use{' '}
          <span className="text-white/60">Decommission</span> above instead.
        </p>
        <p className="text-xs text-white/50 mb-2">
          Type <span className="font-mono text-white/80">{client.company}</span> to confirm:
        </p>
        <div className="flex gap-2">
          <input
            value={confirmDeleteText}
            onChange={(e) => setConfirmDeleteText(e.target.value)}
            placeholder={client.company}
            className="flex-1 px-4 py-2 rounded-xl bg-white/[0.04] border border-red-400/20 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-red-400/40 focus:border-transparent transition-all"
          />
          <button
            onClick={handleDelete}
            disabled={deleting || confirmDeleteText !== client.company}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/90 text-white font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-red-500 transition-colors whitespace-nowrap"
          >
            <Trash2 size={14} />
            {deleting ? 'Deleting...' : 'Delete Permanently'}
          </button>
        </div>
      </Card>
    </PageIn>
  );
}
