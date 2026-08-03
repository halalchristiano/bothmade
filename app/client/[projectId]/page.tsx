'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { upload } from '@vercel/blob/client';
import {
  CheckCircle2,
  Circle,
  Download,
  Paperclip,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Rocket,
  ExternalLink,
  PartyPopper,
} from 'lucide-react';
import { ClientHeader } from '@/components/portal/ClientHeader';
import { GridBackdrop, CountUp } from '@/components/ui';

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

interface Project {
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
  estimatedCompletionDate: string | null;
  liveUrl: string | null;
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
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'messages' | 'onboarding'>('overview');
  const [messageContent, setMessageContent] = useState('');
  const [fileToAttach, setFileToAttach] = useState<File | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [payingBalance, setPayingBalance] = useState(false);
  const [payBalanceError, setPayBalanceError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const [summaryCopied, setSummaryCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    const storageKey = `bothmade_last_visit_${projectId}`;
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
    const storageKey = `bothmade_seen_messages_${projectId}`;
    if (seenMessageCountRef.current === null) {
      const stored = Number(localStorage.getItem(storageKey) || 0);
      seenMessageCountRef.current = stored;
    }
    if (activeTab === 'messages') {
      seenMessageCountRef.current = project.messages.length;
      localStorage.setItem(storageKey, String(project.messages.length));
      setUnreadCount(0);
    } else {
      setUnreadCount(Math.max(0, project.messages.length - (seenMessageCountRef.current || 0)));
    }
  }, [project, activeTab, projectId]);

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

  const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setMessageError('');
    if (file && file.size > MAX_ATTACHMENT_BYTES) {
      setMessageError('That file is too large to attach (25MB max) — try a smaller file or a link instead.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setFileToAttach(null);
      return;
    }
    setFileToAttach(file);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageContent.trim() && !fileToAttach) return;

