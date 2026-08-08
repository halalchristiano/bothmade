'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, Building2, FolderKanban, MessageSquare, Archive, ArchiveRestore, Trash2, AlertTriangle, Mail, ShieldCheck } from 'lucide-react';
import { Badge, BrandButton, Card, CardHeader, EmptyState, inputClass, Kicker, LoadError, PageIn } from '@/components/admin/ui';
import { EmailComposer } from '@/components/admin/EmailComposer';
import { BroadcastForm, describeBroadcast } from '@/components/admin/BroadcastForm';
import { GenerateCertificateButton, type SignatureRecord } from '@/components/admin/SignatureCertificates';

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
  /** One per project that has both a signature and a payment behind it. */
  signatureRecords: SignatureRecord[];
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


  const [archiving, setArchiving] = useState(false);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [composingEmail, setComposingEmail] = useState(false);
  /*
   * Every write on this page checked `response.ok` and did nothing when it
   * was false. Save left the form in edit mode with the change apparently
   * accepted; Decommission — which blocks the client's login — stopped
   * spinning and changed nothing; Delete left you on the page having already
   * typed the company name to confirm. No message in any of them, so the
   * honest reading of the screen was "it worked" or "the button is broken",
   * and the dangerous one is believing you have cut off an account you have
   * not.
   */
  const [actionError, setActionError] = useState('');
  /*
   * The refusal that has a second answer.
   *
   * Decommissioning a client with work still in flight is a real thing —
   * somebody walks away mid-build — but it is not the thing the single click
   * next to "Edit" should do. The route now refuses it and says what is live;
   * this turns that refusal into a decision rather than a dead end, because a
   * 409 you cannot act on just becomes a message people learn to click past.
   */
  const [liveWorkAsk, setLiveWorkAsk] = useState<{ message: string } | null>(null);
  /** A failed initial load, which used to sit on the spinner forever. */
  const [loadFailed, setLoadFailed] = useState(false);

  const loadClient = async () => {
    try {
      const response = await fetch(`/api/admin/clients/${clientId}`);
      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await response.json();
      if (!response.ok || !data?.success) {
        setLoadFailed(true);
        return;
      }
      setLoadFailed(false);
      if (data.success) {
        setClient(data.client);
        setCompany(data.client.company);
        setPhone(data.client.phone || '');
        setContactName(data.client.contactName || '');
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClient();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  /** Whatever the server said, or a sentence that at least admits failure. */
  const reasonFrom = async (response: Response, fallback: string) => {
    const data = await response.json().catch(() => null);
    return (data?.error as string) || fallback;
  };

  const handleSave = async () => {
    setSaving(true);
    setActionError('');
    try {
      const response = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, phone, contactName }),
      });
      if (!response.ok) {
        setActionError(await reasonFrom(response, 'Those changes did not save.'));
        return;
      }
      setEditing(false);
      loadClient();
    } catch {
      setActionError('Could not reach the server — those changes did not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchive = async (force = false) => {
    if (!client) return;
    const goingDown = !client.archivedAt;
    setArchiving(true);
    setActionError('');
    setLiveWorkAsk(null);
    try {
      const response = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: goingDown, ...(force ? { acknowledgeLiveWork: true } : {}) }),
      });
      if (response.status === 409) {
        const said = await response.json().catch(() => null);
        if (said?.liveWork) {
          setLiveWorkAsk({ message: said.error });
          return;
        }
      }
      if (!response.ok) {
        // Said plainly, because the belief this leaves behind is the
        // expensive one: decommissioning blocks the client's login, and
        // somebody who thinks they have done it will not check.
        setActionError(
          await reasonFrom(
            response,
            goingDown
              ? 'This client was NOT decommissioned — their login still works.'
              : 'This client was not reinstated.'
          )
        );
        return;
      }
      setLiveWorkAsk(null);
      loadClient();
    } catch {
      setActionError(
        goingDown
          ? 'Could not reach the server — this client was NOT decommissioned, and their login still works.'
          : 'Could not reach the server — this client was not reinstated.'
      );
    } finally {
      setArchiving(false);
    }
  };

  const handleDelete = async () => {
    if (!client || confirmDeleteText !== client.company) return;
    setDeleting(true);
    setActionError('');
    try {
      // The typed company name goes to the server, which is the only place
      // it means anything — a disabled button is not a guard.
      const response = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: confirmDeleteText }),
      });
      if (!response.ok) {
        // The refusal usually has a reason worth reading — a client with
        // payments or invoices against them cannot be deleted — and it was
        // being thrown away.
        setActionError(await reasonFrom(response, 'This client was not deleted.'));
        return;
      }
      router.push('/admin/clients');
    } catch {
      setActionError('Could not reach the server — this client was not deleted.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-white/40">Loading client…</p>
      </div>
    );
  }

  /*
   * A failed load used to fall through `loading || !client` and sit on
   * "Loading client…" for as long as the tab stayed open — the same
   * never-resolving spinner the Priorities page had, with the same absence of
   * anything to read or press.
   */
  if (!client) {
    return (
      <PageIn className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        <Link href="/admin/clients" className="text-sm text-white/45 hover:text-white">
          ← Clients
        </Link>
        <Card className="mt-4 p-4">
          <LoadError
            what={loadFailed ? 'this client' : 'this client — it may have been deleted'}
            onRetry={() => {
              setLoading(true);
              loadClient();
            }}
          />
        </Card>
      </PageIn>
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

      {/*
        One place for the outcome of any write on this page, at the top where
        it cannot be missed. role="alert" so it is announced rather than only
        drawn — somebody who has just pressed Decommission may be looking at
        the button, not the header.
      */}
      {actionError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-400/[0.07] px-4 py-3 text-sm text-red-100/90"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-300/80" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Not an error — a decision. The route named what is still live; this
          is where somebody says whether that changes their mind. */}
      {liveWorkAsk && (
        <div
          role="alert"
          className="rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-3"
        >
          <p className="flex items-start gap-2 text-sm text-amber-100">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300/80" />
            <span>{liveWorkAsk.message}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 pl-[23px]">
            <button
              type="button"
              onClick={() => handleToggleArchive(true)}
              disabled={archiving}
              className="rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-400/10 disabled:opacity-40"
            >
              {archiving ? 'Decommissioning…' : 'Decommission anyway'}
            </button>
            <button
              type="button"
              onClick={() => setLiveWorkAsk(null)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-amber-100/60 transition-colors hover:text-amber-100"
            >
              Not now
            </button>
          </div>
        </div>
      )}

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
          <BrandButton
            variant="quiet"
            onClick={() => handleToggleArchive()}
            disabled={archiving}
            className="inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <ArchiveRestore size={14} />
            {archiving ? 'Restoring...' : 'Reactivate'}
          </BrandButton>
        </Card>
      )}

      <Card className="p-6 md:p-8">
        <Kicker className="mb-3">Client</Kicker>
        <div className="flex justify-between items-start mb-6">
          <CardHeader icon={Building2} tone="purple" title={client.company} />
          <div className="flex items-center gap-2">
            {!client.archivedAt && (
              <BrandButton
                variant="quiet"
                onClick={() => handleToggleArchive()}
                disabled={archiving}
                className="inline-flex items-center gap-1.5"
              >
                <Archive size={14} />
                {archiving ? 'Decommissioning...' : 'Decommission'}
              </BrandButton>
            )}
            <BrandButton
              variant="quiet"
              onClick={() => setEditing(!editing)}
              className="inline-flex items-center gap-1.5"
            >
              <Pencil size={14} />
              {editing ? 'Cancel' : 'Edit'}
            </BrandButton>
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
            <BrandButton variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </BrandButton>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
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

      {client.signatureRecords?.length > 0 && (
        <Card className="p-6 md:p-8">
          <CardHeader
            icon={ShieldCheck}
            tone="emerald"
            title="Signature Certificates"
            subtitle="Proof this client signed — who, when, from where, and what they agreed to"
          />
          <div className="space-y-2">
            {client.signatureRecords.map((record) => (
              <div
                key={record.projectId}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{record.projectName}</p>
                  <p className="text-xs text-white/40">
                    {record.signerName ? `Signed by ${record.signerName}` : 'Signer name not captured'}
                    {record.signedAt ? ` · ${new Date(record.signedAt).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <GenerateCertificateButton
                  clientId={clientId}
                  projectId={record.projectId}
                  company={client.company}
                  compact
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6 md:p-8">
        <CardHeader icon={MessageSquare} tone="emerald" title="Message All Projects" subtitle="Sends to every project thread for this client" />
        <BroadcastForm
          endpoint={`/api/admin/clients/${clientId}/broadcast`}
          placeholder="Type a message to send to all their projects..."
          submitLabel="Send to All Projects"
          describeResult={describeBroadcast}
        />
      </Card>

      <Card className="p-6 md:p-8" glow="red">
        <CardHeader icon={AlertTriangle} tone="red" title="Danger Zone" subtitle="Permanently deletes this client and every project, payment, and message tied to it" />
        <p className="text-xs text-white/40 mb-3">
          This cannot be undone. If you just want to offboard a client while keeping their records, use{' '}
          <span className="text-white/60">Decommission</span> above instead. A client with payments or
          invoices against them cannot be deleted at all — those are accounting records.
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
          <BrandButton
            variant="danger"
            onClick={handleDelete}
            disabled={deleting || confirmDeleteText !== client.company}
            className="inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Trash2 size={14} />
            {deleting ? 'Deleting...' : 'Delete Permanently'}
          </BrandButton>
        </div>
      </Card>
    </PageIn>
  );
}
