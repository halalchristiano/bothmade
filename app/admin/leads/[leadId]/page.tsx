'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_ACTIVITY_TYPES,
  LEAD_ACTIVITY_LABELS,
  PAIN_POINTS,
  painPointSentence,
  parseSalesPoints,
  type LeadStatus,
  type LeadActivityType,
  type PainPointKey,
} from '@/lib/leads';
import { SALES_TEMPLATES } from '@/lib/sales-templates';
import { findGlossaryTerms } from '@/lib/glossary';
import { buildCallScript, callScriptToText, painPointPitch } from '@/lib/call-script';
import { personalise, priceToTotal, type PlaybookEntry, type PricedItem } from '@/lib/playbook-seed';
import { OBJECTIONS } from '@/lib/objections';
import { CALL_OUTCOMES } from '@/lib/call-outcomes';
import { leadLocalTime } from '@/lib/local-time';
import { buildFollowUpDraft } from '@/lib/follow-up-emails';
import { LostReasonModal } from '@/components/admin/LostReasonModal';
import { EmailComposer } from '@/components/admin/EmailComposer';
import {
  Mail,
  Phone,
  Send,
  CheckCircle2,
  Tag,
  CalendarClock,
  User,
  Compass,
  DollarSign,
  StickyNote,
  AlertTriangle,
  MoreVertical,
  Trash2,
  MailX,
} from 'lucide-react';
import {
  ADD_ON_CATEGORIES,
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  PAIN_POINT_BRIEFS,
  buildSalesRecommendations,
  classifyWrittenPoint,
  inferPainPointsFromNotes,
  calculatePrice,
  customItemsTotal,
  depositAmount,
  dependentsOf,
  expandAddOnDependencies,
  formatCents,
  isIncludedInBase,
  withBaseIncludes,
  type AddOnCategory,
  type AddOnKey,
  type BaseService,
  type ClientType,
  type CustomItem,
  type TimelineKey,
} from '@/lib/pricing';

interface Activity {
  id: string;
  type: LeadActivityType;
  content: string;
  url: string | null;
  createdAt: string;
  createdBy: { name: string | null } | null;
}

