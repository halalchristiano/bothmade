'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { upload } from '@vercel/blob/client';
import { Lock, Mail } from 'lucide-react';
import { EmailComposer } from '@/components/admin/EmailComposer';
import { RecurringCarePanel } from '@/components/admin/RecurringCarePanel';
import { InstalmentPanel } from '@/components/admin/InstalmentPanel';
import { ChangeOrderPanel } from '@/components/admin/ChangeOrderPanel';
import { DesignFeedbackPanel } from '@/components/admin/DesignFeedbackPanel';
import { DesignDirectionPanel } from '@/components/admin/DesignDirectionPanel';
import { Linkify } from '@/components/Linkify';
import { GatePrompt, type OpenedGate } from '@/components/admin/GatePrompt';
import { DesignReviewPanel } from '@/components/admin/DesignReviewPanel';
import { OnboardingBuilder } from '@/components/admin/OnboardingBuilder';
import { DeleteProject } from '@/components/admin/DeleteProject';
import { stageMessage } from '@/lib/stage-gates';
import { deliverableHref } from '@/lib/deliverables';
import { InvoiceActions } from '@/components/admin/InvoiceActions';
import { DISPLAY_STATE_LABELS, displayState } from '@/lib/invoice-lifecycle';
import { Paperclip, X as XIcon } from 'lucide-react';
import {
  ADD_ONS,
  BASE_SERVICES,
  addOnLabel,
  formatCents,
  formatCentsExact,
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
  customItems?: Array<{ label: string; description?: string; priceCents: number }>;
  timeline: string | null;
  basePrice: number;
  totalPrice: number;
  estimatedCompletionDate: string | null;
  liveUrl: string | null;
  amountPaid: number;
  balanceDue: number;
  payments: Array<{ id: string; amount: number; type: string; createdAt: string }>;
  invoices?: Array<{
    id: string;
    number: string;
    description: string;
    amountCents: number;
    status: string;
    pdfUrl: string | null;
    paymentUrl: string | null;
    createdAt: string;
    paidAt: string | null;
    refundedCents?: number;
    refundMethod?: string | null;
    refundReason?: string | null;
    voidReason?: string | null;
    issuedBy?: string | null;
    sentToEmail?: string | null;
  }>;
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
  designReview?: {
    presentedAt: string | null;
    reviewEndsAt: string | null;
    approvedAt: string | null;
    deemed: boolean;
    round?: number;
    designUrl?: string | null;
  };
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
  /**
   * The last text this filled in by itself.
   *
   * Filling only an empty box was wrong: pick Design, then change your mind
   * and pick Build, and the box still held the Design message while the
   * dropdown said Build — the two disagreeing about what the client was
   * about to be told. Replacing it unconditionally is worse, because it
   * throws away something you have written. So it remembers what it wrote,
   * and only replaces the text if that is still exactly what is in the box.
   */
  const autoFilledRef = useRef('');
  const [statusSaving, setStatusSaving] = useState(false);

  const [estimatedDateDraft, setEstimatedDateDraft] = useState('');
  const [liveUrlDraft, setLiveUrlDraft] = useState('');
  const [liveUrlSaving, setLiveUrlSaving] = useState(false);
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

  const [collectingBalance, setCollectingBalance] = useState(false);
  // -1 until the schedule panel reports back, so the legacy balance button
  // doesn't flash on screen for a project that turns out to have one.
  const [instalmentCount, setInstalmentCount] = useState(-1);
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
        setLiveUrlDraft(data.project.liveUrl || '');
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

  const handleSaveLiveUrl = async () => {
    setLiveUrlSaving(true);
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liveUrl: liveUrlDraft || null }),
      });
      loadProject();
    } finally {
      setLiveUrlSaving(false);
    }
  };

  const [openedGate, setOpenedGate] = useState<OpenedGate | null>(null);

  const handleStatusUpdate = async () => {
    setStatusSaving(true);
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusDraft, description: statusDescription }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok) {
        setStatusDescription('');
        // The moment Section 7 calls "the day of approval". Reported by the
        // route, never acted on by it — see GatePrompt.
        setOpenedGate(data?.gateOpened ?? null);
        loadProject();
      }
    } finally {
      setStatusSaving(false);
    }
  };

  const [messageFiles, setMessageFiles] = useState<{ name: string; url: string }[]>([]);
  const [messageUploading, setMessageUploading] = useState(false);
  const messageFileInput = useRef<HTMLInputElement>(null);

  const handleAttachMessageFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setMessageUploading(true);
    try {
      for (const file of Array.from(list).slice(0, 5)) {
        const blob = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/admin/team-chat/upload',
        });
        setMessageFiles((prev) => [...prev, { name: file.name, url: blob.url }]);
      }
    } catch {
      // The composer stays usable; the missing chip is the signal.
    } finally {
      setMessageUploading(false);
      if (messageFileInput.current) messageFileInput.current.value = '';
    }
  };

  const handleSendMessage = async () => {
    if (!messageContent.trim() && messageFiles.length === 0) return;
    setMessageSending(true);
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The route and schema accepted attachments all along — this UI
        // just never offered a way to send any, so files got shoehorned
        // into Deliverables mid-conversation.
        body: JSON.stringify({
          content: messageContent.trim() || '(file attached)',
          attachments: messageFiles,
        }),
      });
      if (response.ok) {
        setMessageContent('');
        setMessageFiles([]);
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
  /*
   * Internal notes belong in here too.
   *
   * They were a separate list further down the page, which meant the one
   * thread that answers "what has happened on this project" was missing the
   * half written by us — a note saying "client rang, wants the launch moved"
   * sat somewhere the timeline did not look, so the timeline read as though
   * nothing had happened that week.
   *
   * Yellow and labelled, because the other two entries in this thread have
   * been seen by the client and these have not. That distinction has to be
   * visible at a glance or somebody will quote an internal note back to them.
   */
  const thread = [
    ...project.updates.map((u) => ({ type: 'update' as const, at: u.createdAt, data: u })),
    ...project.messages.map((m) => ({ type: 'message' as const, at: m.createdAt, data: m })),
    ...notes.map((n) => ({ type: 'note' as const, at: n.createdAt, data: n })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const invoices = project.invoices ?? [];

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

      {/* Full width, above everything. The monthly plan is the one thing on
          this page that has a window — it lands while the build is still in
          front of the client and gets much harder a month after handover — so
          it sits where the page opens rather than under a scroll. */}
      <RecurringCarePanel projectId={projectId} />

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
                  {/* addOnLabel, not CSS capitalize: the raw key rendered as
                      "Seo", which reads like a typo somebody meant. */}
                  <p className="font-medium">{project.addOns.map(addOnLabel).join(', ')}</p>
                </div>
              )}
              {project.customItems && project.customItems.length > 0 && (
                <div className="rounded-lg border-2 border-amber-400/40 bg-amber-400/10 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-300 mb-2">
                    ⚠ Custom items — not in the standard catalogue
                  </p>
                  <div className="space-y-1">
                    {project.customItems.map((item, i) => (
                      <div key={i}>
                        <p className="font-medium flex justify-between">
                          <span>{item.label}</span>
                          <span className="text-white/60">{formatCents(item.priceCents)}</span>
                        </p>
                        {/* What was actually agreed, verbatim from the
                            contract — this is the page someone opens when
                            they're about to build the thing. */}
                        {item.description && (
                          <p className="mt-0.5 text-xs leading-relaxed text-white/60">{item.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
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
              <div className="mb-4">
                <InstalmentPanel projectId={projectId} onLoaded={setInstalmentCount} />
              </div>
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

              {project.balanceDue > 0 && instalmentCount === 0 && (
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

            {/* One-off charges. Deliberately below the balance rather than
                inside it: these are billed outside the contracted price, and
                showing them as one number is how a project reads as paid off
                because somebody was invoiced for a change request. */}
            <div className="mt-6 pt-6 border-t border-white/10">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Custom Charges</p>
                <Link
                  href={`/admin/billing?projectId=${project.id}`}
                  className="text-xs text-sky-300 hover:text-sky-200 transition-colors"
                >
                  New charge →
                </Link>
              </div>
              {invoices.length === 0 ? (
                <p className="text-xs text-white/40">
                  Nothing billed outside the project scope yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {invoices.map((invoice) => (
                    <div key={invoice.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{invoice.description}</p>
                          <p className="text-[11px] text-white/40 mt-0.5">
                            {invoice.number} · {new Date(invoice.createdAt).toLocaleDateString()}
                            {invoice.issuedBy ? ` · ${invoice.issuedBy}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-semibold ${invoice.status === 'void' ? 'text-white/40 line-through' : ''}`}>
                            {formatCentsExact(invoice.amountCents)}
                          </p>
                          {(() => {
                            const state = displayState({ ...invoice, refundedCents: invoice.refundedCents ?? 0 });
                            return (
                              <span
                                className={`text-[10px] uppercase tracking-wider font-semibold ${
                                  state === 'paid'
                                    ? 'text-emerald-300'
                                    : state === 'void'
                                      ? 'text-white/30'
                                      : state === 'open'
                                        ? 'text-amber-300'
                                        : 'text-purple-300'
                                }`}
                              >
                                {DISPLAY_STATE_LABELS[state]}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px]">
                        {invoice.pdfUrl && (
                          <a
                            href={invoice.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-300 hover:text-sky-200 transition-colors"
                          >
                            Invoice PDF
                          </a>
                        )}
                        {invoice.paymentUrl && (
                          <button
                            onClick={() => navigator.clipboard.writeText(invoice.paymentUrl as string)}
                            className="text-white/50 hover:text-white transition-colors"
                          >
                            Copy pay link
                          </button>
                        )}
                        <InvoiceActions
                          invoice={{
                            ...invoice,
                            refundedCents: invoice.refundedCents ?? 0,
                            sentToEmail: invoice.sentToEmail ?? null,
                          }}
                          onDone={loadProject}
                        />
                        {invoice.sentToEmail ? (
                          <span className="text-white/30">Sent to {invoice.sentToEmail}</span>
                        ) : (
                          <span className="text-white/30">Not emailed to the client</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
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
              <p className="text-sm font-semibold mb-3">🚀 Live Site</p>
              <p className="text-xs text-white/40 mb-3">
                Set this once it's actually shipped — turns the client's dashboard into a
                proper "your project is live" moment instead of just another status update.
              </p>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://theirclient.com"
                  value={liveUrlDraft}
                  onChange={(e) => setLiveUrlDraft(e.target.value)}
                  className={`${inputClass} flex-1`}
                />
                <button
                  onClick={handleSaveLiveUrl}
                  disabled={liveUrlSaving}
                  className="rounded-lg border border-white/20 px-4 text-sm font-semibold hover:bg-white/5 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {liveUrlSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white/10">
              {/* Directly above the stage control, because presenting the
                  design is the act that makes moving to Build legitimate. */}
              <div className="mb-4">
                <DesignReviewPanel
                  projectId={projectId}
                  review={
                    project.designReview ?? {
                      presentedAt: null,
                      reviewEndsAt: null,
                      approvedAt: null,
                      deemed: false,
                    }
                  }
                  onChanged={loadProject}
                />
              </div>

              <p className="text-sm font-semibold mb-3">Current Status</p>
              <span className="inline-block px-3 py-1.5 rounded-full bg-gradient-to-r from-sky-400 to-purple-500 text-black text-sm font-semibold capitalize mb-4">
                {project.status}
              </span>

              <select
                value={statusDraft}
                onChange={(e) => {
                  setStatusDraft(e.target.value);
                  // Untouched — either empty, or still exactly what we last
                  // wrote. Anything you have edited is yours and survives.
                  const untouched =
                    !statusDescription.trim() || statusDescription === autoFilledRef.current;
                  if (untouched) {
                    const next = stageMessage(e.target.value).body;
                    autoFilledRef.current = next;
                    setStatusDescription(next);
                  }
                }}
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
                rows={10}
                className={`${inputClass} resize-none mb-1`}
              />
              <p className="mb-3 text-[11px] text-white/30">
                This is what your client reads. Pick a stage above and it fills in — edit it, or
                send as is.
              </p>
              <button
                onClick={handleStatusUpdate}
                disabled={statusSaving || (statusDraft === project.status && !statusDescription)}
                className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {statusSaving ? 'Saving...' : 'Send Status Update'}
              </button>

              {openedGate && (
                <div className="mt-3">
                  <GatePrompt
                    gate={openedGate}
                    projectId={projectId}
                    company={project.client.company}
                    onDone={loadProject}
                    onDismiss={() => setOpenedGate(null)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CENTER: Messages & Updates */}
        <div className="lg:col-span-5 space-y-6">
          {/* In the wide column, not beside the schedule it affects: the
              summary IS the document the client signs, and in a sidebar it
              truncated to three words — which is the one part of a change
              order nobody can afford to have to guess at. */}
          {/* Above the change order panel on purpose: the new-scope group in
              here is the most common reason to raise one, and reading the
              request immediately before the tool that prices it is the order
              the work actually happens in. Renders nothing until a client has
              sent something. */}
          {/* The brief above the feedback, because that is the order you have
              to read them in: their complaint only means something next to
              what we told them we would do. */}
          <DesignDirectionPanel projectId={projectId} />

          <DesignFeedbackPanel projectId={projectId} />

          <div id="change-orders">
            <ChangeOrderPanel
              projectId={projectId}
              totalPrice={project.totalPrice}
              onApplied={loadProject}
            />
          </div>

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
                if (item.type === 'note') {
                  const n = item.data;
                  return (
                    <div
                      key={`n-${n.id}`}
                      className="rounded-lg border-l-2 border-amber-400/60 bg-amber-400/[0.07] p-4"
                    >
                      <div className="mb-1 flex items-start justify-between gap-3">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-200">
                          <Lock size={12} />
                          Internal note{n.author?.name ? ` — ${n.author.name}` : ''}
                        </p>
                        <p className="shrink-0 text-xs text-white/30">
                          {new Date(n.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-white/70">{n.content}</p>
                      <p className="mt-1.5 text-[11px] text-amber-300/50">
                        Only visible here — the client never sees this.
                      </p>
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
                    <p className="text-sm text-white/60 whitespace-pre-wrap break-words"><Linkify text={m.content} /></p>
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
              {messageFiles.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {messageFiles.map((f, i) => (
                    <span key={i} className="flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/70">
                      📎 <span className="max-w-[160px] truncate">{f.name}</span>
                      <button
                        onClick={() => setMessageFiles((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove ${f.name}`}
                        className="text-white/40 hover:text-white"
                      >
                        <XIcon size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={messageFileInput}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleAttachMessageFiles(e.target.files)}
                  aria-label="Attach files to message"
                />
                <button
                  onClick={() => messageFileInput.current?.click()}
                  disabled={messageUploading}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-40"
                  aria-label="Attach a file"
                  title="Attach a file — it goes to the client with this message"
                >
                  <Paperclip size={15} />
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={messageSending || messageUploading || (!messageContent.trim() && messageFiles.length === 0)}
                  className="rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {messageSending ? 'Sending...' : messageUploading ? 'Uploading…' : 'Send Message'}
                </button>
              </div>
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
                    {/* Validation stops new ones; this is for the entries
                        already stored. A link that silently does nothing is
                        worse than one that says it is broken. */}
                    {deliverableHref(file.url) ? (
                      <a
                        href={deliverableHref(file.url) as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium hover:underline truncate text-sky-300"
                      >
                        {file.name}
                      </a>
                    ) : (
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white/50">{file.name}</p>
                        <p className="text-[11px] text-amber-300/80">
                          Broken link — this opens nothing. Delete it and add it again.
                        </p>
                      </div>
                    )}
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

        </div>
      </div>

      {/* Out of the sidebar and across the page.
          This is a working surface — questions to write, answers to read —
          and it was in a two-tenths column, which is most of why it felt
          like a settings panel rather than a thing you use. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <OnboardingBuilder
          projectId={projectId}
          questions={questions}
          onChanged={loadQuestions}
        />
        <div className="flex flex-col justify-end">
          {/* Destructive and permanent, so it earns neither prominence nor a
              single click. */}
          <DeleteProject
            projectId={projectId}
            company={project.client.company}
            projectName={project.name}
          />
        </div>
      </div>
    </div>
  );
}
