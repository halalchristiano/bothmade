'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
// Deliverables are still real file uploads — only chat attachments became links.
import { upload } from '@vercel/blob/client';
import { ExternalLink, Lock, Mail } from 'lucide-react';
import { EmailComposer } from '@/components/admin/EmailComposer';
import { RecurringCarePanel } from '@/components/admin/RecurringCarePanel';
import { InstalmentPanel } from '@/components/admin/InstalmentPanel';
import { ChangeOrderPanel } from '@/components/admin/ChangeOrderPanel';
import { DesignFeedbackPanel } from '@/components/admin/DesignFeedbackPanel';
import { DesignDirectionPanel } from '@/components/admin/DesignDirectionPanel';
import { Linkify } from '@/components/Linkify';
import { GatePrompt, type OpenedGate } from '@/components/admin/GatePrompt';
import { DesignReviewPanel } from '@/components/admin/DesignReviewPanel';
import { Badge, Card, Kicker, LoadError, PageIn } from '@/components/admin/ui';
import { OnboardingBuilder } from '@/components/admin/OnboardingBuilder';
import { DeleteProject } from '@/components/admin/DeleteProject';
import { stageMessage } from '@/lib/stage-gates';
import { deliverableHref } from '@/lib/deliverables';
import { CopyButton } from '@/components/admin/CopyButton';
import { InvoiceActions } from '@/components/admin/InvoiceActions';
import { DISPLAY_STATE_LABELS, displayState } from '@/lib/invoice-lifecycle';
import { ageBand, chaseLine, daysOutstanding } from '@/lib/invoice-ledger';
import { AttachLink } from '@/components/AttachLink';
import { AttachmentList } from '@/components/AttachmentCard';
import { readAttachments, type Attachment } from '@/lib/attachments';
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
  /** Capability token for the public /status link. Null only on old rows. */
  shareToken?: string | null;
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
    /** Staff-only, and what the Send confirmation reads. See the project route. */
    sendCount?: number;
    lastSentAt?: string | null;
    paidMethod?: string | null;
    /** How much has arrived against it — an invoice can be part paid. */
    receivedCents?: number;
    /** Money in before any of it went back out — the ceiling on a refund. */
    grossReceivedCents?: number;
    /** Whether a card refund is possible — no Checkout Session, no charge to reverse. */
    hasCardPayment?: boolean;
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
    revisions?: { used: number; included: number; remaining: number };
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
  /** A load that failed, kept apart from a project that does not exist. */
  const [loadFailed, setLoadFailed] = useState(false);
  /*
   * The outcome of any write on this page, which until now had none.
   *
   * Every mutation here read `if (response.ok)` with no else: the status
   * change that emails the client and can open a payment gate, the message to
   * the client, the deliverable, the live URL. A failure left the button
   * un-spinning and the screen unchanged, which reads as "done". The
   * deliverables route even answers with a usable reason — "that is not a
   * URL" — and it was being dropped on the floor.
   */
  const [actionError, setActionError] = useState('');
  const [composingEmail, setComposingEmail] = useState(false);

  /** Replacing the client's status token, and what to say about it after. */
  const [rotatingLink, setRotatingLink] = useState(false);
  const [linkNotice, setLinkNotice] = useState('');

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

  const handleRotateShareLink = async () => {
    /*
     * Confirmed first, because this is not undoable and it breaks something
     * already in somebody else's hands: every copy of the old link — in the
     * client's inbox, forwarded to their accountant — stops working the
     * moment this returns.
     */
    if (
      !window.confirm(
        'Replace this status link?\n\nEvery copy already sent stops working immediately, including the one in the client\u2019s inbox. You will need to send them the new one.'
      )
    ) {
      return;
    }
    setRotatingLink(true);
    setLinkNotice('');
    try {
      const res = await fetch('/api/share-links/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'project', id: projectId }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data.shareToken) {
        // Swapped in place rather than reloaded: the copy button beside this
        // must never hand out the token that was just revoked.
        setProject((prev) => (prev ? { ...prev, shareToken: data.shareToken } : prev));
        setLinkNotice('Link replaced. Copy the new one and send it over \u2014 the old one is dead.');
      } else {
        setLinkNotice(data?.error || "Couldn't replace the link \u2014 the old one is still live.");
      }
    } catch {
      setLinkNotice('Could not reach the server \u2014 the old link is still live.');
    } finally {
      setRotatingLink(false);
    }
  };

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
      if (!response.ok || !data?.success) {
        setLoadFailed(true);
        return;
      }
      setLoadFailed(false);
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
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  /** Whatever the server said, or a sentence that at least admits failure. */
  const reasonFrom = async (response: Response, fallback: string) => {
    const data = await response.json().catch(() => null);
    return (data?.error as string) || fallback;
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
  /** Said after a stage move that deliberately told nobody. */
  const [statusNote, setStatusNote] = useState('');

  /**
   * Is the picked stage earlier than the one the project is actually at?
   *
   * The whole difference between an update and a correction, and the page
   * used to draw them identically.
   */
  const goingBack =
    Boolean(project) &&
    statusDraft !== '' &&
    STATUSES.indexOf(statusDraft) < STATUSES.indexOf(project!.status);

  const handleStatusUpdate = async () => {
    setStatusSaving(true);
    setActionError('');
    setStatusNote('');
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
        // A correction and a sent update both end here with a green result,
        // and they are not the same thing. Saying which stops somebody
        // believing a client was told when deliberately they were not.
        setStatusNote(
          data?.correctedSilently === true
            ? 'Stage corrected. The client was not emailed and nothing was added to their timeline.'
            : ''
        );
        loadProject();
      } else {
        // The stage did not move. Believing it did is how a client goes
        // untold that their project reached Build, and how somebody waits
        // for a payment gate that never opened.
        setActionError(
          (data?.error as string) || 'The stage did not change, and the client has not been told.'
        );
      }
    } catch {
      setActionError('Could not reach the server — the stage did not change.');
    } finally {
      setStatusSaving(false);
    }
  };

  /**
   * What goes to the client alongside the message.
   *
   * Links now, not uploads. Copying a file into our own bucket handed the
   * client a snapshot of a document that carries on being edited where it
   * lives, and the upload itself was the part that failed — a thread that
   * sits on "Uploading…" never sends the message either.
   */
  const [messageFiles, setMessageFiles] = useState<Attachment[]>([]);

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
      if (!response.ok) {
        // The text is deliberately left in the box: it is the thing that
        // would be lost, and retyping it is the cost of a silent failure.
        setActionError(await reasonFrom(response, 'That message was not sent to the client.'));
        return;
      }
      setMessageContent('');
      setMessageFiles([]);
      loadProject();
    } catch {
      setActionError('Could not reach the server — that message was not sent.');
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
      if (!response.ok) {
        // This route answers with the actual complaint — a name typed into
        // the URL box, for instance — and it was being discarded.
        setActionError(await reasonFrom(response, 'That file was not added.'));
        return;
      }
      setDeliverableName('');
      setDeliverableUrl('');
      setDeliverableSize('');
      loadProject();
    } catch {
      setActionError('Could not reach the server — that file was not added.');
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
      </div>
    );
  }

  /*
   * A failed load used to fall through `loading || !project` and spin
   * forever — the same never-resolving spinner Priorities and the client page
   * had, on the page somebody opens most.
   */
  if (!project) {
    return (
      <PageIn className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        <Link href="/admin/projects" className="text-sm text-white/45 hover:text-white">
          ← Projects
        </Link>
        <Card className="mt-4 p-4">
          <LoadError
            what={loadFailed ? 'this project' : 'this project — it may have been deleted'}
            onRetry={() => {
              setLoading(true);
              loadProject();
            }}
          />
        </Card>
      </PageIn>
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

      {/*
        One place for the outcome of any write on this page, pinned above the
        fold. role="alert" so it is announced rather than only drawn — after
        pressing Send, somebody is looking at the button, not the header.
      */}
      {actionError && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-400/[0.07] px-4 py-3 text-sm text-red-100/90"
        >
          <span aria-hidden="true" className="mt-px text-red-300/80">⚠</span>
          <span>{actionError}</span>
        </div>
      )}

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
              className="text-xs px-3 py-1.5 rounded-lg bg-white text-ink font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity whitespace-nowrap"
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

      {/*
        What you are looking at, before what it is worth.

        The project's name was an h1 inside a card a third of the way down
        the page, under the care-plan banner and under the money. You landed
        on a project and were shown its balance before you were told whose it
        was. Every other detail page in the admin opens with a kicker and the
        record's name; this one opened with an upsell.
      */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <Kicker className="mb-2">Delivery</Kicker>
          <h1 className="truncate text-3xl font-bold tracking-tight">{project.name}</h1>
          <Link
            href={`/admin/clients/${project.client.id}`}
            className="text-sm text-white/50 transition-colors hover:text-sky-300"
          >
            {project.client.company}
          </Link>
        </div>
        <Badge tone={project.status === 'complete' ? 'emerald' : 'sky'} solid>
          {project.status}
        </Badge>
      </div>

      {/* Full width, above everything. The monthly plan is the one thing on
          this page that has a window — it lands while the build is still in
          front of the client and gets much harder a month after handover — so
          it sits where the page opens rather than under a scroll. */}
      <RecurringCarePanel projectId={projectId} />

      {/*
        The money, across the page.

        This is the reason the page exists — it is where a client actually
        gets billed — and it was three nested boxes at the bottom of a
        three-tenths rail: a schedule about 200px wide whose rows read
        "Payment 2 of 3 · $…" over "On d…", a balance under it, and the
        one-off charges under that. The most important control on the screen
        was the smallest thing on it, tucked below the timeline and the
        add-ons list.

        Two-thirds to the schedule, because it carries the row you read and
        the button you press. The remaining third stacks the balance — two
        figures and a bar — over the one-off charges, which stay a separate
        card rather than being folded into the balance: they are billed on
        top of the contracted price, and showing them as one number is how a
        project reads as paid off because somebody was invoiced for a change
        request.
      */}
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 relative rounded-2xl border border-white/[0.06] bg-surface p-6 shadow-e2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent">
            <div className="mb-4">
              <InstalmentPanel projectId={projectId} onLoaded={setInstalmentCount} />
            </div>
        </div>
        <div className="space-y-6">
          <div className="relative rounded-2xl border border-white/[0.06] bg-surface p-6 shadow-e2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent">
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
                      <CopyButton
                        value={balanceLinkUrl}
                        label="Copy"
                        className="px-3 py-1.5 rounded border border-white/20 text-xs hover:bg-white/5 transition-colors whitespace-nowrap"
                      />
                    </div>
                  )}
                </>
              )}
          </div>
          <div className="relative rounded-2xl border border-white/[0.06] bg-surface p-6 shadow-e2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent">
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
                            // receivedCents is what turns "Open" into "Part
                            // paid" — the same reading as the billing ledger,
                            // so the two screens cannot disagree about an
                            // invoice a client has half settled.
                            const state = displayState({
                              ...invoice,
                              refundedCents: invoice.refundedCents ?? 0,
                              receivedCents: invoice.receivedCents ?? 0,
                            });
                            return (
                              <span
                                className={`text-[10px] uppercase tracking-wider font-semibold ${
                                  state === 'paid'
                                    ? 'text-emerald-300'
                                    : state === 'void'
                                      ? 'text-white/30'
                                      : state === 'open'
                                        ? 'text-amber-300'
                                        : state === 'part-paid'
                                          ? 'text-sky-300'
                                          : 'text-purple-300'
                                }`}
                              >
                                {DISPLAY_STATE_LABELS[state]}
                              </span>
                            );
                          })()}
                          {/* What is LEFT, which is the figure that decides
                              what happens next. Same line as the ledger. */}
                          {invoice.status === 'open' && (invoice.receivedCents ?? 0) > 0 && (
                            <p className="mt-0.5 text-[10px] tabular-nums text-sky-300/80">
                              {formatCentsExact(invoice.amountCents - (invoice.receivedCents ?? 0))}{' '}
                              left of {formatCentsExact(invoice.amountCents)}
                            </p>
                          )}
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
                          <CopyButton value={invoice.paymentUrl} label="Copy pay link" />
                        )}
                        <InvoiceActions
                          invoice={{
                            ...invoice,
                            refundedCents: invoice.refundedCents ?? 0,
                            sentToEmail: invoice.sentToEmail ?? null,
                            // Without this the row offers Cancel on an invoice
                            // carrying a client's money, and the route refuses
                            // it after two clicks.
                            receivedCents: invoice.receivedCents ?? 0,
                            // What may go back off it, which on a part-paid
                            // invoice is what came in, not its face value.
                            grossReceivedCents: invoice.grossReceivedCents ?? 0,
                            projectId,
                          }}
                          onDone={loadProject}
                        />
                        {/* Same sentence as the billing ledger, so the two
                            screens cannot say different things about whether
                            this client has been chased. */}
                        <span className="text-white/30">
                          {(invoice.sendCount ?? 0) > 1
                            ? `Sent ${invoice.sendCount}× to ${invoice.sentToEmail}`
                            : invoice.sentToEmail
                              ? `Sent to ${invoice.sentToEmail}`
                              : 'Not emailed to the client'}
                        </span>
                        {/* How money that skipped Stripe actually arrived —
                            the only place a bank transfer is recoverable from
                            once the badge just reads "Paid". */}
                        {invoice.paidMethod && (
                          <span className="text-white/30">{invoice.paidMethod}</span>
                        )}
                        {(() => {
                          const line = chaseLine({
                            status: invoice.status,
                            createdAt: invoice.createdAt,
                            sendCount: invoice.sendCount,
                          });
                          if (!line) return null;
                          const band = ageBand(
                            daysOutstanding({ status: invoice.status, createdAt: invoice.createdAt })
                          );
                          return (
                            <span
                              className={
                                band === 'stale'
                                  ? 'text-red-300/80'
                                  : band === 'ageing'
                                    ? 'text-amber-300/70'
                                    : 'text-white/30'
                              }
                            >
                              {line}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>

      {/*
        Two wide columns, not three narrow rails.

        Three rails at three tenths made every card narrow — a status update
        written in a 180px box, a payment row reading "$…" — and left the page
        a five-thousand-pixel scroll with dead space down both sides. Bands
        across the full width were tried and were worse: rows sum where
        columns take a maximum, so a row holding one short card still costs
        its own height and the page grew by 1,600px.

        Two columns take the max of two halves while giving every card
        570-odd pixels, which is enough to write in. The three things that
        genuinely want the whole width keep it: the care plan, the money, and
        the project's own facts.
      */}
      <div className="relative rounded-2xl border border-white/[0.06] bg-surface p-6 shadow-e2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent">
        {/*
          The link the client actually watches, on the page where you are
          already looking at their project.

          The API has always sent shareToken here — the comment beside it
          says it "travels no further than the dashboard that offers copy
          share link", and that was exactly the problem. Sending a client
          their tracking link is a routine thing to want from a project,
          and it meant going back to the dashboard, finding the row, and
          hoping the project was still on it: that list is filtered to
          handoffs and at-risk work, so for a healthy mid-build project
          the link was reachable from nowhere at all.
        */}
        {project.shareToken && (
          /*
           * Labelled once above, then short controls beneath.
           *
           * "Copy status link" as a button label wrapped onto two lines in
           * this column and shoved Revoke out of line with it. Naming the
           * thing in a caption and letting the buttons say only what they
           * do fits, and reads better besides: three verbs in a row rather
           * than one sentence and two orphans.
           */
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <p className="text-xs font-medium text-white/40">Client status link</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
            <CopyButton
              value={`${typeof window === 'undefined' ? '' : window.location.origin}/status/${project.id}?t=${project.shareToken}`}
              label="Copy"
              title="Copy the client's status link"
            />
            <a
              href={`/status/${project.id}?t=${encodeURIComponent(project.shareToken)}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the client's status page"
              className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-sky-300"
            >
              <ExternalLink size={13} />
            </a>
            {/*
              The other half of handing out a link.

              /api/share-links/rotate has accepted { type: 'project' }
              from staff since it was written, and the lead page and the
              client's own dashboard both call it — but the admin project
              page never did. So the one screen where somebody copies a
              client's status link was the one screen with no way to take
              it back, and the person most likely to notice a link went
              somewhere it shouldn't is whoever sent it.
            */}
            <button
              type="button"
              onClick={handleRotateShareLink}
              disabled={rotatingLink}
              title="Replace this link — every copy already sent stops working"
              className="rounded-lg px-2 py-1 text-xs font-medium text-white/40 transition-colors hover:bg-white/[0.06] hover:text-amber-300 disabled:opacity-50"
            >
              {rotatingLink ? 'Replacing…' : 'Revoke'}
            </button>
            </div>
          </div>
        )}
        {linkNotice && (
          <p role="status" className="mt-2 text-xs text-amber-300/90">
            {linkNotice}
          </p>
        )}

        {/* Across, not down — four short facts in a column were four rows. */}
        <div className="mt-6 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
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
            <div className="rounded-lg border-2 border-amber-400/40 bg-amber-400/10 p-3 sm:col-span-2 lg:col-span-4">
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


        {/* Side by side. A date and a URL are two short fields, and
            stacking them gave each a full-width row and a thousand-pixel
            input to hold eight characters. */}
        <div className="mt-6 grid gap-x-8 gap-y-6 border-t border-white/10 pt-6 lg:grid-cols-2">
          <div>
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
          <div>
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
        </div>

      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {/*
            Where the project actually gets moved on, in a column wide enough
            to write in.

            This lived in the three-tenths rail, stacked under the price, the
            schedule, the completion date and the live URL — so the textarea a
            client's update is written in was about 180px across, and the rail
            ran a full column longer than either of the two beside it. The
            page already made this argument once about the onboarding form,
            a few lines further down: a working surface in a narrow column
            "felt like a settings panel rather than a thing you use".

            It is the same surface as Send Message to Client below it, doing
            the same job on the same person, so the two now sit together.
          */}
          <div className="relative rounded-2xl border border-white/[0.06] bg-surface p-6 shadow-e2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent">
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

                <p className="mb-3 text-sm font-semibold">Current Status</p>
                {/*
                  A status, drawn like every other status in the app.

                  This was the sky-to-purple gradient — spent on a word that
                  says "build". The gradient is the one thing reserved for
                  moments a screen wants to be looked at, and a stage label is
                  not one: it changes five times a project and is read, not
                  admired. Toned by stage instead, so the colour carries meaning
                  — complete reads done, launch reads imminent — which a
                  gradient identical at every stage never could.
                */}
                <div className="mb-4">
                  <Badge
                    solid
                    tone={
                      project.status === 'complete'
                        ? 'emerald'
                        : project.status === 'launch'
                          ? 'amber'
                          : project.status === 'discovery'
                            ? 'neutral'
                            : 'sky'
                    }
                  >
                    <span className="capitalize">{project.status}</span>
                  </Badge>
                </div>

                <select
                  value={statusDraft}
                  onChange={(e) => {
                    setStatusDraft(e.target.value);
                    // Untouched — either empty, or still exactly what we last
                    // wrote. Anything you have edited is yours and survives.
                    const untouched =
                      !statusDescription.trim() || statusDescription === autoFilledRef.current;
                    if (!untouched) return;
                    /*
                     * Nothing is filled in for a stage you are moving BACK to.
                     *
                     * The stage copy is written forward — "Design has started",
                     * "Discovery's done and we're designing" — and picking an
                     * earlier stage used to load it anyway, under a button that
                     * says Send Status Update. Pressing it told a client whose
                     * site was in Build that design had just begun.
                     *
                     * Left empty instead, which is what makes the route treat it
                     * as a correction and tell nobody. Anything typed here is a
                     * deliberate message and is still sent.
                     */
                    if (STATUSES.indexOf(e.target.value) < STATUSES.indexOf(project.status)) {
                      autoFilledRef.current = '';
                      setStatusDescription('');
                      return;
                    }
                    const next = stageMessage(e.target.value).body;
                    autoFilledRef.current = next;
                    setStatusDescription(next);
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

                {/* What a backwards move actually does, said before it is
                    pressed rather than discovered afterwards. */}
                {goingBack && (
                  <p role="status" className="mb-3 text-[11px] leading-relaxed text-amber-200/80">
                    {statusDescription.trim()
                      ? `Moving ${project.client.company} back to ${statusDraft}. You have written something, so they will be emailed it.`
                      : `Moving ${project.client.company} back to ${statusDraft} — a correction. Nothing is written, so the client is not told and nothing appears on their timeline. Write a message above if you do want them to hear about it.`}
                  </p>
                )}
                <button
                  onClick={handleStatusUpdate}
                  disabled={statusSaving || (statusDraft === project.status && !statusDescription)}
                  className="w-full rounded-lg bg-white py-2.5 font-semibold text-ink disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {statusSaving
                    ? 'Saving...'
                    : goingBack && !statusDescription.trim()
                      ? 'Correct the stage'
                      : 'Send Status Update'}
                </button>

                {statusNote && (
                  <p role="status" className="mt-3 text-[11px] leading-relaxed text-white/45">
                    {statusNote}
                  </p>
                )}

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
          {/* Beside the scope it changes, not in the conversation column.
              "The price and scope agreed at signing still stand" is a
              statement about the card directly above this one, and it was
              two columns away from it. */}
          <div id="change-orders">
            <ChangeOrderPanel
              projectId={projectId}
              totalPrice={project.totalPrice}
              // What the contract's answer turns on: which gate the project
              // has passed, and how much of the revision allowance is left.
              stage={{
                status: project.status,
                designPresentedAt: project.designReview?.presentedAt ?? null,
                designApprovedAt: project.designReview?.approvedAt ?? null,
                designRevisionsUsed: project.designReview?.revisions?.used ?? 0,
              }}
              onApplied={loadProject}
            />
          </div>
          <div className="relative rounded-2xl border border-white/[0.06] bg-surface shadow-e2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent p-6">
            <h2 className="text-lg font-semibold mb-4">Deliverables</h2>

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
                className="w-full text-xs text-white/60 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-white file:text-ink file:font-medium file:text-xs file:cursor-pointer hover:file:bg-white/90 disabled:opacity-50"
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
        <div className="space-y-6">
          <div className="relative rounded-2xl border border-white/[0.06] bg-surface shadow-e2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent p-6">
            <h2 className="text-lg font-semibold mb-4">Activity</h2>
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
                    <AttachmentList
                      attachments={readAttachments(m.attachments)}
                      compact
                      className="mt-2.5"
                    />
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
              <AttachLink
                attachments={messageFiles}
                onChange={setMessageFiles}
                placeholder="Paste a link — a Figma file, a Google Doc, a Drive folder…"
                className="mb-3"
              />
              <button
                onClick={handleSendMessage}
                disabled={messageSending || (!messageContent.trim() && messageFiles.length === 0)}
                className="rounded-lg bg-white px-5 py-2.5 font-semibold text-ink disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {messageSending ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
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
          {project.contractUrl && (
            <div className="relative rounded-2xl border border-white/[0.06] bg-surface shadow-e2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent p-6">
              <h2 className="text-lg font-semibold mb-4">Signed Agreement</h2>
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
          {/* The two things on this page the client never sees, together and
              at the end — rather than interleaved with the messages that do
              go to them. */}
          {/* Internal team notes — never shown to the client */}
          <div className="relative rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] shadow-e2 p-6">
            {/* Wraps. In the rail this now sits in, the heading and the badge
                do not fit on one line, and holding them there put a two-line
                pill through the middle of the title. */}
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <h2 className="text-lg font-semibold">Internal Notes</h2>
              <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs text-amber-300">
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
          <div className="relative rounded-2xl border border-white/[0.06] bg-surface shadow-e2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent p-6">
            <h2 className="text-lg font-semibold mb-1">Flag For The Team</h2>
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
      </div>

      {/* Out of the sidebar and across the page.
          This is a working surface — questions to write, answers to read —
          and it was in a two-tenths column, which is most of why it felt
          like a settings panel rather than a thing you use. */}
      <div className="mt-6">
        <OnboardingBuilder
          projectId={projectId}
          questions={questions}
          onChanged={loadQuestions}
        />
      </div>

      {/* Destructive and permanent, so it earns neither prominence nor a
          single click — and no longer an empty half-page column holding one
          grey link, which is what giving it its own grid cell amounted to. */}
      <div className="mt-6 flex justify-end">
        <DeleteProject
          projectId={projectId}
          company={project.client.company}
          projectName={project.name}
        />
      </div>
    </div>
  );
}