interface LeadDetail {
  id: string;
  company: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  source: string | null;
  estimatedValue: number | null;
  painPoints: string;
  notes: string | null;
  hotLead: boolean;
  contractStatus: 'not_sent' | 'sent' | 'signed';
  lostReason: string | null;
  nextFollowUpAt: string | null;
  mockupRequested: boolean;
  mockupRequestedAt: string | null;
  mockupUrl: string | null;
  mockupDeliveredAt: string | null;
  agreementSignedAt: string | null;
  signedContractUrl?: string | null;
  agreementIp: string | null;
  qualNeed: string | null;
  qualAuthority: string | null;
  qualBudget: string | null;
  qualTiming: string | null;
  qualMotivation: string | null;
  qualifiedAt: string | null;
  coldEmailDraft: string | null;
  coldEmailSentAt: string | null;
  personalizedObservation: string | null;
  emailDeliveryFailedAt: string | null;
  emailDeliveryFailedReason: string | null;
  originalWebsite: string | null;
  salesNote: string | null;
  currentSiteAssessment: string | null;
  customPainPoints: string | null;
  essentialPoints: string | null;
  upsellPoints: string | null;
  estimateLowCents: number | null;
  estimateHighCents: number | null;
  assignedTo: { name: string | null } | null;
  activities: Activity[];
}

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const leadId = params.leadId as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [showObjections, setShowObjections] = useState(false);
  const [loggingOutcome, setLoggingOutcome] = useState<string | null>(null);
  const [outcomeNote, setOutcomeNote] = useState('');
  const [outcomeDate, setOutcomeDate] = useState('');
  const [savingOutcome, setSavingOutcome] = useState(false);
  // The drafted follow-up, shown after an outcome is logged. Editable — it's
  // a starting point, not something to fire off unread.
  const [followUp, setFollowUp] = useState<{ subject: string; body: string; why: string } | null>(null);
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const [followUpResult, setFollowUpResult] = useState<string | null>(null);
  // Recomputed on a timer so the lead's local time doesn't silently go stale
  // on a page left open between calls.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [playbook, setPlaybook] = useState<PlaybookEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [composingEmail, setComposingEmail] = useState(false);
  const [sendingColdDraft, setSendingColdDraft] = useState(false);
  const [coldDraftSent, setColdDraftSent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState(false);
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [notes, setNotes] = useState('');
  const [originalWebsite, setOriginalWebsite] = useState('');
  const [salesNote, setSalesNote] = useState('');
  const [painPoints, setPainPoints] = useState<PainPointKey[]>([]);

  const [qualNeed, setQualNeed] = useState('');
  const [qualAuthority, setQualAuthority] = useState('');
  const [qualBudget, setQualBudget] = useState('');
  const [qualTiming, setQualTiming] = useState('');
  const [qualMotivation, setQualMotivation] = useState('');
  const [savingQual, setSavingQual] = useState(false);

  const [activityType, setActivityType] = useState<LeadActivityType>('note');
  const [activityContent, setActivityContent] = useState('');
  const [activityUrl, setActivityUrl] = useState('');
  const [sendEmailNow, setSendEmailNow] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [loggingActivity, setLoggingActivity] = useState(false);
  const [activityMessage, setActivityMessage] = useState('');

  const [proposalService, setProposalServiceRaw] = useState<BaseService>('website');
  const [proposalAddOns, setProposalAddOns] = useState<AddOnKey[]>([]);

  const setProposalService = (next: BaseService) => {
    setProposalServiceRaw(next);
    setProposalAddOns((prev) => withBaseIncludes(next, prev));
  };
  const [proposalClientType, setProposalClientType] = useState<ClientType>('smb');
  const [proposalTimeline, setProposalTimeline] = useState<TimelineKey>('standard');
  // Ad-hoc items Evan adds beyond the fixed catalogue. draftLabel/draftPrice
  // hold the add-row inputs until "Add" commits them into customItems.
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  const [draftCustomLabel, setDraftCustomLabel] = useState('');
  const [draftCustomPrice, setDraftCustomPrice] = useState('');

  const addCustomItem = () => {
    const label = draftCustomLabel.trim();
    const dollars = parseFloat(draftCustomPrice);
    if (!label || !Number.isFinite(dollars) || dollars <= 0) return;
    setCustomItems((prev) => [...prev, { label, priceCents: Math.round(dollars * 100) }]);
    setDraftCustomLabel('');
    setDraftCustomPrice('');
  };

  const removeCustomItem = (index: number) => {
    setCustomItems((prev) => prev.filter((_, i) => i !== index));
  };
  const [paymentLinkUrl, setPaymentLinkUrl] = useState('');
  const [depositOnly, setDepositOnly] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [emailingLink, setEmailingLink] = useState(false);
  const [linkEmailStatus, setLinkEmailStatus] = useState('');
  const [downloadingContract, setDownloadingContract] = useState(false);
  const [proposalError, setProposalError] = useState('');
  const [convertingToProject, setConvertingToProject] = useState(false);

  const proposalBreakdown = calculatePrice({
    baseService: proposalService,
    addOns: proposalAddOns,
    clientType: proposalClientType,
    timeline: proposalTimeline,
  });

  const toggleProposalAddOn = (key: AddOnKey) => {
    if (isIncludedInBase(proposalService, key)) return;
    setProposalAddOns((prev) => {
      if (prev.includes(key)) {
        const toRemove = new Set([key, ...dependentsOf(key, prev)]);
        return prev.filter((a) => !toRemove.has(a));
      }
      return expandAddOnDependencies([...prev, key]);
    });
  };

  const inputClass =
    'w-full px-4 py-2 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors';

  const followUpInputRef = useRef<HTMLInputElement>(null);
  const openFollowUpPicker = () => {
    const el = followUpInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.click();
  };

  const load = async () => {
    try {
      const response = await fetch(`/api/admin/leads/${leadId}`);
      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }
      setLoadError(null);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        // Anything other than success used to leave `lead` null, and the
        // component renders a spinner whenever that's true — so a deleted
        // lead or a server error span forever with nothing to act on.
        setLoadError(
          response.status === 404
            ? "This lead no longer exists — it was probably deleted or re-imported."
            : data?.error || 'Could not load this lead. Try again in a moment.'
        );
        return;
      }
      if (data.success) {
        const l: LeadDetail = data.lead;
        setLead(l);
        setPlaybook(data.playbook ?? []);
        setCompany(l.company);
        setContactName(l.contactName || '');
        setEmail(l.email || '');
        setPhone(l.phone || '');
        setSource(l.source || '');
        setEstimatedValue(l.estimatedValue ? String(l.estimatedValue / 100) : '');
        setNotes(l.notes || '');
        setOriginalWebsite(l.originalWebsite || '');
        setSalesNote(l.salesNote || '');
        setPainPoints(
          l.painPoints
            .split(',')
            .filter(Boolean)
            .filter((p): p is PainPointKey => p in PAIN_POINTS)
        );
        setQualNeed(l.qualNeed || '');
        setQualAuthority(l.qualAuthority || '');
        setQualBudget(l.qualBudget || '');
        setQualTiming(l.qualTiming || '');
        setQualMotivation(l.qualMotivation || '');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const pendingFollowUp = (key: string) => {
    if (!lead?.email) return null;
    return buildFollowUpDraft(key, {
      company: lead.company,
      contactName: lead.contactName,
      senderName: lead.assignedTo?.name ?? null,
      essentials: parseSalesPoints(lead.essentialPoints),
      low: lead.estimateLowCents,
      high: lead.estimateHighCents,
    });
  };

  const sendFollowUp = async () => {
    if (!followUp) return;
    setSendingFollowUp(true);
    setFollowUpResult(null);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: followUp.subject, body: followUp.body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFollowUpResult(data.error || 'Could not send.');
        return;
      }
      setFollowUp(null);
      setFollowUpResult('Sent — it will be in your Sent folder.');
      load();
    } finally {
      setSendingFollowUp(false);
    }
  };

  const handleCallOutcome = async (key: string, needsDate: boolean) => {
    if (needsDate && !outcomeDate) return;
    setSavingOutcome(true);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/call-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome: key,
          note: outcomeNote,
          followUpAt: outcomeDate || undefined,
        }),
      });
      if (res.ok) {
        setLoggingOutcome(null);
        setOutcomeNote('');
        setOutcomeDate('');
        setFollowUpResult(null);
        // Offer the follow-up straight away — the moment right after the call
        // is the only one where it reliably gets sent.
        setFollowUp(pendingFollowUp(key));
        load();
      }
    } finally {
      setSavingOutcome(false);
    }
  };

  const togglePainPoint = (key: PainPointKey) => {
    setPainPoints((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          contactName,
          email,
          phone,
          source,
          estimatedValue: estimatedValue ? Math.round(Number(estimatedValue) * 100) : null,
          notes,
          originalWebsite: originalWebsite.trim() || null,
          salesNote: salesNote.trim() || null,
          painPoints,
        }),
      });
      setEditing(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const [showChecklistPains, setShowChecklistPains] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);

  const [pendingLostStatus, setPendingLostStatus] = useState(false);

  const handleStatusChange = async (status: LeadStatus) => {
    if (status === 'lost') {
      setPendingLostStatus(true);
      return;
    }
    await fetch(`/api/admin/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const [requestingMockup, setRequestingMockup] = useState(false);
  const [mockupLinkDraft, setMockupLinkDraft] = useState('');
  const [deliveringMockup, setDeliveringMockup] = useState(false);

  const handleRequestMockup = async () => {
    setRequestingMockup(true);
    try {
      await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockupRequested: true }),
      });
      load();
    } finally {
      setRequestingMockup(false);
    }
  };

  const handleDeliverMockup = async () => {
    if (!mockupLinkDraft.trim()) return;
    setDeliveringMockup(true);
    try {
      await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockupUrl: mockupLinkDraft.trim() }),
      });
      setMockupLinkDraft('');
      load();
    } finally {
      setDeliveringMockup(false);
    }
  };

  const handleSaveQualification = async () => {
    setSavingQual(true);
    try {
      await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qualNeed,
          qualAuthority,
          qualBudget,
          qualTiming,
          qualMotivation,
        }),
      });
      load();
    } finally {
      setSavingQual(false);
    }
  };

  const [confirmingDeleteLead, setConfirmingDeleteLead] = useState(false);
  const [deletingLead, setDeletingLead] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);

  const handleSendColdDraft = async () => {
    if (!lead || !confirm(`Send the prepared cold email to ${lead.company} now?`)) return;
    setSendingColdDraft(true);
    try {
      const res = await fetch('/api/admin/email/send-cold-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: [leadId] }),
      });
      if (res.ok) {
        setColdDraftSent(true);
        load();
      }
    } finally {
      setSendingColdDraft(false);
    }
  };

  const handleDeleteLead = async () => {
    setDeletingLead(true);
    try {
      const response = await fetch(`/api/admin/leads/${leadId}`, { method: 'DELETE' });
      if (response.ok) router.push('/admin/leads');
    } finally {
      setDeletingLead(false);
    }
  };

  const handleConfirmLost = async (reason: string) => {
    setPendingLostStatus(false);
    await fetch(`/api/admin/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'lost', lostReason: reason }),
    });
    load();
  };

  const handleToggleHot = async () => {
    if (!lead) return;
    await fetch(`/api/admin/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hotLead: !lead.hotLead }),
    });
    load();
  };

  const handleClearEmailFailure = async () => {
    await fetch(`/api/admin/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearEmailFailure: true }),
    });
    load();
  };

  const handleSetContractStatus = async (contractStatus: LeadDetail['contractStatus']) => {
    await fetch(`/api/admin/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractStatus }),
    });
    load();
  };

  const handleSetFollowUp = async (dateStr: string) => {
    await fetch(`/api/admin/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nextFollowUpAt: dateStr || null }),
    });
    load();
  };

  const [loopMessage, setLoopMessage] = useState('');
  const [loopUrgent, setLoopUrgent] = useState(false);
  const [loopSending, setLoopSending] = useState(false);
  const [loopStatus, setLoopStatus] = useState('');

  const handleLoopIn = async () => {
    if (!loopMessage.trim()) return;
    setLoopSending(true);
    setLoopStatus('');
    try {
      const response = await fetch('/api/admin/team-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `Re: ${lead?.company} — ${loopMessage.trim()}`,
          relatedLeadId: leadId,
          urgent: loopUrgent,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setLoopMessage('');
        setLoopUrgent(false);
        setLoopStatus('Sent to the team chat.');
      }
    } finally {
      setLoopSending(false);
    }
  };

  const handleLogActivity = async () => {
    if (!activityContent.trim()) return;
    setLoggingActivity(true);
    setActivityMessage('');
    try {
      const response = await fetch(`/api/admin/leads/${leadId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activityType,
          content: activityContent,
          url: activityUrl || undefined,
          sendEmailNow: activityType === 'email' && sendEmailNow,
          emailSubject,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setActivityContent('');
        setActivityUrl('');
        setEmailSubject('');
        setActivityMessage(data.emailSent ? 'Logged and email sent.' : 'Logged.');
        load();
      } else {
        setActivityMessage(data.error || 'Failed to log activity');
      }
    } finally {
      setLoggingActivity(false);
    }
  };

  const proposalSelection = {
    baseService: proposalService,
    addOns: proposalAddOns,
    clientType: proposalClientType,
    timeline: proposalTimeline,
    customItems,
  };

  const proposalCustomTotal = customItemsTotal(customItems);
  const proposalGrandTotal = proposalBreakdown.totalPrice + proposalCustomTotal;

  const handleCreatePaymentLink = async () => {
    setProposalError('');
    setCreatingLink(true);
    try {
      const response = await fetch(`/api/admin/leads/${leadId}/proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...proposalSelection, depositOnly }),
      });
      const data = await response.json();
      if (data.success) {
        setPaymentLinkUrl(data.signUrl);
        load();
      } else {
        setProposalError(data.error || 'Failed to prepare sign-and-pay link');
      }
    } finally {
      setCreatingLink(false);
    }
  };

  const handleEmailPaymentLink = async () => {
    setProposalError('');
    setLinkEmailStatus('');
    setEmailingLink(true);
    try {
      const response = await fetch(`/api/admin/leads/${leadId}/proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...proposalSelection, depositOnly, sendEmail: true }),
      });
      const data = await response.json();
      if (data.success) {
        setPaymentLinkUrl(data.signUrl);
        if (!data.hasEmail) {
          setLinkEmailStatus('Link created, but this lead has no email on file — add one to send it directly.');
        } else if (data.emailSent) {
          setLinkEmailStatus(`Sent to ${lead?.email}.`);
        } else {
          setLinkEmailStatus('Link created, but the email failed to send — copy it manually below.');
        }
        load();
      } else {
        setProposalError(data.error || 'Failed to prepare sign-and-pay link');
      }
    } finally {
      setEmailingLink(false);
    }
  };

  const handleDownloadContract = async () => {
    setProposalError('');
    setDownloadingContract(true);
    try {
      const response = await fetch(`/api/admin/leads/${leadId}/contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposalSelection),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setProposalError(data.error || 'Failed to generate contract');
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lead?.company.replace(/[^a-z0-9]/gi, '-') || 'contract'}-contract.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      load();
    } finally {
      setDownloadingContract(false);
    }
  };

  const handleConvertToProject = () => {
    if (!lead) return;
    const query = new URLSearchParams({
      company: lead.company,
      contactName: lead.contactName || '',
      clientEmail: lead.email || '',
      phone: lead.phone || '',
      baseService: proposalService,
      addOns: proposalAddOns.join(','),
      clientType: proposalClientType,
      timeline: proposalTimeline,
      leadId,
    });
    setConvertingToProject(true);
    router.push(`/admin/projects/new?${query.toString()}`);
  };

  if (!loading && loadError) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <AlertTriangle size={26} className="text-amber-400 mx-auto mb-3" />
        <p className="text-sm text-white/70 leading-relaxed">{loadError}</p>
        <div className="flex items-center justify-center gap-2 mt-5">
          <button
            onClick={() => {
              setLoading(true);
              load();
            }}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium hover:bg-white/5 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/admin/leads"
            className="rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
          >
            Back to Leads
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !lead) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/leads"
          className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm transition-colors"
        >
          ← Back to Leads
        </Link>
        <div className="flex items-center gap-2">
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              title="Call"
              className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-400/10 border border-amber-400/25 text-amber-300 hover:bg-amber-400/20 transition-colors"
            >
              <Phone size={15} />
            </a>
          )}
          {lead.email && lead.coldEmailDraft && !lead.coldEmailSentAt && !coldDraftSent && (
            <button
              onClick={handleSendColdDraft}
              disabled={sendingColdDraft}
              title="Send cold email"
              className="flex items-center justify-center w-9 h-9 rounded-full bg-emerald-400/10 border border-emerald-400/25 text-emerald-300 disabled:opacity-50 hover:bg-emerald-400/20 transition-colors"
            >
              <Send size={15} />
            </button>
          )}
          {(lead.coldEmailSentAt || coldDraftSent) && (
            <span title="Cold email sent" className="flex items-center justify-center w-9 h-9 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-300/70">
              <CheckCircle2 size={15} />
            </span>
          )}
          <button
            onClick={() => setComposingEmail(true)}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-gradient-to-r from-sky-400 to-purple-500 text-black hover:opacity-90 transition-opacity"
          >
            <Mail size={14} /> Compose email
          </button>

          <div className="relative">
            <button
              onClick={() => setActionsMenuOpen((v) => !v)}
              title="More actions"
              className={`flex items-center justify-center w-9 h-9 rounded-full border transition-colors ${
                actionsMenuOpen ? 'border-white/30 bg-white/10' : 'border-white/15 hover:bg-white/5'
              }`}
            >
              <MoreVertical size={15} />
            </button>
            {actionsMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setActionsMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-white/10 bg-[#0b0714] shadow-xl z-20 p-1.5">
                  {confirmingDeleteLead ? (
                    <div className="p-2">
                      <p className="text-xs text-white/50 mb-2">Delete {lead.company} permanently?</p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={handleDeleteLead}
                          disabled={deletingLead}
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-red-500/90 text-white text-xs font-semibold disabled:opacity-50 hover:bg-red-500 transition-colors"
                        >
                          {deletingLead ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setConfirmingDeleteLead(false)}
                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-white/15 text-xs hover:bg-white/5 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingDeleteLead(true)}
                      className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-sm text-red-300/80 hover:bg-red-400/10 hover:text-red-300 transition-colors"
                    >
                      <Trash2 size={14} /> Delete lead
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Post-call wrap-up — sits directly under the action bar because this is
          what the rep reaches for the second they hang up. */}
      <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5">
        <p className="text-sm font-bold text-white/85">Just got off the phone?</p>
        <p className="text-xs text-white/40 mt-0.5 mb-3.5">
          Tap what happened. It writes the note, moves the status and books the next follow-up in one go.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CALL_OUTCOMES.map((o) => {
            const active = loggingOutcome === o.key;
            const tone =
              o.tone === 'good'
                ? 'border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-100 hover:bg-emerald-400/15'
                : o.tone === 'bad'
                  ? 'border-red-400/25 bg-red-400/[0.06] text-red-100 hover:bg-red-400/15'
                  : 'border-white/12 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]';
            return (
              <button
                key={o.key}
                onClick={() => {
                  setLoggingOutcome(active ? null : o.key);
                  setOutcomeNote('');
                  setOutcomeDate('');
                }}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${tone} ${
                  active ? 'ring-2 ring-sky-400/60' : ''
                }`}
              >
                <span className="block text-xs font-bold leading-snug">{o.label}</span>
                <span className="block text-[10px] text-white/40 leading-snug mt-0.5">{o.hint}</span>
              </button>
            );
          })}
        </div>

        {followUpResult && (
          <p className="mt-3 text-xs text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-2">
            {followUpResult}
          </p>
        )}

        {followUp && (
          <div className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-3.5">
            <p className="text-sm font-bold text-emerald-100">Send the follow-up now</p>
            <p className="text-xs text-emerald-200/60 mt-0.5 mb-3 leading-relaxed">{followUp.why}</p>

            <label className="block text-[11px] uppercase tracking-wide text-emerald-300/70 mb-1.5">Subject</label>
            <input
              value={followUp.subject}
              onChange={(e) => setFollowUp({ ...followUp, subject: e.target.value })}
              className={`${inputClass} text-sm`}
            />

            <label className="block text-[11px] uppercase tracking-wide text-emerald-300/70 mt-3 mb-1.5">
              Message — read it before you send, and change anything that isn't true
            </label>
            <textarea
              value={followUp.body}
              onChange={(e) => setFollowUp({ ...followUp, body: e.target.value })}
              rows={12}
              className={`${inputClass} text-sm resize-y font-normal`}
            />

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setFollowUp(null)}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                Not now
              </button>
              <button
                onClick={sendFollowUp}
                disabled={sendingFollowUp}
                className="flex-1 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 text-sm font-semibold text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {sendingFollowUp ? 'Sending...' : `Send it to ${lead.email}`}
              </button>
            </div>
          </div>
        )}

        {loggingOutcome && (() => {
          const o = CALL_OUTCOMES.find((x) => x.key === loggingOutcome)!;
          const needsDate = !!o.askForDate;
          return (
            <div className="mt-3 rounded-xl border border-sky-400/25 bg-sky-400/[0.06] p-3.5">
              <textarea
                value={outcomeNote}
                onChange={(e) => setOutcomeNote(e.target.value)}
                placeholder="Anything worth remembering? What they said, what they care about, who to ask for next time..."
                rows={2}
                className={`${inputClass} resize-none text-sm`}
              />
              <div className="mt-2.5">
                <label className="block text-[11px] uppercase tracking-wide text-sky-300/70 mb-1.5">
                  {needsDate ? 'When? (required)' : 'Next follow-up'}
                </label>
                <input
                  type="date"
                  value={outcomeDate}
                  onChange={(e) => setOutcomeDate(e.target.value)}
                  className={`${inputClass} text-sm`}
                />
                {!needsDate && (
                  <p className="text-[11px] text-white/35 mt-1">
                    {o.followUpDays !== null
                      ? `Leave blank and it'll set one for ${o.followUpDays} days' time.`
                      : "Leave blank and no follow-up is set."}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleCallOutcome(o.key, needsDate)}
                disabled={savingOutcome || (needsDate && !outcomeDate)}
                className="w-full mt-3 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 text-sm font-semibold text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {savingOutcome ? 'Saving...' : `Log it — ${o.label.toLowerCase()}`}
              </button>
            </div>
          );
        })()}
      </div>

      {composingEmail && (
        <EmailComposer
          recipientEmail={lead.email || ''}
          recipientName={lead.contactName || undefined}
          company={lead.company}
          defaultLoomUrl={lead.mockupUrl}
          defaultPainPoint={painPointSentence(lead.painPoints)}
          defaultObservation={lead.personalizedObservation}
          leadId={leadId}
          onClose={() => setComposingEmail(false)}
        />
      )}

      {(() => {
        // Hand-written content from the research CSV always wins over the
        // generic heuristics — a human who actually looked at the business
        // beats a lookup table. The heuristics stay as the fallback (and, for
        // pain points, as extra call scripts underneath).
        const writtenPains = parseSalesPoints(lead.customPainPoints);
        const writtenNeeds = parseSalesPoints(lead.essentialPoints);
        const writtenUpsell = parseSalesPoints(lead.upsellPoints);

        // Guessing at pain points from notes exists to fill a vacuum. Once
        // someone has written five bespoke ones for this business, keyword
        // matching has nothing to add and everything to get wrong.
        const inferred = writtenPains.length > 0 ? [] : inferPainPointsFromNotes(lead.notes, painPoints);
        const allPains = [...painPoints, ...inferred];
        const recs = buildSalesRecommendations(allPains);
        const base = BASE_SERVICES[recs.baseService];

        // Only define the words that actually appear in THIS lead's brief —
        // a fixed glossary of everything would be noise on a phone.
        const glossary = findGlossaryTerms(
          lead.currentSiteAssessment,
          lead.salesNote,
          lead.customPainPoints,
          lead.essentialPoints,
          lead.upsellPoints
        );

        // A checklist pain point already covered by a bespoke one would show
        // the same problem twice with the same script attached.
        const coveredByWritten = new Set(
          writtenPains.map((p) => classifyWrittenPoint(p.point, p.explanation)).filter(Boolean)
        );
        const checklistPains = allPains.filter((k) => !coveredByWritten.has(k));

        const playbookMap = new Map(playbook.map((e) => [e.slug, e]));
        const useWrittenNeeds = writtenNeeds.length > 0;
        const useWrittenUpsell = writtenUpsell.length > 0;
        const hasRange = lead.estimateLowCents !== null || lead.estimateHighCents !== null;
        const anything =
          writtenPains.length > 0 || allPains.length > 0 || useWrittenNeeds || useWrittenUpsell || hasRange;

        const low = lead.estimateLowCents ?? recs.coreTotal;
        const high = lead.estimateHighCents ?? recs.maxTotal;

        // Essentials add up to the low figure, upsells make up the rest to the
        // high figure, so the itemised column always agrees with the headline.
        const pricedNeeds = priceToTotal(writtenNeeds, playbookMap, hasRange ? low : null);
        const pricedUpsell = priceToTotal(writtenUpsell, playbookMap, hasRange ? Math.max(0, high - low) : null);

        const callScript = buildCallScript({
          company: lead.company,
          contactName: lead.contactName,
          repName: lead.assignedTo?.name ?? null,
          writtenPains:
            writtenPains.length > 0
              ? writtenPains
              : checklistPains.map((k) => ({
                  point: PAIN_POINTS[k],
                  explanation: PAIN_POINT_BRIEFS[k]?.problem ?? null,
                })),
          checklistPainKeys: checklistPains,
          essentials: useWrittenNeeds
            ? writtenNeeds
            : recs.needs.map((n) => ({ point: n.label, explanation: n.description })),
          upsells: useWrittenUpsell
            ? writtenUpsell
            : recs.upsell.map((n) => ({ point: n.label, explanation: n.description })),
          low,
          high,
        });

        const Step = ({ n, title, hint }: { n: number; title: string; hint: string }) => (
          <div className="flex items-start gap-3 mb-3">
            <span className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-[11px] font-bold text-white/70">
              {n}
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white/90">{title}</h3>
              <p className="text-xs text-white/40 mt-0.5">{hint}</p>
            </div>
          </div>
        );

        // A priced line item: their bespoke wording, then everything a rep
        // needs if the customer pushes back on it — cost, what it actually
        // is, the words to sell it, and why the price is fair.
        const PricedCard = ({ i, tone }: { i: PricedItem; tone: 'green' | 'amber' }) => {
          const c =
            tone === 'green'
              ? { box: 'border-emerald-400/20 bg-emerald-400/[0.05]', head: 'text-emerald-100', price: 'text-emerald-300' }
              : { box: 'border-amber-400/20 bg-amber-400/[0.05]', head: 'text-amber-100', price: 'text-amber-300' };
          return (
            <div className={`rounded-xl border p-3.5 min-w-0 ${c.box}`}>
              <div className="flex items-start justify-between gap-3">
                <p className={`text-sm font-bold break-words ${c.head}`}>{i.point}</p>
                {i.priceCents !== null && (
                  <p className={`text-sm font-bold whitespace-nowrap ${c.price}`}>
                    {tone === 'amber' ? '+' : ''}
                    {formatCents(i.priceCents)}
                  </p>
                )}
              </div>
              {i.explanation && (
                <p className="text-xs text-white/60 leading-relaxed mt-1.5 break-words">{i.explanation}</p>
              )}
              {i.entry && (
                <>
                  <div className="mt-2.5 rounded-lg bg-white/[0.03] px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-white/40 font-semibold mb-1">
                      In plain English
                    </p>
                    <p className="text-xs text-white/70 leading-relaxed break-words">{i.entry.whatItIs}</p>
                  </div>
                  {i.entry.benefit && (
                    <div className="mt-2 rounded-lg bg-white/[0.03] px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-sky-300/80 font-semibold mb-1">
                        How it helps {lead.company}
                      </p>
                      <p className="text-xs text-white/70 leading-relaxed break-words">
                        {personalise(i.entry.benefit, lead.company)}
                      </p>
                    </div>
                  )}
                  <div className="mt-2 rounded-lg border-l-2 border-emerald-400/50 bg-white/[0.03] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-emerald-300/80 font-semibold mb-1">
                      Say something like this
                    </p>
                    <p className="text-xs text-white/80 italic leading-relaxed break-words">"{i.entry.pitch}"</p>
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed mt-2.5 break-words">
                    <span className="text-amber-300/90 font-semibold">If they ask why it costs that: </span>
                    {i.entry.justification}
                  </p>
                  {i.entry.objection && (
                    <p className="text-xs text-white/45 leading-relaxed mt-2 break-words">
                      <span className="text-red-300/80 font-semibold">If they push back: </span>
                      {i.entry.objection}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        };

        return (
          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-4 sm:p-6 min-w-0">
            <div className="mb-5">
              <h2 className="text-base font-bold">Your brief for {lead.company}</h2>
              <p className="text-xs text-white/45 mt-1 leading-relaxed">
                Everything below is about <em>this</em> business. Read it top to bottom before you call — it goes
                problem → what to sell → what it costs.
              </p>
            </div>

            {(lead.originalWebsite || lead.mockupUrl) && (
              <div className="flex flex-wrap gap-2 mb-5">
                {lead.originalWebsite && (
                  <a
                    href={lead.originalWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-400/10 px-3.5 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-400/20 transition-colors"
                  >
                    <Compass size={13} /> Open their current site
                  </a>
                )}
                {lead.mockupUrl && (
                  <a
                    href={lead.mockupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-400/10 px-3.5 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-400/20 transition-colors"
                  >
                    <CheckCircle2 size={13} /> Open the mockup we sent
                  </a>
                )}
              </div>
            )}

            {lead.currentSiteAssessment && (
              <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/40 mb-1.5 font-semibold">
                  <Compass size={12} /> What their site does today
                </p>
                <p className="text-sm text-white/70 leading-relaxed break-words">{lead.currentSiteAssessment}</p>
              </div>
            )}

            {lead.salesNote && (
              <div className="mb-5 rounded-xl border border-sky-400/25 bg-sky-400/[0.08] p-4">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-sky-300 mb-1.5 font-semibold">
                  <StickyNote size={12} /> Read this first — note for you
                </p>
                <p className="text-sm text-sky-50/90 leading-relaxed whitespace-pre-wrap break-words">{lead.salesNote}</p>
              </div>
            )}

            {anything && (
              <div className="mb-6 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] overflow-hidden">
                <div className="flex items-start justify-between gap-3 p-4">
                  <button onClick={() => setShowScript((v) => !v)} className="min-w-0 text-left">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-100">
                      <Phone size={14} /> Your call script
                    </span>
                    <span className="block text-xs text-emerald-200/60 mt-0.5">
                      The whole call, written out in order. Green is what you say — grey is for you, never read it
                      out.
                    </span>
                  </button>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <button
                      onClick={() => setShowScript((v) => !v)}
                      className="text-xs font-semibold text-emerald-300 whitespace-nowrap"
                    >
                      {showScript ? 'Hide' : 'Open'}
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(callScriptToText(callScript, lead.company));
                        setScriptCopied(true);
                        setTimeout(() => setScriptCopied(false), 2000);
                      }}
                      className="text-[11px] text-emerald-200/60 hover:text-emerald-200 whitespace-nowrap transition-colors"
                    >
                      {scriptCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                {showScript && (
                  <div className="px-4 pb-4 space-y-3">
                    {callScript.map((block, i) => (
                      <div
                        key={i}
                        className={`rounded-lg px-3.5 py-3 border-l-2 ${
                          block.kind === 'spoken'
                            ? 'border-emerald-400/60 bg-white/[0.04]'
                            : 'border-white/20 bg-white/[0.02]'
                        }`}
                      >
                        <p
                          className={`text-[10px] uppercase tracking-wide font-semibold mb-1.5 ${
                            block.kind === 'spoken' ? 'text-emerald-300/80' : 'text-white/35'
                          }`}
                        >
                          {block.heading}
                          {block.kind === 'guidance' && ' — for you, don\u2019t read out'}
                        </p>
                        {block.lines.map((line, j) => (
                          <p
                            key={j}
                            className={`text-xs leading-relaxed break-words ${
                              block.kind === 'spoken' ? 'text-white/85 italic' : 'text-white/50'
                            } ${j > 0 ? 'mt-1.5' : ''}`}
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {anything && (
              <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
                <button
                  onClick={() => setShowObjections((v) => !v)}
                  className="w-full flex items-start justify-between gap-3 p-4 text-left"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-white/85">
                      <AlertTriangle size={14} /> When they try to end the call
                    </span>
                    <span className="block text-xs text-white/40 mt-0.5">
                      The {OBJECTIONS.length} things people say to get off the phone, what each one really means,
                      and what to say back.
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-sky-300">
                    {showObjections ? 'Hide' : 'Open'}
                  </span>
                </button>
                {showObjections && (
                  <div className="px-4 pb-4 space-y-3">
                    {OBJECTIONS.map((o) => (
                      <div key={o.slug} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3.5 min-w-0">
                        <p className="text-sm font-bold text-white/85 break-words">{o.trigger}</p>
                        <p className="text-xs text-white/45 leading-relaxed mt-1.5 break-words">
                          <span className="text-amber-300/90 font-semibold">What it usually means: </span>
                          {o.meaning}
                        </p>
                        <div className="mt-2.5 rounded-lg border-l-2 border-emerald-400/50 bg-white/[0.03] px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-emerald-300/80 font-semibold mb-1">
                            Say this
                          </p>
                          <p className="text-xs text-white/80 italic leading-relaxed break-words">"{o.response}"</p>
                        </div>
                        <p className="text-xs text-white/45 leading-relaxed mt-2 break-words">
                          <span className="text-sky-300/80 font-semibold">Then: </span>
                          {o.thenWhat}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!anything ? (
              <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-200 mb-1">
                  <AlertTriangle size={14} /> Nothing to brief you on yet
                </p>
                <p className="text-xs text-amber-100/70 leading-relaxed">
                  Nobody has recorded what's wrong with this business, so there's nothing to recommend or price.
                  Hit <strong>Edit</strong> on the card below, tick everything you can see wrong under "What's
                  wrong with their current setup?", and save — this brief writes itself from those boxes.
                </p>
              </div>
            ) : (
              <>
                {/* ---- Step 1: their problems ---- */}
                <Step
                  n={1}
                  title="What's wrong with their business right now"
                  hint="Their problems, in plain English. Open the call with these — not with what we sell."
                />
                <div className="space-y-2.5 mb-6">
                  {writtenPains.map((item, i) => {
                    // Their bespoke wording stays the headline and the body;
                    // the matched brief only adds the two things the CSV
                    // can't give — the money angle and a line to say.
                    const matched = classifyWrittenPoint(item.point, item.explanation);
                    const brief = matched ? PAIN_POINT_BRIEFS[matched] : null;
                    return (
                      <div key={`w${i}`} className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-3.5 min-w-0">
                        <p className="text-sm font-bold text-red-200 break-words">{item.point}</p>
                        {item.explanation && (
                          <p className="text-xs text-white/60 leading-relaxed mt-1.5 break-words">
                            {item.explanation}
                          </p>
                        )}
                        {brief && (
                          <p className="text-xs text-white/50 leading-relaxed mt-2 break-words">
                            <span className="text-amber-300/90 font-semibold">Why they should care: </span>
                            {brief.costsThem}
                          </p>
                        )}
                        <div className="mt-2.5 rounded-lg border-l-2 border-emerald-400/50 bg-white/[0.03] px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-emerald-300/80 font-semibold mb-1">
                            Say something like this
                          </p>
                          <p className="text-xs text-white/80 italic leading-relaxed break-words">
                            "{painPointPitch(item, lead.company)}"
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {checklistPains.length > 0 && writtenPains.length > 0 && (
                    <button
                      onClick={() => setShowChecklistPains((v) => !v)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left text-xs font-semibold text-white/55 hover:bg-white/[0.06] transition-colors"
                    >
                      {showChecklistPains ? 'Hide' : 'Show'} {checklistPains.length} more from the checklist — each with a
                      line you can say out loud
                    </button>
                  )}

                  {checklistPains.length > 0 && (writtenPains.length === 0 || showChecklistPains) && (
                    <>
                      {checklistPains.map((key) => {
                        const brief = PAIN_POINT_BRIEFS[key];
                        if (!brief) return null;
                        const fromNotes = inferred.includes(key);
                        return (
                          <div key={key} className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-3.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              <p className="text-sm font-bold text-red-200">{PAIN_POINTS[key]}</p>
                              {fromNotes && (
                                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/50">
                                  spotted in the notes — double-check
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-white/60 leading-relaxed mb-2 break-words">{brief.problem}</p>
                            <p className="text-xs text-white/50 leading-relaxed mb-2.5 break-words">
                              <span className="text-amber-300/90 font-semibold">Why they should care: </span>
                              {brief.costsThem}
                            </p>
                            <div className="rounded-lg border-l-2 border-emerald-400/50 bg-white/[0.03] px-3 py-2">
                              <p className="text-[10px] uppercase tracking-wide text-emerald-300/80 font-semibold mb-1">
                                Say something like this
                              </p>
                              <p className="text-xs text-white/80 italic leading-relaxed break-words">
                                "{brief.sayThis}"
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>

                {/* ---- Step 2: the core sell ---- */}
                <Step
                  n={2}
                  title="What they definitely need"
                  hint="This is the actual deal. Without these the problems above aren't fixed — don't discount it away."
                />
                <div className="space-y-2.5 mb-3">
                  {useWrittenNeeds ? (
                    pricedNeeds.map((item, i) => <PricedCard key={i} i={item} tone="green" />)
                  ) : (
                    <>
                      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] p-3.5 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <div className="min-w-0">
                            <span className="inline-block rounded bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200 mb-1.5">
                              The main build
                            </span>
                            <p className="text-sm font-bold text-emerald-100 break-words">{base.label}</p>
                          </div>
                          <p className="text-sm font-bold text-emerald-300 whitespace-nowrap">
                            {formatCents(base.price)}
                          </p>
                        </div>
                        <p className="text-xs text-white/60 leading-relaxed mb-1.5 break-words">{base.description}</p>
                        <p className="text-xs text-emerald-200/70 leading-relaxed break-words">
                          <span className="font-semibold">Why this one: </span>
                          {recs.baseReason}
                        </p>
                      </div>
                      {recs.needs.map((item) => (
                        <div
                          key={item.key}
                          className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-3.5 min-w-0"
                        >
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <p className="text-sm font-bold text-emerald-100 break-words">{item.label}</p>
                            <p className="text-sm font-bold text-emerald-300 whitespace-nowrap">
                              {formatCents(item.price)}
                            </p>
                          </div>
                          <p className="text-xs text-white/60 leading-relaxed mb-1.5 break-words">
                            {item.description}
                          </p>
                          <p className="text-xs text-emerald-200/70 leading-relaxed break-words">
                            <span className="font-semibold">Needed because: </span>
                            {item.becauseOf.join(', ').toLowerCase()}
                          </p>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* ---- Step 3: upsells ---- */}
                {(useWrittenUpsell || recs.upsell.length > 0) && (
                  <>
                    <Step
                      n={3}
                      title="Extras you can add on"
                      hint="Only raise these once they've agreed to the main build. Too early and the price just looks scary."
                    />
                    <div className="space-y-2.5 mb-3">
                      {useWrittenUpsell
                        ? pricedUpsell.map((item, i) => <PricedCard key={i} i={item} tone="amber" />)
                        : recs.upsell.map((item) => (
                            <div
                              key={item.key}
                              className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3.5 min-w-0"
                            >
                              <div className="flex items-start justify-between gap-3 mb-1">
                                <p className="text-sm font-bold text-amber-100 break-words">{item.label}</p>
                                <p className="text-sm font-bold text-amber-300 whitespace-nowrap">
                                  +{formatCents(item.price)}
                                </p>
                              </div>
                              <p className="text-xs text-white/60 leading-relaxed mb-1.5 break-words">
                                {item.description}
                              </p>
                              <p className="text-xs text-amber-200/70 leading-relaxed break-words">
                                <span className="font-semibold">Worth pitching because: </span>
                                {item.becauseOf.join(', ').toLowerCase()}
                              </p>
                            </div>
                          ))}
                    </div>
                  </>
                )}

                {/* ---- Step 4: the money ---- */}
                <Step
                  n={4}
                  title="What to quote"
                  hint="Say the lower number first. The higher one is only if they take every extra."
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3.5 min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-emerald-300/80 font-semibold mb-1">
                      Just what they need
                    </p>
                    <p className="text-lg font-bold text-emerald-300 break-words">{formatCents(low)}</p>
                    <p className="text-[11px] text-emerald-200/60 mt-1 leading-snug">
                      {formatCents(depositAmount(low))} up front (50%), rest on delivery
                    </p>
                  </div>
                  <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.08] px-4 py-3.5 min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-amber-300/80 font-semibold mb-1">
                      If they take everything
                    </p>
                    <p className="text-lg font-bold text-amber-300 break-words">{formatCents(high)}</p>
                    <p className="text-[11px] text-amber-200/60 mt-1 leading-snug">Core plus every extra above</p>
                  </div>
                </div>
                {glossary.length > 0 && (
                  <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <button
                      onClick={() => setShowGlossary((v) => !v)}
                      className="w-full flex items-center justify-between gap-3 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-white/85">
                          Words in this brief, explained
                        </span>
                        <span className="block text-xs text-white/40 mt-0.5">
                          {glossary.length} term{glossary.length === 1 ? '' : 's'} used above — tap if you're not
                          100% sure what one means
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-sky-300">
                        {showGlossary ? 'Hide' : 'Show'}
                      </span>
                    </button>
                    {showGlossary && (
                      <div className="mt-3 space-y-3">
                        {glossary.map((g) => (
                          <div key={g.term} className="border-t border-white/[0.06] pt-3">
                            <p className="text-sm font-bold text-sky-200">{g.term}</p>
                            <p className="text-xs text-white/60 leading-relaxed mt-1 break-words">{g.plain}</p>
                            {g.sayIt && (
                              <p className="text-xs text-white/45 leading-relaxed mt-1.5 break-words">
                                <span className="text-emerald-300/80 font-semibold">If they ask: </span>"{g.sayIt}"
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!hasRange && (
                  <p className="text-[11px] text-white/30 leading-relaxed mt-3">
                    These are our standard list prices, added up from the items above. To build a real quote with
                    discounts, timelines or a payment link, use the proposal builder further down this page.
                  </p>
                )}
              </>
            )}
          </div>
        );
      })()}

      <div className="grid lg:grid-cols-3 gap-6 mt-4">
        {/* LEFT: Lead info */}
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6">
            <div className="flex items-start gap-3.5 mb-5">
              <span className="shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-sky-400/25 to-purple-500/25 border border-white/10 text-lg font-bold text-white/90">
                {lead.company.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2 min-w-0">
                  {/* break-words, not truncate — a long company name must wrap
                      rather than force the row wider than the phone screen. */}
                  <h1 className="text-xl font-bold min-w-0 break-words">{lead.company}</h1>
                  <button
                    onClick={handleToggleHot}
                    title={lead.hotLead ? 'Unmark as hot' : 'Mark as hot lead'}
                    className={`shrink-0 text-base leading-none transition-colors ${lead.hotLead ? 'text-amber-400' : 'text-white/20 hover:text-white/50'}`}
                  >
                    ★
                  </button>
                </div>
                {lead.contactName && <p className="text-sm text-white/40 break-words mt-0.5">{lead.contactName}</p>}
              </div>
              <button
                onClick={() => setEditing(!editing)}
                className="shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full border border-white/15 hover:bg-white/5 transition-colors"
              >
                {editing ? 'Cancel' : 'Edit'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="min-w-0">
                <label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-purple-300/70 mb-1.5">
                  <Tag size={11} /> Status
                </label>
                <select
                  value={lead.status}
                  onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
                  className={`${inputClass} w-full min-w-0 border-purple-400/20 focus:ring-purple-400/50`}
                >
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s} className="bg-[#05030a]">
                      {LEAD_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 relative">
                <label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-sky-300/70 mb-1.5">
                  <CalendarClock size={11} /> Follow-up
                </label>
                <button
                  type="button"
                  onClick={openFollowUpPicker}
                  className={`${inputClass} w-full min-w-0 flex items-center justify-between gap-1 border-sky-400/20 hover:border-sky-400/40 text-left`}
                >
                  <span className={`truncate ${lead.nextFollowUpAt ? '' : 'text-white/30'}`}>
                    {lead.nextFollowUpAt
                      ? new Date(`${lead.nextFollowUpAt.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'Set a date'}
                  </span>
                  <CalendarClock size={13} className="shrink-0 text-sky-300/60" />
                </button>
                <input
                  ref={followUpInputRef}
                  type="date"
                  defaultValue={lead.nextFollowUpAt ? lead.nextFollowUpAt.slice(0, 10) : ''}
                  onChange={(e) => handleSetFollowUp(e.target.value)}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </div>
            </div>

            {lead.emailDeliveryFailedAt && (
              <div className="mb-4 rounded-lg bg-red-400/10 border border-red-400/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-red-300 mb-0.5">
                      <MailX size={12} /> Email didn't send — call instead
                    </p>
                    <p className="text-sm text-red-200/80">
                      {lead.emailDeliveryFailedReason || "The address may be invalid or no longer active."}
                    </p>
                  </div>
                  <button
                    onClick={handleClearEmailFailure}
                    className="shrink-0 text-xs text-red-300/60 hover:text-red-200 transition-colors whitespace-nowrap"
                  >
                    Mark resolved
                  </button>
                </div>
              </div>
            )}

            {lead.lostReason && (
              <div className="mb-4 rounded-lg bg-red-400/10 border border-red-400/20 p-3">
                <p className="text-xs text-red-300/70 mb-0.5">Lost reason</p>
                <p className="text-sm text-red-200">{lead.lostReason}</p>
              </div>
            )}

            {editing ? (
              <div className="space-y-3">
                <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" className={inputClass} />
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" className={inputClass} />
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inputClass} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={inputClass} />
                <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source" className={inputClass} />
                <input
                  value={estimatedValue}
                  onChange={(e) => setEstimatedValue(e.target.value)}
                  placeholder="Estimated value (USD)"
                  type="number"
                  className={inputClass}
                />
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Quick notes..."
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
                <input
                  value={originalWebsite}
                  onChange={(e) => setOriginalWebsite(e.target.value)}
                  placeholder="Their existing website (https://...)"
                  className={inputClass}
                />
                <textarea
                  value={salesNote}
                  onChange={(e) => setSalesNote(e.target.value)}
                  placeholder="Note for Evan — strategy, what to lead with, etc."
                  rows={2}
                  className={`${inputClass} resize-none`}
                />

                <div>
                  <p className="text-xs text-white/40 mb-2">What's wrong with their current setup?</p>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {(Object.entries(PAIN_POINTS) as [PainPointKey, string][]).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={painPoints.includes(key)}
                          onChange={() => togglePainPoint(key)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            ) : (
              <div className="text-sm">
                <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-sky-400/10 text-sky-300 shrink-0">
                      <User size={14} />
                    </span>
                    <span className={lead.contactName ? '' : 'text-white/30 italic'}>
                      {lead.contactName || 'No contact name'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-sky-400/10 text-sky-300 shrink-0">
                      <Mail size={14} />
                    </span>
                    {lead.email ? (
                      <a href={`mailto:${lead.email}`} className="hover:text-sky-300 transition-colors min-w-0 break-all">
                        {lead.email}
                      </a>
                    ) : (
                      <span className="text-amber-300/80 italic">No email — call instead</span>
                    )}
                  </div>
                  <div className="flex items-start gap-3 px-3 py-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-400/10 text-amber-300 shrink-0">
                      <Phone size={14} />
                    </span>
                    <div className="min-w-0">
                      {lead.phone ? (
                        <a href={`tel:${lead.phone}`} className="hover:text-amber-300 transition-colors break-all">
                          {lead.phone}
                        </a>
                      ) : (
                        <span className="text-white/30 italic">No phone on file</span>
                      )}
                      {(() => {
                        const lt = leadLocalTime(lead.phone, new Date(nowTick));
                        if (!lt) return null;
                        const c =
                          lt.callability === 'good'
                            ? 'text-emerald-300'
                            : lt.callability === 'okay'
                              ? 'text-amber-300'
                              : 'text-red-300';
                        return (
                          <p className="text-xs mt-1 leading-relaxed">
                            {lt.time && <span className={`font-semibold ${c}`}>{lt.time} their time — </span>}
                            <span className="text-white/40">{lt.advice}</span>
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-400/10 text-purple-300 shrink-0">
                      <Compass size={14} />
                    </span>
                    <span className={lead.source ? '' : 'text-white/30 italic'}>{lead.source || 'Unknown source'}</span>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-400/10 text-emerald-300 shrink-0">
                      <DollarSign size={14} />
                    </span>
                    <span className={lead.estimatedValue ? 'font-semibold text-emerald-300' : 'text-white/30 italic'}>
                      {lead.estimatedValue ? formatCents(lead.estimatedValue) : 'No estimate set'}
                    </span>
                  </div>
                </div>

                {lead.notes && (
                  <div className="mt-4">
                    <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-white/35 mb-1.5">
                      <StickyNote size={11} /> Notes
                    </p>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.06]">
                      {lead.notes.split(/\n{2,}|\s+\|\s+/).map((block, i) => {
                        const match = block.match(/^([A-Za-z][A-Za-z \/()\-]{1,34}):\s*([\s\S]*)$/);
                        return (
                          <div key={i} className="px-3.5 py-3">
                            {match ? (
                              <>
                                <p className="text-[11px] uppercase tracking-wide text-sky-300/70 mb-1">{match[1]}</p>
                                <p className="text-white/70 leading-relaxed whitespace-pre-line break-words">{match[2]}</p>
                              </>
                            ) : (
                              <p className="text-white/70 leading-relaxed whitespace-pre-line">{block}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {painPoints.length > 0 && (
                  <div className="mt-4">
                    <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-white/35 mb-1.5">
                      <AlertTriangle size={11} /> Identified issues
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {painPoints.map((p) => (
                        <span key={p} className="text-xs px-2 py-1 rounded-full bg-red-400/10 text-red-300 border border-red-400/10">
                          {PAIN_POINTS[p]}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Activity timeline + logger */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6">
            <h2 className="text-xl font-bold mb-4">Log Activity</h2>

            <div className="flex flex-wrap gap-2 mb-3">
              {LEAD_ACTIVITY_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setActivityType(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    activityType === t
                      ? 'bg-gradient-to-r from-sky-400 to-purple-500 text-black font-semibold'
                      : 'border border-white/15 text-white/60 hover:bg-white/5'
                  }`}
                >
                  {LEAD_ACTIVITY_LABELS[t]}
                </button>
              ))}
            </div>

            {(activityType === 'email' || activityType === 'note' || activityType === 'call') && (
              <select
                value=""
                onChange={(e) => {
                  const tmpl = SALES_TEMPLATES.find((t) => t.label === e.target.value);
                  if (tmpl) {
                    setActivityContent(tmpl.body);
                    if (activityType === 'email' && tmpl.subject) setEmailSubject(tmpl.subject);
                  }
                }}
                className={`${inputClass} mb-3 text-sm`}
              >
                <option value="" className="bg-[#05030a]">Insert a template...</option>
                <optgroup label="Follow-up" className="bg-[#05030a]">
                  {SALES_TEMPLATES.filter((t) => t.category === 'follow-up').map((t) => (
                    <option key={t.label} value={t.label} className="bg-[#05030a]">{t.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Objection handling" className="bg-[#05030a]">
                  {SALES_TEMPLATES.filter((t) => t.category === 'objection').map((t) => (
                    <option key={t.label} value={t.label} className="bg-[#05030a]">{t.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Closing" className="bg-[#05030a]">
                  {SALES_TEMPLATES.filter((t) => t.category === 'closing').map((t) => (
                    <option key={t.label} value={t.label} className="bg-[#05030a]">{t.label}</option>
                  ))}
                </optgroup>
              </select>
            )}

            {activityType === 'email' && (
              <input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Subject"
                className={`${inputClass} mb-3`}
              />
            )}

            <textarea
              value={activityContent}
              onChange={(e) => setActivityContent(e.target.value)}
              placeholder={
                activityType === 'email'
                  ? 'Email body...'
                  : activityType === 'loom'
                  ? 'What does this Loom cover?'
                  : activityType === 'call'
                  ? 'What was discussed on the call?'
                  : 'Note...'
              }
              rows={4}
              className={`${inputClass} resize-none mb-3`}
            />

            {(activityType === 'loom' || activityType === 'call') && (
              <input
                value={activityUrl}
                onChange={(e) => setActivityUrl(e.target.value)}
                placeholder={activityType === 'loom' ? 'Loom video URL' : 'Recording URL (optional)'}
                className={`${inputClass} mb-3`}
              />
            )}

            {activityType === 'email' && (
              <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer">
                <input type="checkbox" checked={sendEmailNow} onChange={(e) => setSendEmailNow(e.target.checked)} />
                Actually send this email to {lead.email || 'the lead'} now
              </label>
            )}

            {activityMessage && <p className="text-sm text-emerald-300 mb-3">{activityMessage}</p>}

            <button
              onClick={handleLogActivity}
              disabled={loggingActivity || !activityContent.trim()}
              className="rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-2.5 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {loggingActivity ? 'Saving...' : 'Log Activity'}
            </button>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6">
            <h2 className="text-lg font-bold mb-1">Mockup</h2>
            {lead.mockupUrl ? (
              <>
                <p className="text-xs text-emerald-300 mb-3">
                  Delivered {lead.mockupDeliveredAt ? new Date(lead.mockupDeliveredAt).toLocaleDateString() : ''} — ready to send to the client.
                </p>
                <div className="flex gap-2 mb-2">
                  <input readOnly value={lead.mockupUrl} className={`${inputClass} text-sm`} />
                  <a
                    href={lead.mockupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-lg border border-white/20 text-sm hover:bg-white/5 transition-colors whitespace-nowrap"
                  >
                    Open
                  </a>
                  <button
                    onClick={() => navigator.clipboard.writeText(lead.mockupUrl!)}
                    className="px-4 py-2 rounded-lg border border-white/20 text-sm hover:bg-white/5 transition-colors whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-white/30">Now's the time to call, email, or follow up with this in hand.</p>
              </>
            ) : lead.mockupRequested ? (
              <>
                <p className="text-xs text-amber-300 mb-3">
                  Requested {lead.mockupRequestedAt ? new Date(lead.mockupRequestedAt).toLocaleDateString() : ''} — waiting on the team.
                </p>
                <div className="flex gap-2">
                  <input
                    value={mockupLinkDraft}
                    onChange={(e) => setMockupLinkDraft(e.target.value)}
                    placeholder="Paste the finished mockup link here once it's ready..."
                    className={`${inputClass} text-sm`}
                  />
                  <button
                    onClick={handleDeliverMockup}
                    disabled={deliveringMockup || !mockupLinkDraft.trim()}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 text-black text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-colors whitespace-nowrap"
                  >
                    {deliveringMockup ? 'Saving...' : 'Mark Delivered'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-white/40 mb-3">
                  Need a visual to show this lead? Request one and it'll flag the team until it's ready.
                </p>
                <button
                  onClick={handleRequestMockup}
                  disabled={requestingMockup}
                  className="px-4 py-2 rounded-lg border border-white/20 text-sm hover:bg-white/5 disabled:opacity-50 transition-colors"
                >
                  {requestingMockup ? 'Requesting...' : '🎨 Request Mockup'}
                </button>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold">Qualification</h2>
              <span className={`text-xs font-semibold ${lead.qualifiedAt ? 'text-emerald-300' : 'text-white/40'}`}>
                {[qualNeed, qualAuthority, qualBudget, qualTiming, qualMotivation].filter((v) => v.trim()).length}/5
                {lead.qualifiedAt ? ' — Qualified' : ''}
              </span>
            </div>
            <p className="text-xs text-white/40 mb-4">
              Need, Authority, Budget, Timing, Motivation — fill in all five and this lead auto-advances to "Qualified."
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-white/40 mb-1">Need — does the current situation create an actual problem?</label>
                <textarea
                  value={qualNeed}
                  onChange={(e) => setQualNeed(e.target.value)}
                  rows={2}
                  placeholder="e.g. Enquiry form is confusing, mobile menu is broken, no clear route to a quote request..."
                  className={`${inputClass} text-sm resize-none`}
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Authority — can this person actually approve the project?</label>
                <textarea
                  value={qualAuthority}
                  onChange={(e) => setQualAuthority(e.target.value)}
                  rows={2}
                  placeholder="e.g. Owner, sole decision-maker. Or: needs sign-off from a business partner."
                  className={`${inputClass} text-sm resize-none`}
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Budget — realistic expectations vs. our $5k–6k range?</label>
                <textarea
                  value={qualBudget}
                  onChange={(e) => setQualBudget(e.target.value)}
                  rows={2}
                  placeholder="e.g. Confirmed comfortable in range. Or: hoping for something closer to $2k."
                  className={`${inputClass} text-sm resize-none`}
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Timing — is there a real driver, or "someday"?</label>
                <textarea
                  value={qualTiming}
                  onChange={(e) => setQualTiming(e.target.value)}
                  rows={2}
                  placeholder="e.g. Wants to launch before a trade show in March. Or: no urgency, just browsing."
                  className={`${inputClass} text-sm resize-none`}
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Motivation — why are they considering this now?</label>
                <textarea
                  value={qualMotivation}
                  onChange={(e) => setQualMotivation(e.target.value)}
                  rows={2}
                  placeholder="e.g. Losing quotes to a competitor with a stronger site."
                  className={`${inputClass} text-sm resize-none`}
                />
              </div>
            </div>

            <button
              onClick={handleSaveQualification}
              disabled={savingQual}
              className="mt-4 px-5 py-2.5 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 text-black text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {savingQual ? 'Saving...' : 'Save Qualification'}
            </button>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6">
            <h2 className="text-lg font-bold mb-1">Loop In The Team</h2>
            <p className="text-xs text-white/40 mb-3">
              Ping the team chat about this lead — for questions, a heads-up, or asking for a second opinion.
            </p>
            <div className="flex gap-2 mb-2">
              <input
                value={loopMessage}
                onChange={(e) => setLoopMessage(e.target.value)}
                placeholder="e.g. Can you double check this pricing before I send it?"
                className={`${inputClass} text-sm`}
              />
              <button
                onClick={handleLoopIn}
                disabled={loopSending || !loopMessage.trim()}
                className="px-4 py-2 rounded-lg border border-white/20 text-sm hover:bg-white/5 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {loopSending ? 'Sending...' : 'Send'}
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-white/40 cursor-pointer">
              <input type="checkbox" checked={loopUrgent} onChange={(e) => setLoopUrgent(e.target.checked)} />
              🚩 Flag as needing a response (shows in their notifications until resolved)
            </label>
            {loopStatus && <p className="text-xs text-emerald-300 mt-2">{loopStatus}</p>}
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6">
            <h2 className="text-xl font-bold mb-4">Timeline</h2>
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {lead.activities.length === 0 && (
                <p className="text-white/40 text-sm">No activity logged yet.</p>
              )}
              {lead.activities.map((activity) => (
                <div key={activity.id} className="p-4 rounded-lg bg-white/5 border-l-2 border-sky-400/50">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-sky-300">
                      {LEAD_ACTIVITY_LABELS[activity.type]}
                    </span>
                    <span className="text-xs text-white/30">
                      {new Date(activity.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-white/70 whitespace-pre-wrap">{activity.content}</p>
                  {activity.url && (
                    <a
                      href={activity.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-sky-300 hover:underline mt-1 inline-block"
                    >
                      {activity.url}
                    </a>
                  )}
                  <p className="text-xs text-white/30 mt-1">by {activity.createdBy?.name || 'Team'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Proposal builder — configure exactly what they want, then send a payment link or a contract */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.03] backdrop-blur-xl p-6 md:p-8 mt-6 shadow-[0_0_60px_-15px_rgba(56,189,248,0.15)]">
        <div className="flex items-center gap-3 mb-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-sky-400 to-purple-500 text-black text-sm font-bold">
            ✦
          </span>
          <h2 className="text-xl font-bold">Onboard This Customer</h2>
        </div>
        <p className="text-sm text-white/40 mb-8 ml-11">
          Configure exactly what they want, then send a payment link or generate a contract — no need to send them back to the pricing page.
        </p>

        <div className="grid lg:grid-cols-[1fr_320px] gap-8">
          {/* Left: configuration steps */}
          <div className="space-y-8">
            <div>
              <StepLabel n={1} label="Base Service" />
              <div className="grid sm:grid-cols-3 gap-3">
                {(Object.entries(BASE_SERVICES) as [BaseService, (typeof BASE_SERVICES)[BaseService]][]).map(
                  ([key, service]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setProposalService(key)}
                      className={`text-left rounded-xl p-4 border transition-all ${
                        proposalService === key
                          ? 'bg-gradient-to-br from-sky-400/20 to-purple-500/20 border-sky-400/50 shadow-[0_0_0_1px_rgba(56,189,248,0.3)]'
                          : 'border-white/10 hover:border-white/25 hover:bg-white/[0.03]'
                      }`}
                    >
                      <p className="font-semibold text-sm">{service.label}</p>
                      <p className="text-xs text-white/40 mt-0.5">{formatCents(service.price)}</p>
                    </button>
                  )
                )}
              </div>
            </div>

            <div>
              <StepLabel n={2} label="Add-Ons" hint={`${proposalAddOns.length} selected`} />
              <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                {(Object.entries(ADD_ON_CATEGORIES) as [AddOnCategory, (typeof ADD_ON_CATEGORIES)[AddOnCategory]][]).map(
                  ([catKey, cat]) => {
                    const entries = (Object.entries(ADD_ONS) as [AddOnKey, (typeof ADD_ONS)[AddOnKey]][]).filter(
                      ([, a]) => a.category === catKey
                    );
                    return (
                      <div key={catKey}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/35 mb-2">
                          {cat.label}
                        </p>
                        <div className="grid sm:grid-cols-2 gap-2">
                          {entries.map(([key, addOn]) => {
                            const includedInBase = isIncludedInBase(proposalService, key);
                            return (
                            <label
                              key={key}
                              className={`flex items-start gap-2 rounded-lg p-3 border transition-colors ${
                                includedInBase ? 'cursor-default' : 'cursor-pointer'
                              } ${
                                proposalAddOns.includes(key)
                                  ? 'bg-gradient-to-r from-sky-400/15 to-purple-500/15 border-sky-400/40'
                                  : 'border-white/10 hover:border-white/25'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={proposalAddOns.includes(key)}
                                onChange={() => toggleProposalAddOn(key)}
                                disabled={includedInBase}
                              />
                              <span className="flex-1">
                                <span className="text-sm block">{addOn.label}</span>
                                <span className="text-xs text-white/35">{addOn.description}</span>
                              </span>
                              {includedInBase ? (
                                <span className="text-xs text-emerald-300 whitespace-nowrap">Included</span>
                              ) : (
                                <span className="text-xs text-white/40 whitespace-nowrap">+{formatCents(addOn.price)}</span>
                              )}
                            </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>

            <div>
              <StepLabel n={3} label="Custom Items" hint={customItems.length ? `${customItems.length} added` : 'optional'} />
              <div className="space-y-2 mb-3">
                {customItems.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
                  >
                    <span className="text-sm">{item.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-white/60">{formatCents(item.priceCents)}</span>
                      <button
                        onClick={() => removeCustomItem(i)}
                        aria-label={`Remove ${item.label}`}
                        className="text-white/40 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Custom item name"
                  value={draftCustomLabel}
                  onChange={(e) => setDraftCustomLabel(e.target.value)}
                  className={`${inputClass} flex-1`}
                />
                <input
                  type="number"
                  placeholder="Price"
                  min="0"
                  step="1"
                  value={draftCustomPrice}
                  onChange={(e) => setDraftCustomPrice(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomItem();
                    }
                  }}
                  className={`${inputClass} w-28`}
                />
                <button
                  onClick={addCustomItem}
                  disabled={!draftCustomLabel.trim() || !draftCustomPrice}
                  className="shrink-0 rounded-lg border border-white/20 px-4 text-sm font-medium disabled:opacity-40 hover:bg-white/5 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            <div>
              <StepLabel n={4} label="Client Details" />
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-2 text-white/50">Client Type</label>
                  <select
                    value={proposalClientType}
                    onChange={(e) => setProposalClientType(e.target.value as ClientType)}
                    className={inputClass}
                  >
                    {(Object.entries(CLIENT_TYPES) as [ClientType, (typeof CLIENT_TYPES)[ClientType]][]).map(
                      ([key, type]) => (
                        <option key={key} value={key} className="bg-[#05030a]">
                          {type.label}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-2 text-white/50">Timeline</label>
                  <select
                    value={proposalTimeline}
                    onChange={(e) => setProposalTimeline(e.target.value as TimelineKey)}
                    className={inputClass}
                  >
                    {(Object.entries(TIMELINES) as [TimelineKey, (typeof TIMELINES)[TimelineKey]][]).map(([key, tl]) => (
                      <option key={key} value={key} className="bg-[#05030a]">
                        {tl.label} ({tl.weeks})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Right: sticky summary + actions */}
          <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs text-white/40 mb-3">Summary</p>
              <div className="space-y-1.5 text-sm mb-4">
                <div className="flex justify-between text-white/60">
                  <span>Base</span>
                  <span>{formatCents(proposalBreakdown.basePrice)}</span>
                </div>
                {proposalBreakdown.addOnsPrice > 0 && (
                  <div className="flex justify-between text-white/60">
                    <span>Add-ons ({proposalAddOns.length})</span>
                    <span>{formatCents(proposalBreakdown.addOnsPrice)}</span>
                  </div>
                )}
                {customItems.map((item, i) => (
                  <div key={i} className="flex justify-between text-white/60">
                    <span>{item.label}</span>
                    <span>{formatCents(item.priceCents)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-baseline border-t border-white/10 pt-3">
                <span className="font-semibold text-sm">Total</span>
                <span className="text-2xl font-bold bg-gradient-to-r from-sky-300 to-purple-300 bg-clip-text text-transparent">
                  {formatCents(proposalGrandTotal)}
                </span>
              </div>

              <label className="flex items-start gap-2 text-xs text-white/55 mt-4 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={depositOnly} onChange={(e) => setDepositOnly(e.target.checked)} />
                <span>
                  Charge 50% deposit only ({formatCents(depositAmount(proposalGrandTotal))}) — collect the rest later
                </span>
              </label>
            </div>

            {proposalError && <p className="text-red-400 text-sm">{proposalError}</p>}

            <div className="space-y-2">
              <button
                onClick={handleEmailPaymentLink}
                disabled={emailingLink || creatingLink}
                className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-3 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {emailingLink ? 'Sending...' : `Email Sign & Pay Link${depositOnly ? ' (Deposit)' : ''}`}
              </button>
              <button
                onClick={handleCreatePaymentLink}
                disabled={creatingLink || emailingLink}
                className="w-full rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-white/5 transition-colors"
              >
                {creatingLink ? 'Creating...' : 'Just Generate the Link'}
              </button>
              <button
                onClick={handleDownloadContract}
                disabled={downloadingContract}
                className="w-full rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-white/5 transition-colors"
              >
                {downloadingContract ? 'Generating...' : 'Download Contract PDF'}
              </button>
              <button
                onClick={handleConvertToProject}
                disabled={convertingToProject}
                className="w-full rounded-lg border border-emerald-400/30 px-5 py-2.5 text-sm font-medium text-emerald-300 disabled:opacity-50 hover:bg-emerald-400/10 transition-colors"
              >
                Convert to Project (skip payment)
              </button>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2">
              <span className="text-xs text-white/50">Contract status</span>
              <select
                value={lead.contractStatus}
                onChange={(e) => handleSetContractStatus(e.target.value as LeadDetail['contractStatus'])}
                className="text-xs bg-transparent border-none focus:outline-none text-right font-medium cursor-pointer"
              >
                <option value="not_sent" className="bg-[#05030a]">Not sent</option>
                <option value="sent" className="bg-[#05030a]">Sent — awaiting signature</option>
                <option value="signed" className="bg-[#05030a]">Signed</option>
              </select>
            </div>

            {lead.agreementSignedAt && (
              <p className="text-xs text-emerald-300">
                ✓ Agreed online {new Date(lead.agreementSignedAt).toLocaleString()}
                {lead.agreementIp ? ` from ${lead.agreementIp}` : ''}
              </p>
            )}
            {lead.signedContractUrl && (
              <a
                href={lead.signedContractUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-sky-300 hover:underline"
              >
                View signed copy
              </a>
            )}

            {linkEmailStatus && <p className="text-xs text-white/50">{linkEmailStatus}</p>}

            {paymentLinkUrl && (
              <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                <p className="text-xs text-white/50 mb-2">Sign &amp; pay link — one page: review, agree, pay:</p>
                <div className="flex gap-2">
                  <input readOnly value={paymentLinkUrl} className="w-full px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs text-white/70" />
                  <button
                    onClick={() => navigator.clipboard.writeText(paymentLinkUrl)}
                    className="px-3 py-1.5 rounded-md border border-white/20 text-xs hover:bg-white/5 transition-colors whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            <p className="text-xs text-white/30">
              The link above handles agreement + payment in one step. Need a more formal signature
              for a specific deal instead? Download the contract PDF and use your Google Workspace
              "Request eSignature" on it manually.
            </p>
          </div>
        </div>
      </div>

      {pendingLostStatus && lead && (
        <LostReasonModal
          companyName={lead.company}
          onCancel={() => setPendingLostStatus(false)}
          onConfirm={handleConfirmLost}
        />
      )}
    </div>
  );
}

function StepLabel({ n, label, hint }: { n: number; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/70">
        {n}
      </span>
      <h3 className="font-semibold text-sm">{label}</h3>
      {hint && <span className="text-xs text-white/35">{hint}</span>}
    </div>
  );
}
