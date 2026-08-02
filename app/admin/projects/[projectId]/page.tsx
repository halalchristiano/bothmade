'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { upload } from '@vercel/blob/client';
import { Mail } from 'lucide-react';
import { EmailComposer } from '@/components/admin/EmailComposer';
import {
  ADD_ONS,
  BASE_SERVICES,
  formatCents,
  isAddOnKey,
  isBaseService,
  type AddOnKey,
} from '@/lib/pricing';

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
  estimatedCompletionDate: string | null;
  amountPaid: number;
  balanceDue: number;
  payments: Array<{ id: string; amount: number; type: string; createdAt: string }>;
  deliverables: Deliverable[];
  createdAt: string;
  client: { id: string; email: string; company: string; contactName?: string | null };
  messages: Array<{
    id: string;
    content: string;
    isFromAdmin: boolean;
    createdAt: string;
    attachments?: string;
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
  sourcedLead?: { id: string; company: string } | null;
  handoffAcknowledgedAt?: string | null;
  contractUrl?: string | null;
}

const STATUSES = ['discovery', 'design', 'build', 'launch', 'complete'];

/** Turns the client's actual project selections into a starting-point draft. */
function draftMessage(project: ProjectDetail): string {
  const greetingName = project.client.contactName || project.client.company;
  const serviceLabel = isBaseService(project.baseService)
    ? BASE_SERVICES[project.baseService].label
    : project.baseService;
  const addOnLabels = project.addOns
    .filter((a): a is AddOnKey => isAddOnKey(a))
    .map((a) => ADD_ONS[a].label);

  const lines = [`Hi ${greetingName},`, ''];

  lines.push(`Quick update on your ${serviceLabel} project`);
  if (addOnLabels.length > 0) {
    lines[lines.length - 1] += ` (${addOnLabels.join(', ')})`;
  }
  lines[lines.length - 1] += '.';

  if (project.timeline) {
    lines.push('', `Timeline: ${project.timeline}.`);
  }

  lines.push('', '[Write your update here]', '', 'Best,', 'Bothmade');

  return lines.join('\n');
}

