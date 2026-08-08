'use client';

import { useEffect, useRef, useState } from 'react';
import { warrantyState } from '@/lib/launch';
import { AttachLink } from '@/components/AttachLink';
import { AttachmentList } from '@/components/AttachmentCard';
import { readAttachments, type Attachment } from '@/lib/attachments';
import { Linkify } from '@/components/Linkify';
import { loginWithReturn } from '@/lib/client-return-to';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  Download,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  KeyRound,
  Rocket,
  ExternalLink,
  PartyPopper,
} from 'lucide-react';
import { ClientHeader } from '@/components/portal/ClientHeader';
import { GridBackdrop, CountUp } from '@/components/ui';
import { addOnLabel, formatCentsExact } from '@/lib/pricing';
import { deliverableHref, isOpenable } from '@/lib/deliverables';
import { lastVisitKey, readSeenMessageCount, seenMessagesKey } from '@/lib/portal-unseen';
import { DesignFeedbackForm } from '@/components/client/DesignFeedbackForm';
import { OnboardingAnswers } from '@/components/client/OnboardingAnswers';
import { DesignDirectionForm } from '@/components/client/DesignDirectionForm';

// The one motion signature carried over from the marketing site — the same
// ease-out-expo curve used there, so the dashboard a client lives in every
// day doesn't feel like a different, lesser product than the one that sold
// them.
const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

// (Linkify import added below the imports; see components/Linkify)
interface ClientInstalment {
  id: string;
  index: number;
  count: number;
  label: string;
  amountCents: number;
  trigger: string;
  status: 'scheduled' | 'due' | 'paid' | 'void';
  invoiceNumber: string | null;
  dueAt: string | null;
  paidAt: string | null;
  /**
   * Money already received against this payment while it is still owed.
   *
   * An instalment stays `due` until its invoice is settled in full, so a
   * client who has transferred part of one is looking at a row that says the
   * whole amount is due now. Zero on anything settled.
   */
  receivedCents?: number;
}

interface Project {
  instalments?: ClientInstalment[];
  id: string;
  name: string;
  status: string;
  statusStage: number;
  timeline: string;
  baseService: string;
  addOns: string[];
  customItems?: Array<{ label: string; priceCents: number }>;
  totalPrice: number;
  amountPaid: number;
  balanceDue: number;
  payments: Array<{ id: string; amount: number; type: string; createdAt: string }>;
  /** One-off charges for work outside the original scope — priced and invoiced separately from the project total. */
  invoices: Array<{
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
    /** How much has actually arrived against it — an invoice can be part paid. */
    receivedCents?: number;
    refundReason?: string | null;
    voidReason?: string | null;
  }>;
  designDirection?: {
    likes: Array<{ url: string; why: string }>;
    dislikes: Array<{ url: string; why: string }>;
    adjectives: string[];
    untouchable: string | null;
    hardNos: string | null;
    notes: string | null;
    signedAt: string | null;
    signerName: string | null;
  } | null;
  designDirectionStatus?: { exists: boolean; signed: boolean; warning: string | null };
  designDirectionStatement?: string;
  designReview?: {
    presentedAt: string | null;
    reviewEndsAt: string | null;
    approvedAt: string | null;
    deemed: boolean;
    round?: number;
    /** What this round is called and what it means — lib/design-stages.ts. */
    stage?: { round: number; label: string; meaning: string; billable: boolean };
    /** Where the design actually is, when there is a link to open. */
    designUrl?: string | null;
    revisions?: {
      used: number;
      included: number;
      remaining: number;
      nextIsBillable: boolean;
      clientLine: string;
    };
  };
  estimatedCompletionDate: string | null;
  liveUrl: string | null;
  /** The launch, as more than a URL — see lib/launch.ts. */
  domainName?: string | null;
  readyForLaunchAt?: string | null;
  launchedAt?: string | null;
  warrantyEndsAt?: string | null;
  handoverAt?: string | null;
  /** Capability token for the public /status link — see lib/share-links.ts. */
  shareToken?: string;
  createdAt: string;
  updatedAt: string;
  messages: any[];
  updates: any[];
  deliverables: Array<{ id: string; name: string; url: string; size?: string; addedAt?: string }>;
  contractUrl: string | null;
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

const STAGE_WHATS_NEXT: Record<string, string> = {
  Discovery:
    "Once requirements are locked in, we'll move into Design and start sharing layouts for your review.",
  Design:
    "Once you sign off on the designs, our engineers start building — you'll see progress land here as it happens.",
  Build:
    "Once the build is complete, we'll move into Launch for end-to-end testing before it goes live.",
  Launch:
    "We're in the final stretch — once testing wraps, your project goes live and moves to Complete.",
};

const CONFETTI_COLORS = ['#38bdf8', '#a855f7', '#34d399', '#fbbf24', '#f472b6'];

/** A one-time radial burst on mount — the single biggest milestone in the
 * relationship deserves more than a status pill turning green. */
function ConfettiBurst() {
  const pieces = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
    const distance = 90 + Math.random() * 70;
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 0.15,
    };
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ opacity: 1, x: 0, y: 0, scale: 0 }}
          animate={{ opacity: 0, x: p.x, y: p.y, scale: 1, rotate: 180 }}
          transition={{ duration: 1.4, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-1/2 top-8 h-2 w-2 rounded-sm"
          style={{ backgroundColor: p.color }}
        />
      ))}
    </div>
  );
}