    setSendingMessage(true);
    setMessageError('');
    try {
      let attachments: Array<{ name: string; url: string }> = [];
      if (fileToAttach) {
        const blob = await upload(fileToAttach.name, fileToAttach, {
          access: 'public',
          handleUploadUrl: '/api/client/upload',
        });
        attachments = [{ name: fileToAttach.name, url: blob.url }];
      }

      const response = await fetch(`/api/projects/${projectId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: messageContent || '(file attached)', attachments }),
      });

      if (response.ok) {
        setMessageContent('');
        setFileToAttach(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
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

  if (error || !project) {
    return (
      <main className="min-h-screen bg-[#05030a] text-white flex items-center justify-center px-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 max-w-md">
          <h1 className="text-2xl font-bold mb-4">We couldn&apos;t load this project</h1>
          <p className="text-white/50 mb-6">{error || 'Project not found'}</p>
          {/* A genuine auth failure already redirected to the sign-in page
              before we got here, so anything reaching this state is a
              transient load failure on a session that is still perfectly
              valid. Offering "Back to Login" told a signed-in client they'd
              been signed out and sent them to re-enter a password they
              didn't need. Retry first, then their own project list. */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20 transition-colors"
            >
              Try again
            </button>
            <Link href="/client/projects" className="text-sky-300 font-semibold hover:underline">
              Back to your projects
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const currentStage = STATUS_STAGES[Math.min(project.statusStage, 4)];
  const progressPct = ((Math.min(project.statusStage + 1, 5)) / 5) * 100;

  const handleCopySummary = () => {
    const latestUpdate = project.updates[0];
    const lines = [
      `${project.name} — status summary`,
      `Stage: ${currentStage} (${Math.min(project.statusStage + 1, 5)}/5)`,
      project.estimatedCompletionDate
        ? `Estimated target: ${new Date(project.estimatedCompletionDate).toLocaleDateString()}`
        : null,
      `Balance due: $${(project.balanceDue / 100).toLocaleString()}`,
      latestUpdate ? `Latest update: ${latestUpdate.title} (${new Date(latestUpdate.createdAt).toLocaleDateString()})` : null,
      '',
      `View live: ${typeof window !== 'undefined' ? `${window.location.origin}/status/${projectId}` : ''}`,
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    setSummaryCopied(true);
    setTimeout(() => setSummaryCopied(false), 2000);
  };

  const handleCopyShareLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/status/${projectId}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
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
            <div className="shrink-0 flex gap-2">
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
          {/* Tabs */}
          <div className="flex gap-1 mb-8 p-1 rounded-full border border-white/10 bg-white/5 w-fit">
            {(['overview', 'timeline', 'messages', 'onboarding'] as const).map((tab) => (
              <button
                key={tab}
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
                <span className="relative">{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
                {tab === 'messages' && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                    {unreadCount}
                  </span>
                )}
                {tab === 'timeline' && project.updates.some((u) => isNew(u.createdAt)) && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 border border-[#05030a]" />
                )}
                {tab === 'onboarding' && questions.some((q) => !q.response) && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-black text-[10px] font-bold">
                    {questions.filter((q) => !q.response).length}
                  </span>
                )}
              </button>
            ))}
          </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
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

                  {(project.deliverables.length > 0 || project.contractUrl) && (
                    <p className="text-xs text-white/35 mt-5">
                      Everything you need — deliverables and your signed agreement — is below.
                    </p>
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
                    <CountUp value={`$${(project.totalPrice / 100).toLocaleString()}`} />
                  </p>
                </div>

                {project.addOns.length > 0 && (
                  <div>
                    <h3 className="text-sm text-white/40 mb-1">Add-ons</h3>
                    <p className="text-lg font-semibold">
                      {project.addOns.map((addon) => addon.charAt(0).toUpperCase() + addon.slice(1)).join(', ')}
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
                  <CountUp value={`$${(project.amountPaid / 100).toLocaleString()}`} />
                </span>
              </div>
              <div className="flex justify-between text-sm mb-3">
                <span className="text-white/40">Balance Due</span>
                <span className={`font-medium ${project.balanceDue > 0 ? 'text-amber-300' : 'text-white/40'}`}>
                  ${(project.balanceDue / 100).toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 mb-6 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    // A $0 project (a comped build, a placeholder) divided
                    // to NaN and the bar rendered with width:"NaN%" —
                    // ignored by the browser, so it silently showed an empty
                    // bar on a project that is fully paid.
                    width: `${project.totalPrice > 0 ? Math.min(100, (project.amountPaid / project.totalPrice) * 100) : 100}%`,
                  }}
                  transition={{ duration: 1, ease: EASE, delay: 0.3 }}
                  className="bg-gradient-to-r from-emerald-400 to-sky-400 h-1.5 rounded-full"
                />
              </div>

              {project.balanceDue > 0 && (
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
                      {payingBalance ? 'Redirecting to checkout…' : `Pay Balance — $${(project.balanceDue / 100).toLocaleString()}`}
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
                        ${(payment.amount / 100).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white/40">No payments recorded yet.</p>
              )}
            </motion.div>

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

            {/* Deliverables */}
            {project.deliverables.length > 0 && (
              <motion.div variants={fadeUp} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
                <h2 className="text-xl font-bold mb-6">Deliverables</h2>
                <div className="space-y-3">
                  {project.deliverables.map((file) => (
                    <motion.a
                      key={file.id}
                      href={file.url}
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

            <div className="space-y-4 mb-8 max-h-96 overflow-y-auto">
              {project.messages.length > 0 ? (
                project.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`p-4 rounded-lg border-l-2 ${
                      message.isFromAdmin
                        ? 'bg-white/5 border-white/30'
                        : 'bg-sky-400/10 border-sky-400/50'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-semibold text-sm">
                        {message.isFromAdmin ? message.user?.name || 'Team' : 'You'}
                      </p>
                      <p className="text-xs text-white/30">
                        {new Date(message.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <p className="text-white/70 text-sm">{message.content}</p>
                    {message.attachments && message.attachments !== '[]' && (
                      <div className="mt-2 space-y-1">
                        {(() => {
                          try {
                            const files = JSON.parse(message.attachments) as Array<{ name: string; url: string }>;
                            return files.map((f, i) => (
                              <a
                                key={i}
                                href={f.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-sky-300 hover:underline"
                              >
                                <Paperclip size={11} /> {f.name}
                              </a>
                            ));
                          } catch {
                            return null;
                          }
                        })()}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-white/50">No messages yet. Start a conversation with the team!</p>
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
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  className="text-xs text-white/50 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-white/10 file:text-white file:text-xs"
                />
                <motion.button
                  type="submit"
                  disabled={sendingMessage || (!messageContent.trim() && !fileToAttach)}
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
            className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8"
          >
            <h2 className="text-xl font-bold mb-2">Onboarding</h2>
            <p className="text-white/50 text-sm mb-6">
              A few questions from the team to help kick your project off right.
            </p>

            {questions.length === 0 ? (
              <p className="text-white/50">Nothing to fill out yet — check back soon.</p>
            ) : (
              <div className="space-y-6">
                {questions.map((q) => {
                  const options = q.options.split(',').map((o) => o.trim()).filter(Boolean);
                  return (
                    <div key={q.id}>
                      <label className="block text-sm font-medium mb-2 text-white/80">
                        {q.question}
                        {q.response && <span className="ml-2 text-xs text-emerald-300">Answered</span>}
                      </label>
                      {q.type === 'textarea' ? (
                        <textarea
                          value={answers[q.id] || ''}
                          onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                          rows={3}
                          className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent resize-none transition-colors"
                        />
                      ) : q.type === 'select' ? (
                        <select
                          value={answers[q.id] || ''}
                          onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                          className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/15 text-white focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors"
                        >
                          <option value="" className="bg-[#05030a]">Select...</option>
                          {options.map((opt) => (
                            <option key={opt} value={opt} className="bg-[#05030a]">
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={answers[q.id] || ''}
                          onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                          className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors"
                        />
                      )}
                      <button
                        onClick={() => handleSubmitAnswer(q.id)}
                        disabled={savingAnswerId === q.id}
                        className="mt-2 text-sm rounded-lg border border-white/20 px-4 py-1.5 hover:bg-white/5 disabled:opacity-50 transition-colors"
                      >
                        {savingAnswerId === q.id ? 'Saving...' : 'Save Answer'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
        </div>
      </div>
    </main>
  );
}