export default function AdminProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [composingEmail, setComposingEmail] = useState(false);

  const [statusDraft, setStatusDraft] = useState('');
  const [statusDescription, setStatusDescription] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  const [estimatedDateDraft, setEstimatedDateDraft] = useState('');
  const [estimatedDateSaving, setEstimatedDateSaving] = useState(false);

  const [messageContent, setMessageContent] = useState('');
  const [messageSending, setMessageSending] = useState(false);

  const [deliverableName, setDeliverableName] = useState('');
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [deliverableSize, setDeliverableSize] = useState('');
  const [deliverableSaving, setDeliverableSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [notes, setNotes] = useState<Array<{ id: string; content: string; createdAt: string; author: { name: string } | null }>>([]);
  const [noteContent, setNoteContent] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  const [questions, setQuestions] = useState<
    Array<{ id: string; question: string; type: string; options: string; response: { answer: string } | null }>
  >([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [newQuestionType, setNewQuestionType] = useState('text');
  const [newQuestionOptions, setNewQuestionOptions] = useState('');
  const [questionSaving, setQuestionSaving] = useState(false);

  const [collectingBalance, setCollectingBalance] = useState(false);
  const [balanceLinkUrl, setBalanceLinkUrl] = useState('');
  const [balanceError, setBalanceError] = useState('');

  const [flagMessage, setFlagMessage] = useState('');
  const [flagUrgent, setFlagUrgent] = useState(false);
  const [flagSending, setFlagSending] = useState(false);
  const [flagStatus, setFlagStatus] = useState('');

  const handleFlagForTeam = async () => {
    if (!flagMessage.trim()) return;
    setFlagSending(true);
    setFlagStatus('');
    try {
      const response = await fetch('/api/admin/team-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `Re: ${project?.name} — ${flagMessage.trim()}`,
          relatedProjectId: projectId,
          urgent: flagUrgent,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setFlagMessage('');
        setFlagUrgent(false);
        setFlagStatus('Sent to the team chat.');
      }
    } finally {
      setFlagSending(false);
    }
  };

  const loadNotes = async () => {
    const response = await fetch(`/api/admin/projects/${projectId}/notes`);
    const data = await response.json();
    if (data.success) setNotes(data.notes);
  };

  const loadQuestions = async () => {
    const response = await fetch(`/api/admin/projects/${projectId}/onboarding`);
    const data = await response.json();
    if (data.success) setQuestions(data.questions);
  };

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    setNoteSaving(true);
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteContent }),
      });
      if (response.ok) {
        setNoteContent('');
        loadNotes();
      }
    } finally {
      setNoteSaving(false);
    }
  };

  const handleAddQuestion = async () => {
    if (!newQuestion.trim()) return;
    setQuestionSaving(true);
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: newQuestion,
          type: newQuestionType,
          options: newQuestionOptions,
          order: questions.length,
        }),
      });
      if (response.ok) {
        setNewQuestion('');
        setNewQuestionOptions('');
        loadQuestions();
      }
    } finally {
      setQuestionSaving(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    await fetch(`/api/admin/projects/${projectId}/onboarding/${questionId}`, { method: 'DELETE' });
    loadQuestions();
  };

  const handleCollectBalance = async () => {
    setBalanceError('');
    setCollectingBalance(true);
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/collect-balance`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        setBalanceLinkUrl(data.url);
      } else {
        setBalanceError(data.error || 'Failed to create balance payment link');
      }
    } finally {
      setCollectingBalance(false);
    }
  };

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
        setEstimatedDateDraft(
          data.project.estimatedCompletionDate
            ? data.project.estimatedCompletionDate.slice(0, 10)
            : ''
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const [acknowledgingHandoff, setAcknowledgingHandoff] = useState(false);
  const handleAcknowledgeHandoff = async () => {
    setAcknowledgingHandoff(true);
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledgeHandoff: true }),
      });
      loadProject();
    } finally {
      setAcknowledgingHandoff(false);
    }
  };

  useEffect(() => {
    loadProject();
    loadNotes();
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleSaveEstimatedDate = async () => {
    setEstimatedDateSaving(true);
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimatedCompletionDate: estimatedDateDraft || null }),
      });
      loadProject();
    } finally {
      setEstimatedDateSaving(false);
    }
  };

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

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setUploadingFile(true);
    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: `/api/admin/projects/${projectId}/deliverables/upload`,
      });

      await fetch(`/api/admin/projects/${projectId}/deliverables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, url: blob.url, size: formatBytes(file.size) }),
      });
      loadProject();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
      </div>
    );
  }

  // Merge messages + updates into one chronological thread
  const thread = [
    ...project.updates.map((u) => ({ type: 'update' as const, at: u.createdAt, data: u })),
    ...project.messages.map((m) => ({ type: 'message' as const, at: m.createdAt, data: m })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const inputClass =
    'w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors';

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/admin/projects" className="text-white/50 hover:text-white text-sm transition-colors">
          ← Back to Projects
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
          recipientEmail={project.client.email}
          recipientName={project.client.contactName || undefined}
          company={project.client.company}
          projectId={projectId}
          onClose={() => setComposingEmail(false)}
        />
      )}

      {project.sourcedLead && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-5 py-3">
          <p className="text-sm text-emerald-200">
            🤝 Sourced from the sales pipeline —{' '}
            <Link href={`/admin/leads/${project.sourcedLead.id}`} className="font-semibold hover:underline">
              view the original lead's sales history
            </Link>
          </p>
          {!project.handoffAcknowledgedAt ? (
            <button
              onClick={handleAcknowledgeHandoff}
              disabled={acknowledgingHandoff}
              className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 text-black font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              {acknowledgingHandoff ? 'Saving...' : "I've got this — Acknowledge"}
            </button>
          ) : (
            <span className="text-xs text-white/40 whitespace-nowrap">
              Acknowledged {new Date(project.handoffAcknowledgedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        {/* LEFT: Project Info */}
        <div className="lg:col-span-3 space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6">
            <h1 className="text-2xl font-bold mb-1">{project.name}</h1>
            <Link
              href={`/admin/clients/${project.client.id}`}
              className="text-sm text-white/50 hover:text-sky-300 transition-colors"
            >
              {project.client.company}
            </Link>

            <div className="mt-6 space-y-4 text-sm">
              <div>
                <p className="text-white/40 mb-1">Base Service</p>
                <p className="font-medium capitalize">{project.baseService.replace('-', ' ')}</p>
              </div>
              {project.addOns.length > 0 && (
                <div>
                  <p className="text-white/40 mb-1">Add-ons</p>
                  <p className="font-medium capitalize">{project.addOns.join(', ')}</p>
                </div>
              )}
              <div>
                <p className="text-white/40 mb-1">Timeline</p>
                <p className="font-medium">{project.timeline || '—'}</p>
              </div>
              <div>
                <p className="text-white/40 mb-1">Total Price</p>
                <p className="font-medium">{formatCents(project.totalPrice)}</p>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white/10">
              <p className="text-sm font-semibold mb-3">Payment Status</p>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-white/40">Paid</span>
                <span className="text-emerald-300 font-medium">{formatCents(project.amountPaid)}</span>
              </div>
              <div className="flex justify-between text-sm mb-3">
                <span className="text-white/40">Balance Due</span>
                <span className={`font-medium ${project.balanceDue > 0 ? 'text-amber-300' : 'text-white/40'}`}>
                  {formatCents(project.balanceDue)}
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 mb-4">
                <div
                  className="bg-gradient-to-r from-emerald-400 to-sky-400 h-1.5 rounded-full"
                  style={{ width: `${Math.min(100, (project.amountPaid / project.totalPrice) * 100)}%` }}
                />
              </div>

              {project.balanceDue > 0 && (
                <>
                  <button
                    onClick={handleCollectBalance}
                    disabled={collectingBalance}
                    className="w-full rounded-lg border border-amber-400/40 text-amber-300 py-2 text-sm font-semibold hover:bg-amber-400/10 disabled:opacity-50 transition-colors"
                  >
                    {collectingBalance ? 'Creating...' : 'Collect Balance'}
                  </button>
                  {balanceError && <p className="text-red-400 text-xs mt-2">{balanceError}</p>}
                  {balanceLinkUrl && (
                    <div className="mt-3 flex gap-2">
                      <input readOnly value={balanceLinkUrl} className="flex-1 min-w-0 px-2 py-1.5 rounded bg-white/5 border border-white/15 text-xs" />
                      <button
                        onClick={() => navigator.clipboard.writeText(balanceLinkUrl)}
                        className="px-3 py-1.5 rounded border border-white/20 text-xs hover:bg-white/5 transition-colors whitespace-nowrap"
                      >
                        Copy
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-white/10">
              <p className="text-sm font-semibold mb-3">Estimated Completion</p>
              <p className="text-xs text-white/40 mb-3">
                Shown to the client as a rough target for the current stage.
              </p>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={estimatedDateDraft}
                  onChange={(e) => setEstimatedDateDraft(e.target.value)}
                  className={`${inputClass} flex-1`}
                />
                <button
                  onClick={handleSaveEstimatedDate}
                  disabled={estimatedDateSaving}
                  className="rounded-lg border border-white/20 px-4 text-sm font-semibold hover:bg-white/5 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {estimatedDateSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white/10">
              <p className="text-sm font-semibold mb-3">Current Status</p>
              <span className="inline-block px-3 py-1.5 rounded-full bg-gradient-to-r from-sky-400 to-purple-500 text-black text-sm font-semibold capitalize mb-4">
                {project.status}
              </span>

              <select
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value)}
                className={`${inputClass} mb-3 capitalize`}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s} className="capitalize bg-[#05030a]">
                    {s}
                  </option>
                ))}
              </select>
              <textarea
                value={statusDescription}
                onChange={(e) => setStatusDescription(e.target.value)}
                placeholder="Describe this update for the client..."
                rows={3}
                className={`${inputClass} resize-none mb-3`}
              />
              <button
                onClick={handleStatusUpdate}
                disabled={statusSaving || (statusDraft === project.status && !statusDescription)}
                className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {statusSaving ? 'Saving...' : 'Send Status Update'}
              </button>
            </div>
          </div>
        </div>

        {/* CENTER: Messages & Updates */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6">
            <h2 className="text-xl font-bold mb-4">Activity</h2>
            <div className="space-y-4 max-h-[500px] overflow-y-auto mb-6">
              {thread.length === 0 && <p className="text-white/40 text-sm">No activity yet.</p>}
              {thread.map((item) => {
                if (item.type === 'update') {
                  const u = item.data;
                  return (
                    <div key={`u-${u.id}`} className="p-4 rounded-lg bg-white/5 border-l-2 border-purple-400/50">
                      <div className="flex justify-between items-start mb-1">
                        <p className="font-semibold text-sm">{u.title}</p>
                        <p className="text-xs text-white/30">
                          {new Date(u.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <p className="text-sm text-white/60">{u.description}</p>
                    </div>
                  );
                }
                const m = item.data;
                return (
                  <div
                    key={`m-${m.id}`}
                    className={`p-4 rounded-lg border-l-2 ${
                      m.isFromAdmin ? 'bg-white/5 border-white/30' : 'bg-sky-400/10 border-sky-400/50'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-semibold text-sm">
                        {m.isFromAdmin ? m.user?.name || 'Team' : m.client?.company || 'Client'}
                      </p>
                      <p className="text-xs text-white/30">
                        {new Date(m.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <p className="text-sm text-white/60">{m.content}</p>
                    {m.attachments && m.attachments !== '[]' && (
                      <div className="mt-2 space-y-1">
                        {(() => {
                          try {
                            const files = JSON.parse(m.attachments) as Array<{ name: string; url: string }>;
                            return files.map((f, i) => (
                              <a
                                key={i}
                                href={f.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-sky-300 hover:underline"
                              >
                                📎 {f.name}
                              </a>
                            ));
                          } catch {
                            return null;
                          }
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-white/10">
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-semibold">Send Message to Client</p>
                <button
                  onClick={() => setMessageContent(draftMessage(project))}
                  className="text-xs text-sky-300 hover:underline"
                >
                  Draft from selections
                </button>
              </div>
              <textarea
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                rows={4}
                className={`${inputClass} resize-none mb-3`}
                placeholder="Type a message, or click 'Draft from selections' above..."
              />
              <button
                onClick={handleSendMessage}
                disabled={messageSending || !messageContent.trim()}
                className="rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {messageSending ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>

          {/* Internal team notes — never shown to the client */}
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 backdrop-blur-xl p-6">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-bold">Internal Notes</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300">
                Team only — never shown to client
              </span>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto my-4">
              {notes.length === 0 && <p className="text-white/40 text-sm">No internal notes yet.</p>}
              {notes.map((note) => (
                <div key={note.id} className="p-3 rounded-lg bg-white/5">
                  <p className="text-sm text-white/70 whitespace-pre-wrap">{note.content}</p>
                  <p className="text-xs text-white/30 mt-1">
                    {note.author?.name || 'Team'} · {new Date(note.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              rows={2}
              placeholder="Note to the rest of the team — e.g. 'Evan: this client is price-sensitive, don't push the growth plan yet'"
              className={`${inputClass} resize-none mb-3`}
            />
            <button
              onClick={handleAddNote}
              disabled={noteSaving || !noteContent.trim()}
              className="rounded-lg border border-amber-400/40 px-5 py-2 text-sm font-semibold text-amber-300 disabled:opacity-50 hover:bg-amber-400/10 transition-colors"
            >
              {noteSaving ? 'Saving...' : 'Add Internal Note'}
            </button>
          </div>

          {/* Flag a question for the rest of the team */}
          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6">
            <h2 className="text-lg font-bold mb-1">Flag For The Team</h2>
            <p className="text-xs text-white/40 mb-3">
              Ping the team chat about this project — shows in their notifications until resolved.
            </p>
            <div className="flex gap-2 mb-2">
              <input
                value={flagMessage}
                onChange={(e) => setFlagMessage(e.target.value)}
                placeholder="e.g. Client wants to add e-commerce — can you re-quote?"
                className={`${inputClass} text-sm`}
              />
              <button
                onClick={handleFlagForTeam}
                disabled={flagSending || !flagMessage.trim()}
                className="px-4 py-2 rounded-lg border border-white/20 text-sm hover:bg-white/5 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {flagSending ? 'Sending...' : 'Send'}
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-white/40 cursor-pointer">
              <input type="checkbox" checked={flagUrgent} onChange={(e) => setFlagUrgent(e.target.checked)} />
              🚩 Flag as needing a response
            </label>
            {flagStatus && <p className="text-xs text-emerald-300 mt-2">{flagStatus}</p>}
          </div>
        </div>

        {/* RIGHT: Deliverables */}
        <div className="lg:col-span-2 space-y-6">
          {project.contractUrl && (
            <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6">
              <h2 className="text-lg font-bold mb-4">Signed Agreement</h2>
              <a
                href={project.contractUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex justify-between items-center p-3 rounded-lg border border-white/10 hover:border-white/25 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">Client-signed project agreement</p>
                  <p className="text-xs text-white/40">The exact copy they agreed to before paying</p>
                </div>
                <span className="text-sm font-semibold text-sky-300 shrink-0">Download</span>
              </a>
            </div>
          )}

          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6">
            <h2 className="text-lg font-bold mb-4">Deliverables</h2>

            <div className="space-y-3 mb-6">
              {project.deliverables.length === 0 && (
                <p className="text-white/40 text-sm">No files yet.</p>
              )}
              {project.deliverables.map((file) => (
                <div key={file.id} className="p-3 rounded-lg border border-white/10">
                  <div className="flex justify-between items-start gap-2">
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:underline truncate text-sky-300"
                    >
                      {file.name}
                    </a>
                    <button
                      onClick={() => handleDeleteDeliverable(file.id)}
                      className="text-xs text-red-400 hover:underline shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                  {file.size && <p className="text-xs text-white/30 mt-1">{file.size}</p>}
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-white/10 space-y-2">
              <p className="text-sm font-semibold mb-1">Upload File</p>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                disabled={uploadingFile}
                className="w-full text-xs text-white/60 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-gradient-to-r file:from-sky-400 file:to-purple-500 file:text-black file:font-semibold file:text-xs disabled:opacity-50"
              />
              {uploadingFile && <p className="text-xs text-sky-300">Uploading...</p>}
              {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}

              <div className="flex items-center gap-2 py-2">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs text-white/30">or paste a link</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <p className="text-sm font-semibold mb-1">Add Link</p>
              <input
                value={deliverableName}
                onChange={(e) => setDeliverableName(e.target.value)}
                placeholder="File name"
                className={`${inputClass} text-sm`}
              />
              <input
                value={deliverableUrl}
                onChange={(e) => setDeliverableUrl(e.target.value)}
                placeholder="File URL"
                className={`${inputClass} text-sm`}
              />
              <input
                value={deliverableSize}
                onChange={(e) => setDeliverableSize(e.target.value)}
                placeholder="Size (optional, e.g. 2.4 MB)"
                className={`${inputClass} text-sm`}
              />
              <button
                onClick={handleAddDeliverable}
                disabled={deliverableSaving || !deliverableName.trim() || !deliverableUrl.trim()}
                className="w-full rounded-lg border border-white/20 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-white/5 transition-colors"
              >
                {deliverableSaving ? 'Adding...' : 'Add Link'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6">
            <h2 className="text-lg font-bold mb-1">Onboarding Form</h2>
            <p className="text-xs text-white/40 mb-4">
              Custom questions for this client to answer from their dashboard.
            </p>

            <div className="space-y-3 mb-4">
              {questions.length === 0 && <p className="text-white/40 text-sm">No questions yet.</p>}
              {questions.map((q) => (
                <div key={q.id} className="p-3 rounded-lg border border-white/10">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-sm font-medium">{q.question}</p>
                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="text-xs text-red-400 hover:underline shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                  {q.response ? (
                    <p className="text-xs text-emerald-300 mt-1">Answered: {q.response.answer}</p>
                  ) : (
                    <p className="text-xs text-white/30 mt-1">Awaiting answer</p>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-white/10 space-y-2">
              <input
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="Question text"
                className={`${inputClass} text-sm`}
              />
              <select
                value={newQuestionType}
                onChange={(e) => setNewQuestionType(e.target.value)}
                className={`${inputClass} text-sm`}
              >
                <option value="text" className="bg-[#05030a]">Short text</option>
                <option value="textarea" className="bg-[#05030a]">Long text</option>
                <option value="select" className="bg-[#05030a]">Multiple choice</option>
              </select>
              {newQuestionType === 'select' && (
                <input
                  value={newQuestionOptions}
                  onChange={(e) => setNewQuestionOptions(e.target.value)}
                  placeholder="Options, comma-separated"
                  className={`${inputClass} text-sm`}
                />
              )}
              <button
                onClick={handleAddQuestion}
                disabled={questionSaving || !newQuestion.trim()}
                className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-2 text-sm font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {questionSaving ? 'Adding...' : 'Add Question'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