export default function ClientDashboard() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const reduceMotion = useReducedMotion();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * Why the project isn't on screen, in the two flavours that matter to a
   * client: one where the link is never going to work, and one where this
   * minute went badly. Only the second is worth a button.
   */
  const [failure, setFailure] = useState<'missing' | 'unavailable' | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'messages' | 'onboarding'>('overview');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  /*
   * Arrows move focus between the tabs, Enter or Space selects.
   *
   * Manual activation rather than automatic: Messages and Onboarding each
   * fetch when they open, and arrowing across the row would fire all of them
   * to look at one. Same choice, same reason, as the admin sales tabs.
   */
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const current = tabRefs.current.findIndex((el) => el === document.activeElement);
    if (current === -1) return;
    const last = tabRefs.current.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = current === last ? 0 : current + 1;
    else if (e.key === 'ArrowLeft') next = current === 0 ? last : current - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    tabRefs.current[next]?.focus();
  };
  const [messageContent, setMessageContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [payingBalance, setPayingBalance] = useState(false);
  const [payBalanceError, setPayBalanceError] = useState('');
  const [approvingDesign, setApprovingDesign] = useState(false);
  const [approveError, setApproveError] = useState('');
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);

  const [questions, setQuestions] = useState<
    Array<{ id: string; question: string; type: string; options: string; response: { answer: string } | null }>
  >([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [savingAnswerId, setSavingAnswerId] = useState<string | null>(null);

  // Live-feeling messages: poll for new ones in the background and badge the
  // tab if any arrived while the client was looking at something else,
  // instead of requiring a manual refresh to see a reply.
  const [unreadCount, setUnreadCount] = useState(0);
  const seenMessageCountRef = useRef<number | null>(null);

  // "New" badges on updates/deliverables: remember the last time this client
  // actually looked at the dashboard, so anything added since then stands out.
  const [lastVisitAt, setLastVisitAt] = useState<number | null>(null);

  /**
   * Approving the design.
   *
   * Only ever sets approval — there is no undo. A design approved and then
   * reconsidered is a Change Order under Section 9, not a button, because the
   * build has started on the strength of it.
   */
  const [showDirectionForm, setShowDirectionForm] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  /** The acknowledgement the server generated from what they actually said. */
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);

  const approveDesign = async () => {
    setApprovingDesign(true);
    setApproveError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/approve-design`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setApproveError(data?.error || 'Something went wrong — try again in a moment.');
        return;
      }
      await loadProject();
    } catch {
      setApproveError('Something went wrong — try again in a moment.');
    } finally {
      setApprovingDesign(false);
    }
  };

  const [summaryCopied, setSummaryCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [revokingLink, setRevokingLink] = useState(false);
  const [linkRevoked, setLinkRevoked] = useState(false);

  useEffect(() => {
    const storageKey = lastVisitKey(projectId);
    const stored = Number(localStorage.getItem(storageKey) || 0);
    setLastVisitAt(stored || null);
    localStorage.setItem(storageKey, String(Date.now()));

    loadProject();
    loadOnboarding();
    const interval = setInterval(loadProject, 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const isNew = (dateStr: string) => !!lastVisitAt && new Date(dateStr).getTime() > lastVisitAt;

  const NewBadge = () => (
    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold uppercase tracking-wide align-middle">
      New
    </span>
  );

  // Track unread messages across polls/visits (persisted per-project so a
  // page reload doesn't just forget what's already been seen).
  useEffect(() => {
    if (!project) return;
    const storageKey = seenMessagesKey(projectId);
    if (seenMessageCountRef.current === null) {
      const stored = readSeenMessageCount(localStorage.getItem(storageKey));
      // No baseline on this device yet — establish one now, the same way the
      // visit stamp above is written on arrival whether or not anything was
      // read.
      //
      // Leaving it absent was the bug. The readers coerced a missing key to 0,
      // so `messageCount > 0` lit the "new activity" dot for every project
      // with any message history, and *this* effect was the only thing that
      // ever cleared it — and only when `activeTab === 'messages'`. Opening
      // the project did nothing. On a new phone, in a private window, or after
      // clearing site data, every project stayed flagged until the client
      // happened to click into one specific tab.
      seenMessageCountRef.current = stored ?? project.messages.length;
      if (stored === null) localStorage.setItem(storageKey, String(project.messages.length));
    }
    if (activeTab === 'messages') {
      seenMessageCountRef.current = project.messages.length;
      localStorage.setItem(storageKey, String(project.messages.length));
      setUnreadCount(0);
    } else {
      setUnreadCount(Math.max(0, project.messages.length - (seenMessageCountRef.current || 0)));
    }
  }, [project, activeTab, projectId]);

  // Land on the newest message when the tab opens or a new one arrives —
  // and only then. A bare callback ref ran on every render, yanking the
  // scroll to the bottom on each keystroke and every 20-second poll.
  useEffect(() => {
    if (activeTab !== 'messages') return;
    const el = messagesScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, project?.messages?.length]);

  const loadOnboarding = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/onboarding`);
      const data = await response.json();
      if (data.success) {
        setQuestions(data.questions);
        const initial: Record<string, string> = {};
        for (const q of data.questions) {
          initial[q.id] = q.response?.answer || '';
        }
        setAnswers(initial);
      }
    } catch (err) {
      console.error('Failed to load onboarding form:', err);
    }
  };

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmitAnswer = async (questionId: string) => {
    setSavingAnswerId(questionId);
    try {
      await fetch(`/api/projects/${projectId}/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, answer: answers[questionId] || '' }),
      });
      loadOnboarding();
    } finally {
      setSavingAnswerId(null);
    }
  };

  const loadProject = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (response.status === 401) {
        // Carry where they were trying to go, so logging back in finishes
        // the journey instead of dropping them on the project list.
        router.push(loginWithReturn(window.location.pathname, window.location.search));
        return;
      }
      const data = await response.json();
      // 403 covers two different things — "this isn't your project" and
      // "replace the temporary password first". Only the second is a
      // redirect; the code tells them apart.
      if (data?.code === 'PASSWORD_CHANGE_REQUIRED') {
        router.push('/client/settings?force=1');
        return;
      }
      if (data.success) {
        setProject(data.project);
        setFailure(null);
      } else {
        // `data.error` is written for us, not for them — "Internal server
        // error" in front of somebody who is paying us says nothing they can
        // act on. The status code is the part that carries meaning: a project
        // that isn't theirs or isn't there won't become theirs on a retry.
        setFailure(response.status === 404 || response.status === 403 ? 'missing' : 'unavailable');
      }
    } catch (err) {
      setFailure('unavailable');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sending a message, with whatever links go with it.
   *
   * There used to be a file picker here that uploaded a single file to our
   * storage before the message could go. It was the slowest and least
   * reliable thing on this page — a 25MB file meant the button said
   * "Sending..." for a minute with no other sign of life, and an upload that
   * failed took the typed message down with it. Sharing the link to where the
   * document already lives is faster, stays current when the document
   * changes, and cannot half-succeed.
   */
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageContent.trim() && attachments.length === 0) return;

    setSendingMessage(true);
    setMessageError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: messageContent.trim() || '(link attached)',
          attachments,
        }),
      });

      if (response.ok) {
        setMessageContent('');
        setAttachments([]);
        loadProject();
      } else {
        const data = await response.json().catch(() => ({}));
        setMessageError(data?.error || "Couldn't send that — try again in a moment.");
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessageError('Could not reach the server — check your connection and try again.');
    } finally {
      setSendingMessage(false);
    }
  };

  const handlePayBalance = async () => {
    setPayBalanceError('');
    setPayingBalance(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/pay-balance`, { method: 'POST' });
      const data = await response.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        setPayBalanceError(data.error || "Couldn't start checkout — try again in a moment.");
        setPayingBalance(false);
      }
    } catch {
      setPayBalanceError('Could not reach the server — check your connection and try again.');
      setPayingBalance(false);
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

  if (failure || !project) {
    const unavailable = failure === 'unavailable';
    return (
      <main className="min-h-screen bg-[#05030a] text-white flex items-center justify-center px-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 max-w-md">
          <h1 className="text-2xl font-bold mb-4">
            {unavailable ? "We couldn't load this just now" : 'We can’t find this project'}
          </h1>
          <p className="text-white/50 mb-6">
            {unavailable
              ? 'Something on our side went wrong. Try again in a moment — if it keeps happening, reply to any of our emails and we’ll sort it out.'
              : 'It may have moved, or this link may belong to a different account. Reply to any of our emails and we’ll send you the right one.'}
          </p>
          {unavailable ? (
            <button
              onClick={() => {
                setLoading(true);
                setFailure(null);
                loadProject();
              }}
              className="rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-2.5 font-semibold text-black hover:opacity-90 transition-opacity"
            >
              Try again
            </button>
          ) : (
            <Link href="/client/projects" className="text-sky-300 font-semibold hover:underline">
              Back to your projects
            </Link>
          )}
        </div>
      </main>
    );
  }

  const currentStage = STATUS_STAGES[Math.min(project.statusStage, 4)];
  const progressPct = ((Math.min(project.statusStage + 1, 5)) / 5) * 100;
  // Defaulted, because a dashboard already open in a tab when this shipped
  // is holding a project payload from before invoices existed.
  const invoices = project.invoices ?? [];
  const openableDeliverables = (project.deliverables ?? []).filter((f) => isOpenable(f));
  // Section 16's thirty days. Computed from the stored end date rather than
  // from the launch date, so a client reading their remaining cover here sees
  // the same deadline the studio does.
  const warranty = warrantyState(project.warrantyEndsAt);

  // The public status link carries a capability token, so the project ID
  // alone doesn't open it. Without the token there's nothing to share.
  const shareUrl = () =>
    project?.shareToken ? `${window.location.origin}/status/${projectId}?t=${project.shareToken}` : '';

  const handleCopySummary = () => {
    const latestUpdate = project.updates[0];
    const lines = [
      `${project.name} — status summary`,
      `Stage: ${currentStage} (${Math.min(project.statusStage + 1, 5)}/5)`,
      project.estimatedCompletionDate
        ? `Estimated target: ${new Date(project.estimatedCompletionDate).toLocaleDateString()}`
        : null,
      `Balance due: ${formatCentsExact(project.balanceDue)}`,
      latestUpdate ? `Latest update: ${latestUpdate.title} (${new Date(latestUpdate.createdAt).toLocaleDateString()})` : null,
      '',
      `View live: ${typeof window !== 'undefined' ? shareUrl() : ''}`,
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    setSummaryCopied(true);
    setTimeout(() => setSummaryCopied(false), 2000);
  };

  const handleCopyShareLink = () => {
    navigator.clipboard.writeText(shareUrl());
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // The client is the one who forwards this link, so the client is the one
  // who finds out it reached somebody it shouldn't have. Revoking issues a
  // new token, which kills every copy already sent.
  const handleRevokeShareLink = async () => {
    if (!confirm('Turn off the current status link?\n\nAnyone you have already sent it to will no longer be able to open it. You will get a fresh link to share instead.')) return;
    setRevokingLink(true);
    try {
      const res = await fetch('/api/share-links/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'project', id: projectId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setProject((prev) => (prev ? { ...prev, shareToken: data.shareToken } : prev));
        setLinkRevoked(true);
        setTimeout(() => setLinkRevoked(false), 4000);
      }
    } catch {
      // Non-fatal: the old link simply keeps working and they can retry.
    } finally {
      setRevokingLink(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-[#05030a] text-white overflow-hidden">
      <GridBackdrop className="opacity-40" />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-96 w-[40rem] rounded-full blur-[140px] opacity-20"
        style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.5), transparent 70%)' }}
      />

      <div className="relative">
        <ClientHeader />

        {/* Project header */}
        <div className="relative border-b border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent overflow-hidden">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.1, ease: EASE }}
            style={{ originX: 0 }}
            className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-sky-400 via-purple-400 to-transparent"
          />
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="max-w-6xl mx-auto px-6 py-10 flex flex-wrap justify-between items-start gap-6"
          >
            <div className="flex items-start gap-4 min-w-0">
              <span className="shrink-0 hidden sm:flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400/25 to-purple-500/25 border border-white/10 text-xl font-bold text-white/90">
                {project.client.company.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/80 mb-2">
                  {project.client.company}
                </p>
                <h1 className="text-3xl md:text-[2.75rem] md:leading-[1.05] font-bold tracking-tight break-words">
                  {project.name}
                </h1>
                <p className="text-white/40 text-sm mt-2 flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-emerald-400/70" />
                  Under active management since {new Date(project.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
            {/*
              Wraps, and is allowed to shrink.
              `shrink-0` on a row of three buttons means it keeps its content
              width whatever the viewport: at 320px it reached 475px, and the
              page does not scroll horizontally, so "Copy status summary" was
              simply cut off the right edge of the client's own portal on a
              small phone. The header around it already wraps; this did not.
            */}
            <div className="flex flex-wrap gap-2">
              <motion.button
                onClick={handleCopyShareLink}
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/70 hover:text-white hover:border-white/40 hover:bg-white/5 transition-colors whitespace-nowrap"
              >
                {linkCopied ? 'Copied ✓' : 'Share status link'}
              </motion.button>
              <motion.button
                onClick={handleRevokeShareLink}
                disabled={revokingLink}
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                title="Stop the link you've already shared from working, and get a new one"
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/45 hover:text-white/80 hover:border-white/30 hover:bg-white/5 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {revokingLink ? 'Turning off…' : linkRevoked ? 'Old link off ✓' : 'Turn off old link'}
              </motion.button>
              <motion.button
                onClick={handleCopySummary}
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/70 hover:text-white hover:border-white/40 hover:bg-white/5 transition-colors whitespace-nowrap"
              >
                {summaryCopied ? 'Copied ✓' : 'Copy status summary'}
              </motion.button>
            </div>
          </motion.div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-8">
          {/*
            Which tab you are on was conveyed by colour and nothing else.
            
            Four plain buttons, the active one filled with a gradient and its
            label turned black. Nothing in the markup said which was current,
            so a screen reader read four identical buttons; forced-colours and
            high-contrast modes drop the gradient and lose it for sighted
            people too.

            The badges had the same problem in a sharper form. "3 unread
            messages", "new updates since you last looked" and "2 questions
            still to answer" were a red pill, a green dot and an amber pill —
            the only three things on this page telling a client something
            needs them, and none of them said so in words. They are part of
            each tab's name now.

            The pattern matches /admin/sales: roving tabindex, arrows to move,
            manual activation, and a real panel. Same behaviour on both sides
            of the product.
          */}
          <div
            role="tablist"
            aria-label="Project sections"
            onKeyDown={onTabKeyDown}
            /*
              Scrolls rather than overflows.
              Four pills plus their badges need ~418px, and `w-fit` on a
              non-wrapping row meant that width was taken whatever the
              viewport. At 320px the page does not scroll horizontally, so
              Onboarding — the tab with "3 still to answer" on it — was cut off
              the edge of the client's own portal and could not be reached at
              all. A pill bar cannot wrap without looking broken, so it scrolls
              on its own axis instead; `max-w-full` is what lets it be narrower
              than its content, which `w-fit` alone forbids.
            */
            className="flex gap-1 mb-8 max-w-full w-fit overflow-x-auto p-1 rounded-full border border-white/10 bg-white/5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {(['overview', 'timeline', 'messages', 'onboarding'] as const).map((tab, i) => {
              const unanswered = questions.filter((q) => !q.response).length;
              const badge =
                tab === 'messages' && unreadCount > 0
                  ? `${unreadCount} unread`
                  : tab === 'timeline' && project.updates.some((u) => isNew(u.createdAt))
                    ? 'new updates'
                    : tab === 'onboarding' && unanswered > 0
                      ? `${unanswered} still to answer`
                      : null;
              const label = tab.charAt(0).toUpperCase() + tab.slice(1);
              return (
              <button
                key={tab}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                id={`client-tab-${tab}`}
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls="client-tab-panel"
                aria-label={badge ? `${label}, ${badge}` : undefined}
                tabIndex={activeTab === tab ? 0 : -1}
                onClick={() => setActiveTab(tab)}
                className={`relative px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeTab === tab ? 'text-black' : 'text-white/50 hover:text-white'
                }`}
              >
                {activeTab === tab && (
                  <motion.span
                    layoutId="clientTabIndicator"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-sky-400 to-purple-500"
                  />
                )}
                <span className="relative">{label}</span>
                {tab === 'messages' && unreadCount > 0 && (
                  <span aria-hidden="true" className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                    {unreadCount}
                  </span>
                )}
                {tab === 'timeline' && project.updates.some((u) => isNew(u.createdAt)) && (
                  <span aria-hidden="true" className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 border border-[#05030a]" />
                )}
                {tab === 'onboarding' && questions.some((q) => !q.response) && (
                  <span aria-hidden="true" className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-black text-[10px] font-bold">
                    {questions.filter((q) => !q.response).length}
                  </span>
                )}
              </button>
              );
            })}
          </div>

        <div id="client-tab-panel" role="tabpanel" aria-labelledby={`client-tab-${activeTab}`} tabIndex={0} className="outline-none">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
            {/* Ready for launch — the beat before the beat.
                Section 1 defines "Ready for Launch" as the state we have
                confirmed in writing through this dashboard, and the client
                had no way of seeing that confirmation. It is also the moment
                the last payment falls due, so it is the one point in the
                whole engagement where telling them exactly where they stand
                matters most. */}
            {project.readyForLaunchAt && !project.liveUrl && (
              <motion.div
                variants={fadeUp}
                className="relative overflow-hidden rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-400/[0.10] via-orange-400/[0.05] to-purple-500/[0.08] p-8 backdrop-blur-xl md:p-10"
              >
                <div
                  className="pointer-events-none absolute -top-28 right-0 h-64 w-64 rounded-full opacity-25 blur-[100px]"
                  style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.6), transparent 70%)' }}
                />
                <div className="relative">
                  <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                    <Rocket size={12} /> Ready for launch
                  </span>
                  <h2 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">
                    {project.name} is built and ready to go live
                  </h2>
                  {/* Two different sentences, because telling somebody who
                      has already paid in full that we are waiting on their
                      payment is the fastest way to make a good moment into an
                      email. */}
                  <p className="mt-2 max-w-lg text-white/60">
                    {project.balanceDue > 0
                      ? 'Everything is finished and checked. The last step is switching it on, which we do as soon as the final payment clears — and then the site, the files, the accounts and the ownership of all of it are yours.'
                      : 'Everything is finished, checked and paid for. We are switching it on now — the site, the files, the accounts and the ownership of all of it are yours.'}
                  </p>
                  <p className="mt-4 text-xs leading-relaxed text-white/35">
                    Confirmed ready on{' '}
                    {new Date(project.readyForLaunchAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    {project.domainName && ` · going live on ${project.domainName}`}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Delivery moment — the actual "you're done" beat, not just
                another line inside the routine status card. */}
            {project.statusStage >= 4 && (
              <motion.div
                variants={fadeUp}
                className="relative rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-400/10 via-sky-400/5 to-purple-500/10 backdrop-blur-xl p-8 md:p-10 overflow-hidden text-center"
              >
                {!reduceMotion && <ConfettiBurst />}
                <div
                  className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full blur-[100px] opacity-30"
                  style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.6), transparent 70%)' }}
                />
                <div className="relative">
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.1 }}
                    className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-sky-400 mb-5 shadow-[0_0_40px_-8px_rgba(52,211,153,0.7)]"
                  >
                    <PartyPopper size={28} className="text-black" />
                  </motion.div>
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
                    Your project is live 🎉
                  </h2>
                  <p className="text-white/60 max-w-md mx-auto mb-7">
                    {project.name} is finished, shipped, and ready. It's been a pleasure building this with you.
                  </p>

                  {project.liveUrl && (
                    <motion.a
                      href={project.liveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      whileHover={{ scale: 1.03, y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                      className="relative inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 text-black font-semibold px-8 py-3.5 overflow-hidden shadow-[0_0_40px_-10px_rgba(52,211,153,0.7)]"
                    >
                      <span className="relative z-10 flex items-center gap-2">
                        <Rocket size={16} /> Visit Your Live Site <ExternalLink size={14} />
                      </span>
                      {!reduceMotion && (
                        <motion.span
                          animate={{ x: ['-120%', '220%'] }}
                          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2.5 }}
                          className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                        />
                      )}
                    </motion.a>
                  )}

                  {/* A celebration with no button on it.
                      Stage 4 with no URL rendered confetti, a headline saying
                      the project was live, and nothing to click — which is
                      the one version of this card that makes somebody doubt
                      the whole dashboard. */}
                  {!project.liveUrl && (
                    <p className="mx-auto max-w-md text-sm text-white/50">
                      We are switching it on now. The link will appear here the moment it is up, and
                      we will email you.
                    </p>
                  )}

                  {(project.deliverables.length > 0 || project.contractUrl) && (
                    <p className="text-xs text-white/35 mt-5">
                      Everything you need — deliverables and your signed agreement — is below.
                    </p>
                  )}

                  {/* What they are actually covered for, and until when.
                      The launch email has been saying "the warranty period
                      starts today" since it was written, against nothing the
                      client could ever look up. */}
                  {project.liveUrl && (
                    <div className="mt-7 grid gap-2.5 text-left sm:grid-cols-2">
                      <div
                        className={`rounded-xl border p-4 ${
                          warranty.active
                            ? 'border-emerald-400/25 bg-emerald-400/[0.06]'
                            : 'border-white/10 bg-white/[0.03]'
                        }`}
                      >
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
                          <ShieldCheck size={13} className={warranty.active ? 'text-emerald-300' : 'text-white/40'} />
                          {warranty.active
                            ? `Warranty — ${warranty.daysLeft} day${warranty.daysLeft === 1 ? '' : 's'} left`
                            : 'Warranty'}
                        </p>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-white/45">
                          {warranty.clientLine}
                        </p>
                      </div>

                      <div
                        className={`rounded-xl border p-4 ${
                          project.handoverAt
                            ? 'border-emerald-400/25 bg-emerald-400/[0.06]'
                            : 'border-white/10 bg-white/[0.03]'
                        }`}
                      >
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
                          <KeyRound size={13} className={project.handoverAt ? 'text-emerald-300' : 'text-white/40'} />
                          {project.handoverAt ? 'Everything handed over' : 'Handover'}
                        </p>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-white/45">
                          {project.handoverAt
                            ? `Credentials, source and documentation are yours as of ${new Date(
                                project.handoverAt
                              ).toLocaleDateString()} — along with the ownership of everything we built.`
                            : project.balanceDue > 0
                              ? 'The credentials, the source and the ownership all transfer once the balance clears. Until then the site is up and running and yours to use.'
                              : 'Paid in full — the credentials, the source and the ownership are all yours. We will confirm here once they are with you.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Onboarding nudge */}
            {questions.some((q) => !q.response) && (
              <motion.div
                variants={fadeUp}
                className="rounded-2xl border border-amber-400/30 bg-amber-400/10 backdrop-blur-xl p-6 flex justify-between items-center gap-4"
              >
                <div>
                  <p className="font-semibold text-amber-200">
                    {questions.filter((q) => !q.response).length === 1
                      ? '1 question needs your answer'
                      : `${questions.filter((q) => !q.response).length} questions need your answer`}
                  </p>
                  <p className="text-sm text-amber-200/70 mt-0.5">
                    Answering these helps the team keep moving without waiting on you.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('onboarding')}
                  className="shrink-0 rounded-full bg-amber-400 text-black text-sm font-semibold px-5 py-2 hover:opacity-90 transition-opacity whitespace-nowrap"
                >
                  Answer now
                </button>
              </motion.div>
            )}

            {/* Current Status */}
            <motion.div
              variants={fadeUp}
              className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 overflow-hidden"
            >
              <div
                className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full blur-[100px] opacity-[0.15]"
                style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.8), transparent 70%)' }}
              />
              <div className="relative flex items-center gap-2 mb-6">
                <Sparkles size={16} className="text-sky-300" />
                <h2 className="text-xl font-bold">Project Status</h2>
              </div>

              <div className="relative flex justify-between items-center mb-3">
                <span className="font-semibold text-lg">{currentStage}</span>
                <span className="text-sm text-white/50 tabular-nums">
                  Stage {Math.min(project.statusStage + 1, 5)} of 5
                </span>
              </div>
              <div className="relative w-full bg-white/10 rounded-full h-2.5 mb-2 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 1, ease: EASE, delay: 0.2 }}
                  className="relative h-2.5 rounded-full bg-gradient-to-r from-sky-400 to-purple-500 overflow-hidden"
                >
                  {!reduceMotion && (
                    <motion.div
                      animate={{ x: ['-100%', '220%'] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.4 }}
                      className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                    />
                  )}
                </motion.div>
              </div>
              {project.estimatedCompletionDate && (
                <p className="text-xs text-white/40 mb-6">
                  Estimated target:{' '}
                  <span className="text-white/70 font-medium">
                    {new Date(project.estimatedCompletionDate).toLocaleDateString(undefined, {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </p>
              )}
              {!project.estimatedCompletionDate && <div className="mb-6" />}

              <div className="relative grid grid-cols-2 md:grid-cols-5 gap-3">
                {STATUS_STAGES.map((stage, idx) => {
                  const reached = idx <= Math.min(project.statusStage, 4);
                  const isCurrent = idx === Math.min(project.statusStage, 4);
                  return (
                    <motion.div
                      key={stage}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, ease: EASE, delay: 0.5 + idx * 0.06 }}
                      className={`relative p-3 rounded-lg text-center text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                        reached
                          ? 'bg-gradient-to-r from-sky-400/20 to-purple-500/20 border border-sky-400/30 text-white'
                          : 'bg-white/5 border border-white/10 text-white/30'
                      }`}
                    >
                      {isCurrent && !reduceMotion && (
                        <motion.span
                          animate={{ opacity: [0.5, 0, 0.5], scale: [1, 1.15, 1] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                          className="absolute inset-0 rounded-lg border border-sky-400/50"
                        />
                      )}
                      {reached ? (
                        <CheckCircle2 size={13} className="text-sky-300 shrink-0" />
                      ) : (
                        <Circle size={13} className="text-white/20 shrink-0" />
                      )}
                      <span>{stage}</span>
                    </motion.div>
                  );
                })}
              </div>

              {/* The brief, before anything is designed.
                  Nearly every expensive restart on a design project is a
                  direction problem discovered a week after the direction was
                  set — usually from a sentence on a call. Ten minutes here
                  buys both sides something to measure the first concept
                  against, which is what turns "that's not what I wanted" from
                  an argument into a category. */}
              {/* …but only while there is still a design to brief.
                  The condition was "no brief signed and no design approved",
                  which stays true forever on a project that never used the
                  brief — so a launched, handed-over site was asking its owner
                  to fill in a design brief underneath the confetti. Anything
                  past Design has nothing left to brief. */}
              {!project.designDirection?.signedAt &&
                !project.designReview?.approvedAt &&
                project.statusStage <= 1 && (
                <div className="relative mt-6 rounded-xl border border-purple-400/30 bg-purple-400/[0.06] p-5">
                  <p className="mb-1 text-sm font-semibold text-purple-200">
                    {project.designReview?.presentedAt
                      ? 'We still need your design brief'
                      : 'One thing before we start designing'}
                  </p>
                  <p className="text-sm text-white/70">
                    You&apos;ve told us what the site needs to do. This is the other half — what it
                    should look and feel like.
                  </p>
                  {!showDirectionForm && (
                    <button
                      onClick={() => setShowDirectionForm(true)}
                      className="mt-4 rounded-lg bg-gradient-to-r from-purple-400 to-sky-400 px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
                    >
                      Fill in the design brief
                    </button>
                  )}
                  {showDirectionForm && project.designDirectionStatement && (
                    <DesignDirectionForm
                      projectId={projectId}
                      statement={project.designDirectionStatement}
                      onSigned={() => {
                        setShowDirectionForm(false);
                        loadProject();
                      }}
                    />
                  )}
                </div>
                )}

              {/* Once signed, it sits beside the design. They judge the concept
                  against it, and so do we. */}
              {project.designDirection?.signedAt && (
                <details className="relative mt-6 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-white/80">
                    The design brief you agreed
                    {project.designDirection.adjectives?.length > 0 && (
                      <span className="ml-2 font-normal text-white/40">
                        {project.designDirection.adjectives.join(' · ')}
                      </span>
                    )}
                  </summary>
                  <div className="mt-3 space-y-3 text-sm text-white/65">
                    {project.designDirection.likes?.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs uppercase tracking-wide text-white/35">Sites you liked</p>
                        <ul className="space-y-1">
                          {project.designDirection.likes.map((l, i) => (
                            <li key={i}>
                              <span className="text-white/85">{l.url}</span>
                              {l.why && <span className="text-white/50"> — {l.why}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {project.designDirection.untouchable && (
                      <p>
                        <span className="text-white/40">Mustn&apos;t change: </span>
                        {project.designDirection.untouchable}
                      </p>
                    )}
                    {project.designDirection.hardNos && (
                      <p>
                        <span className="text-white/40">Hard no&apos;s: </span>
                        {project.designDirection.hardNos}
                      </p>
                    )}
                    <p className="text-xs text-white/30">
                      Agreed by {project.designDirection.signerName} on{' '}
                      {new Date(project.designDirection.signedAt).toLocaleDateString()}
                    </p>
                  </div>
                </details>
              )}

              {/* The design waiting on them, and the deadline they were given.
                  Deemed approval under Section 4 only holds up if the client
                  could see the clock running — burying it would make the
                  clause both unfair and unarguable. */}
              {project.designReview?.presentedAt && !project.designReview.approvedAt && (
                <div className="relative mt-6 rounded-xl border border-sky-400/30 bg-sky-400/[0.07] p-5">
                  <p className="mb-1 text-sm font-semibold text-sky-200">
                    {project.designReview.stage?.label
                      ? `${project.designReview.stage.label} — ready to review`
                      : 'Your design is ready to review'}
                  </p>
                  {/* What this round is, before what they have to do about it.
                      The concept is not a revision, and a client who thinks it
                      is believes they have spent half their allowance by
                      opening the email. */}
                  {project.designReview.stage?.meaning && (
                    <p className="mb-3 text-sm text-white/55">{project.designReview.stage.meaning}</p>
                  )}
                  {/* The design itself. This is the one thing the card was
                      missing: it asked for approval of something it gave no
                      way to look at. */}
                  {project.designReview.designUrl && (
                    <a
                      href={project.designReview.designUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mb-4 inline-flex items-center gap-2 rounded-lg border border-sky-400/40 bg-sky-400/10 px-4 py-2.5 text-sm font-semibold text-sky-100 transition-colors hover:bg-sky-400/20"
                    >
                      View the design
                      <ExternalLink size={14} />
                    </a>
                  )}
                  <p className="text-sm text-white/70">
                    Have a look and tell us what you think
                    {project.designReview.reviewEndsAt && (
                      <>
                        {' '}by{' '}
                        <span className="font-semibold text-white">
                          {new Date(project.designReview.reviewEndsAt).toLocaleDateString(undefined, {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </span>
                      </>
                    )}
                    . If we haven&apos;t heard from you by then we&apos;ll take it as approved and start
                    building, so nothing stalls on a message that never got sent.
                  </p>
                  {/* Two doors, equally weighted.
                      "Approve" used to be the only button, with changes
                      relegated to a message box — which quietly asks a client
                      who has reservations to either swallow them or go and do
                      something harder. The second door is a proper form, and
                      it is right here. */}
                  {!feedbackSent && !showFeedbackForm && (
                    <>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          onClick={approveDesign}
                          disabled={approvingDesign}
                          className="rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {approvingDesign ? 'Saving…' : 'Approve the design'}
                        </button>
                        <button
                          onClick={() => setShowFeedbackForm(true)}
                          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/5"
                        >
                          I&apos;d like some changes
                        </button>
                      </div>
                      {project.designReview.revisions && (
                        <p className="mt-2 text-xs text-white/40">
                          {project.designReview.revisions.clientLine}
                        </p>
                      )}
                    </>
                  )}

                  {showFeedbackForm && !feedbackSent && (
                    <DesignFeedbackForm
                      projectId={projectId}
                      revisionLine={project.designReview.revisions?.clientLine ?? ''}
                      onCancel={() => setShowFeedbackForm(false)}
                      onDone={(ack) => {
                        setFeedbackSent(ack);
                        setShowFeedbackForm(false);
                        loadProject();
                      }}
                    />
                  )}

                  {feedbackSent && (
                    <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4">
                      <p className="text-sm text-emerald-200">{feedbackSent}</p>
                    </div>
                  )}

                  {approveError && <p className="mt-2 text-xs text-red-300">{approveError}</p>}
                </div>
              )}

              {project.designReview?.approvedAt && project.statusStage <= 2 && (
                <div className="relative mt-6 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4">
                  <p className="text-sm text-emerald-200">
                    {project.designReview.deemed
                      ? "The review period passed without us hearing back, so the design is approved and we're building it. If anything about it isn't right, tell us — we'd always rather know now."
                      : "You've approved the design — we're building it."}
                  </p>
                  {/* Still reachable afterwards. "Approved" is exactly when
                      somebody wants to show it to whoever else needs to see
                      it, and it used to disappear at that moment. */}
                  {project.designReview.designUrl && (
                    <a
                      href={project.designReview.designUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-200 hover:text-emerald-100"
                    >
                      View the approved design
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              )}

              <div className="relative mt-6 rounded-lg bg-white/5 border border-white/10 p-4">
                <p className="text-sm font-semibold text-sky-300 mb-1">What's happening in {currentStage}?</p>
                <p className="text-sm text-white/60">{STAGE_EXPLANATIONS[currentStage]}</p>
              </div>

              {STAGE_WHATS_NEXT[currentStage] && (
                <div className="relative mt-3 rounded-lg bg-gradient-to-r from-sky-400/10 to-purple-500/10 border border-white/10 p-4">
                  <p className="text-sm font-semibold text-white/80 mb-1">What's next</p>
                  <p className="text-sm text-white/60">{STAGE_WHATS_NEXT[currentStage]}</p>
                </div>
              )}
            </motion.div>

            {/* Project Details */}
            <motion.div variants={fadeUp} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
              <h2 className="text-xl font-bold mb-6">Project Details</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  <p className="text-lg font-semibold">
                    <CountUp value={formatCentsExact(project.totalPrice)} />
                  </p>
                </div>

                {project.addOns.length > 0 && (
                  <div>
                    <h3 className="text-sm text-white/40 mb-1">Add-ons</h3>
                    {/* The catalogue's own names, not the storage keys with a
                        capital letter bolted on — which is how a client came
                        to be shown "Seo" as the name of something they had
                        paid for. */}
                    <p className="text-lg font-semibold">
                      {project.addOns.map(addOnLabel).join(', ')}
                    </p>
                  </div>
                )}

                {project.customItems && project.customItems.length > 0 && (
                  <div>
                    <h3 className="text-sm text-white/40 mb-1">Custom items</h3>
                    <p className="text-lg font-semibold">
                      {project.customItems.map((item) => item.label).join(', ')}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Payments */}
            <motion.div variants={fadeUp} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
              <h2 className="text-xl font-bold mb-6">Payments</h2>

              <div className="flex justify-between text-sm mb-1">
                <span className="text-white/40">Paid</span>
                <span className="text-emerald-300 font-medium">
                  <CountUp value={formatCentsExact(project.amountPaid)} />
                </span>
              </div>
              <div className="flex justify-between text-sm mb-3">
                <span className="text-white/40">Balance Due</span>
                <span className={`font-medium ${project.balanceDue > 0 ? 'text-amber-300' : 'text-white/40'}`}>
                  {formatCentsExact(project.balanceDue)}
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 mb-6 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (project.amountPaid / project.totalPrice) * 100)}%` }}
                  transition={{ duration: 1, ease: EASE, delay: 0.3 }}
                  className="bg-gradient-to-r from-emerald-400 to-sky-400 h-1.5 rounded-full"
                />
              </div>

              {(project.instalments?.length ?? 0) > 0 && (
                <div className="mb-6 space-y-2">
                  {project.instalments!.map((inst) => {
                    /*
                     * What is actually left on this payment.
                     *
                     * The row used to show the billed amount and "Due now",
                     * full stop, so a client who had already transferred half
                     * read their own schedule as asking for all of it again —
                     * their money nowhere on the one list they check to know
                     * where they stand. The invoice card below already says
                     * what is left; this is the same fact reaching the schedule
                     * beside it.
                     */
                    const received = Math.min(inst.receivedCents ?? 0, inst.amountCents);
                    const partPaid = inst.status !== 'paid' && received > 0;
                    const outstanding = inst.amountCents - received;
                    return (
                    <div
                      key={inst.id}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                        inst.status === 'due' ? 'border-sky-400/30 bg-sky-400/[0.06]' : 'border-white/10'
                      }`}
                    >
                      <span
                        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                          inst.status === 'paid'
                            ? 'bg-emerald-400/20 text-emerald-300'
                            : inst.status === 'due'
                            ? 'bg-sky-400/20 text-sky-300'
                            : 'bg-white/10 text-white/40'
                        }`}
                      >
                        {inst.status === 'paid' ? '✓' : inst.index}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">
                          {inst.label}
                          <span className="text-white/40">
                            {' '}· {formatCentsExact(partPaid ? outstanding : inst.amountCents)}
                          </span>
                          {/*
                            The billed figure stays visible, struck through, so
                            the number the client has on their invoice and in
                            their agreement is still findable on the row that
                            no longer leads with it.
                          */}
                          {partPaid && (
                            <span className="text-white/25 line-through">
                              {' '}{formatCentsExact(inst.amountCents)}
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-white/35 truncate">
                          {inst.status === 'paid'
                            ? `Paid${inst.paidAt ? ` ${new Date(inst.paidAt).toLocaleDateString()}` : ''}`
                            : partPaid
                            ? /*
                               * Thanked, not just accounted for. The client did
                               * the right thing and the previous row read as
                               * though nothing had happened.
                               */
                              `${formatCentsExact(received)} received, thank you — ${formatCentsExact(outstanding)} left${inst.invoiceNumber ? ` · invoice ${inst.invoiceNumber}` : ''}`
                            : inst.status === 'due'
                            ? `Due now${inst.dueAt ? ` — by ${new Date(inst.dueAt).toLocaleDateString()}` : ''}${inst.invoiceNumber ? ` · invoice ${inst.invoiceNumber}` : ''}`
                            : inst.trigger === 'design-approval'
                            ? 'Falls due when you approve the design'
                            : inst.trigger === 'ready-for-launch'
                            ? 'Falls due when your project is ready to launch'
                            : 'Due on signing'}
                        </p>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}

              {(project.instalments?.length
                ? project.instalments.some((i) => i.status === 'due')
                : project.balanceDue > 0) && (
                <div className="mb-6">
                  <motion.button
                    onClick={handlePayBalance}
                    disabled={payingBalance}
                    whileHover={{ scale: 1.015, y: -1 }}
                    whileTap={{ scale: 0.985 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    className="relative w-full py-3 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 text-black font-semibold disabled:opacity-50 overflow-hidden shadow-[0_0_30px_-10px_rgba(56,189,248,0.6)]"
                  >
                    <span className="relative z-10">
                      {payingBalance
                        ? 'Redirecting to checkout…'
                        : (() => {
                            const due = project.instalments?.find((i) => i.status === 'due');
                            return due
                              ? `Pay ${due.label} — $${(due.amountCents / 100).toLocaleString('en-US', {
                                  minimumFractionDigits: due.amountCents % 100 ? 2 : 0,
                                  maximumFractionDigits: due.amountCents % 100 ? 2 : 0,
                                })}`
                              : `Pay Balance — ${formatCentsExact(project.balanceDue)}`;
                          })()}
                    </span>
                    {!payingBalance && !reduceMotion && (
                      <motion.span
                        animate={{ x: ['-120%', '220%'] }}
                        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
                        className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                      />
                    )}
                  </motion.button>
                  {payBalanceError && <p className="text-red-400 text-xs mt-2">{payBalanceError}</p>}
                  <p className="text-white/30 text-[11px] mt-2 flex items-center gap-1">
                    <ShieldCheck size={11} className="text-emerald-400/60" />
                    Secure checkout by Stripe — we never see or store your card details.
                  </p>
                </div>
              )}

              {project.payments.length > 0 ? (
                <div className="space-y-2">
                  {project.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex justify-between items-center py-2 border-b border-white/10 last:border-b-0"
                    >
                      <div>
                        <p className="text-sm font-medium capitalize">{payment.type}</p>
                        <p className="text-xs text-white/30">
                          {new Date(payment.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-emerald-300">
                        {formatCentsExact(payment.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white/40">No payments recorded yet.</p>
              )}
            </motion.div>

            {/* Invoices — one-off charges for work agreed outside the original
                scope. Kept separate from the balance above on purpose: these
                are billed and paid on their own, so folding them into the
                project total would make both numbers wrong. */}
            {invoices.length > 0 && (
              <motion.div variants={fadeUp} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
                <h2 className="text-xl font-bold mb-2">Invoices</h2>
                <p className="text-xs text-white/40 mb-6">
                  Additional work agreed outside your original project scope. Each one is billed on its own.
                </p>

                <div className="space-y-3">
                  {invoices.map((invoice) => {
                    const paid = invoice.status === 'paid';
                    const voided = invoice.status === 'void';
                    // Money that came back has to say so here. A client
                    // looking at "Paid" on an invoice they were refunded
                    // against has no way to reconcile their own bank
                    // statement, and asks us instead.
                    const refunded = invoice.refundedCents ?? 0;
                    const credited = invoice.refundMethod === 'credit';
                    /*
                     * How much of it has actually arrived.
                     *
                     * An invoice can be part paid by transfer, and this page
                     * read `status` alone — so one a client had sent half of
                     * showed as "Due" for the whole amount, with a Pay button
                     * beside it that would have taken the whole amount again.
                     */
                    const received = invoice.receivedCents ?? 0;
                    const partPaid = !paid && !voided && received > 0;
                    const label = voided
                      ? 'Cancelled'
                      : refunded <= 0
                        ? paid
                          ? 'Paid'
                          : partPaid
                            ? 'Part paid'
                            : 'Due'
                        : credited
                          ? 'Credited'
                          : refunded >= invoice.amountCents
                            ? 'Refunded'
                            : 'Part refunded';
                    return (
                      <div key={invoice.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{invoice.description}</p>
                            <p className="text-xs text-white/30 mt-0.5">
                              {invoice.number} · {new Date(invoice.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold">{formatCentsExact(invoice.amountCents)}</p>
                            <span
                              className={`inline-block mt-1 text-[10px] uppercase tracking-wider font-semibold ${
                                refunded > 0
                                  ? 'text-purple-300'
                                  : paid
                                    ? 'text-emerald-300'
                                    : voided
                                      ? 'text-white/30'
                                      : 'text-amber-300'
                              }`}
                            >
                              {label}
                            </span>
                            {refunded > 0 && refunded < invoice.amountCents && (
                              <p className="mt-0.5 text-[10px] text-white/35">
                                {formatCentsExact(refunded)} back
                              </p>
                            )}
                          </div>
                        </div>

                        {(invoice.voidReason || invoice.refundReason) && (
                          <p className="mt-2 text-xs text-white/45">
                            {invoice.voidReason || invoice.refundReason}
                          </p>
                        )}

                        {/*
                          More of their money here than the invoice was for.
                          
                          Two payments landing on one invoice — a transfer, and
                          then the original pay link, which is for the whole
                          amount and has no partial version. The studio's
                          ledger says "$900 overpaid" on this row. The client's
                          copy said "Paid", which is true, and left the person
                          who is actually out of pocket as the only one not
                          told.
                        */}
                        {received > invoice.amountCents && (
                          <p className="mt-2 text-xs text-amber-300">
                            {/* The explicit space is load-bearing: JSX drops
                                the whitespace between an expression and the
                                text after it when the expression ends a line,
                                which is how "$900more than" got shipped once
                                already on this very screen. */}
                            {formatCentsExact(received - invoice.amountCents)}{' '}
                            more than this invoice was for has reached us — almost always a transfer
                            and a card payment landing on the same invoice. It&apos;s yours;
                            we&apos;re sending it back.
                          </p>
                        )}

                        {/* Their own money, said back to them. Without this
                            the row asks for the full amount from somebody who
                            has already sent part of it. */}
                        {partPaid && (
                          <p className="mt-2 text-xs text-sky-300/80">
                            {formatCentsExact(received)} received —{' '}
                            {formatCentsExact(invoice.amountCents - received)}
                            {' '}left. We&apos;ll be in touch about the rest, or reply to any of our
                            emails to settle it.
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          {/* `refunded` as well as the route's own gate, on
                              purpose. The route withholds the link on an
                              invoice money has gone back off — but the button
                              here is what actually charges somebody, and it
                              should not be one payload away from charging a
                              client for work we have just refunded them for. */}
                          {!paid && !voided && refunded <= 0 && invoice.paymentUrl && (
                            <a
                              href={invoice.paymentUrl}
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 text-black text-xs font-semibold"
                            >
                              Pay {formatCentsExact(invoice.amountCents)}
                            </a>
                          )}
                          {invoice.pdfUrl && (
                            <a
                              href={invoice.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 rounded-lg border border-white/15 text-xs text-white/70 hover:text-white hover:border-white/30 transition-colors inline-flex items-center gap-1.5"
                            >
                              <Download size={12} />
                              Invoice PDF
                            </a>
                          )}
                          {/* Not on a part-paid invoice: the line above it
                              already says what is left and how it gets
                              settled, and "we'll send a payment link shortly"
                              beside it is a second, different promise about
                              the same money.

                              Not on a refunded one either. An invoice stays
                              open through a refund, so this promised a payment
                              link to somebody we had just given their money
                              back — under a badge on the same row reading
                              "Refunded". If it becomes payable again it will
                              be a new invoice. */}
                          {!paid && !voided && !partPaid && refunded <= 0 && !invoice.paymentUrl && (
                            <span className="text-[11px] text-white/40">
                              We&apos;ll send a payment link for this shortly.
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-white/30 text-[11px] mt-4 flex items-center gap-1">
                  <ShieldCheck size={11} className="text-emerald-400/60" />
                  Secure checkout by Stripe — we never see or store your card details.
                </p>
              </motion.div>
            )}

            {/* Signed Agreement */}
            {project.contractUrl && (
              <motion.div variants={fadeUp} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
                <h2 className="text-xl font-bold mb-6">Your Agreement</h2>
                <motion.a
                  href={project.contractUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ x: 3 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className="flex justify-between items-center p-4 rounded-lg border border-white/10 hover:border-white/25 hover:bg-white/[0.03] transition-colors"
                >
                  <div>
                    <p className="font-medium">Signed project agreement</p>
                    <p className="text-xs text-white/40">A copy of the contract you agreed to</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-sky-300">
                    <Download size={14} /> Download
                  </span>
                </motion.a>
              </motion.div>
            )}

            {/* Deliverables
                Broken entries are hidden from the client entirely rather than
                shown as broken. They cannot delete one and cannot fix one, so
                the only thing a "broken link" note would give them is the
                impression we sent them something that doesn't work. The admin
                side flags it instead — the person who can fix it is the one
                who gets told. */}
            {openableDeliverables.length > 0 && (
              <motion.div variants={fadeUp} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
                <h2 className="text-xl font-bold mb-6">Deliverables</h2>
                <div className="space-y-3">
                  {openableDeliverables.map((file) => (
                    <motion.a
                      key={file.id}
                      href={deliverableHref(file.url) as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      whileHover={{ x: 3 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      className="flex justify-between items-center p-4 rounded-lg border border-white/10 hover:border-white/25 hover:bg-white/[0.03] transition-colors"
                    >
                      <div>
                        <p className="font-medium flex items-center">
                          {file.name}
                          {file.addedAt && isNew(file.addedAt) && <NewBadge />}
                        </p>
                        {file.size && <p className="text-xs text-white/40">{file.size}</p>}
                      </div>
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-sky-300">
                        <Download size={14} /> Download
                      </span>
                    </motion.a>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Latest Updates */}
            <motion.div variants={fadeUp} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Latest Updates</h2>
                {project.updates.length > 0 && (
                  <button
                    onClick={() => setActiveTab('timeline')}
                    className="group flex items-center gap-1 text-sm font-semibold text-sky-300 hover:underline"
                  >
                    View full timeline
                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </button>
                )}
              </div>

              {project.updates.length === 0 ? (
                <div className="flex items-center gap-4 rounded-lg bg-white/5 border border-white/10 p-4">
                  <div className="h-2 w-2 rounded-full bg-sky-400 animate-pulse shrink-0" />
                  <p className="text-sm text-white/50">
                    Your team is on it — the first update will show up here as soon as there's progress to share.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {project.updates.slice(0, 3).map((update) => (
                    <div key={update.id} className="border-b border-white/10 pb-4 last:border-b-0 last:pb-0">
                      <h3 className="font-semibold mb-1 flex items-center">
                        {update.title}
                        {isNew(update.createdAt) && <NewBadge />}
                      </h3>
                      <p className="text-white/50 text-sm mb-2">{update.description}</p>
                      <p className="text-xs text-white/30">
                        {new Date(update.createdAt).toLocaleDateString()} by {update.user?.name || 'Bothmade'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* Timeline Tab */}
        {activeTab === 'timeline' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8"
          >
            <h2 className="text-xl font-bold mb-6">Project Timeline</h2>

            <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
              {project.updates.length > 0 ? (
                project.updates.map((update, idx) => (
                  <motion.div variants={fadeUp} key={update.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="relative w-3 h-3 rounded-full bg-gradient-to-r from-sky-400 to-purple-500">
                        {idx === 0 && !reduceMotion && (
                          <motion.span
                            animate={{ opacity: [0.6, 0, 0.6], scale: [1, 2.2, 1] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                            className="absolute inset-0 rounded-full bg-sky-400"
                          />
                        )}
                      </div>
                      {idx < project.updates.length - 1 && (
                        <div className="w-px h-16 bg-white/10 mt-1"></div>
                      )}
                    </div>
                    <div className="flex-1 pb-8">
                      <h3 className="font-semibold mb-1 flex items-center">
                        {update.title}
                        {isNew(update.createdAt) && <NewBadge />}
                      </h3>
                      <p className="text-white/50 mb-2 text-sm">{update.description}</p>
                      <p className="text-xs text-white/30">
                        {new Date(update.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </motion.div>
                ))
              ) : (
                <p className="text-white/50">No updates yet. Check back soon!</p>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* Messages Tab */}
        {activeTab === 'messages' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Project Messages</h2>
              <p className="text-xs text-white/40">Our team typically replies within one business day</p>
            </div>

            {/* A conversation, laid out like one.
                Every message used to be the same left-aligned block with a
                coloured edge, so telling your own words from the studio's
                meant reading the name above each. Sides and shape do that
                without anybody having to read anything. */}
            <div
              className="mb-8 max-h-[28rem] space-y-5 overflow-y-auto pr-1"
              ref={messagesScrollRef}
            >
              {project.messages.length > 0 ? (
                project.messages.map((message) => {
                  const fromTeam = message.isFromAdmin;
                  const files = readAttachments(message.attachments);
                  return (
                    <div
                      key={message.id}
                      className={`flex flex-col ${fromTeam ? 'items-start' : 'items-end'}`}
                    >
                      <div className="mb-1.5 flex items-center gap-2 px-1">
                        {fromTeam && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-sky-400 to-purple-500 text-[9px] font-bold text-black">
                            B
                          </span>
                        )}
                        <span className="text-xs font-semibold text-white/70">
                          {fromTeam ? message.user?.name || 'Bothmade' : 'You'}
                        </span>
                        <span className="text-[11px] text-white/25">
                          {new Date(message.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                          {' · '}
                          {new Date(message.createdAt).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <div
                        className={`flex w-full max-w-[85%] flex-col ${
                          fromTeam ? 'items-start' : 'items-end'
                        }`}
                      >
                        {message.content && message.content !== '(link attached)' && (
                          <p
                            className={`inline-block whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                              fromTeam
                                ? 'rounded-tl-md border border-white/10 bg-white/[0.06] text-white/80'
                                : 'rounded-tr-md border border-sky-400/25 bg-sky-400/[0.10] text-white/85'
                            }`}
                          >
                            <Linkify text={message.content} />
                          </p>
                        )}

                        {/* The link, given the room it deserves. This is how
                            a design, a contract, or a walkthrough arrives —
                            it should not look like a footnote. */}
                        {/* Bounded rather than filling the bubble's width: a
                            single card stretched the full 85% and floated free
                            of the message it belonged to. */}
                        <AttachmentList
                          attachments={files}
                          className={`w-full ${files.length > 1 ? 'max-w-2xl' : 'max-w-sm'} ${
                            message.content && message.content !== '(link attached)' ? 'mt-2.5' : ''
                          }`}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-white/12 px-5 py-8 text-center">
                  <p className="text-sm text-white/50">Nothing here yet.</p>
                  <p className="mt-1 text-xs text-white/30">
                    Anything you send lands with the team working on your project.
                  </p>
                </div>
              )}
            </div>

            <form onSubmit={handleSendMessage} className="space-y-3">
              <textarea
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder="Type your message..."
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent resize-none transition-colors"
                rows={4}
              />
              <AttachLink
                attachments={attachments}
                onChange={setAttachments}
                placeholder="Paste a link — a Google Doc, a Drive folder, anything we should see"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-white/25">
                  Share links rather than files — a link stays up to date when you change the document.
                </p>
                <motion.button
                  type="submit"
                  disabled={sendingMessage || (!messageContent.trim() && attachments.length === 0)}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className="rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-6 py-3 font-semibold text-black disabled:opacity-50 whitespace-nowrap"
                >
                  {sendingMessage ? 'Sending...' : 'Send Message'}
                </motion.button>
              </div>
              {messageError && <p className="text-sm text-red-300">{messageError}</p>}
            </form>
          </motion.div>
        )}

        {/* Onboarding Tab */}
        {activeTab === 'onboarding' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <OnboardingAnswers projectId={projectId} questions={questions} onSaved={loadOnboarding} />
          </motion.div>
        )}
        </div>
        </div>
      </div>
    </main>
  );
}
