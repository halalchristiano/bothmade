'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_ACTIVITY_TYPES,
  LEAD_ACTIVITY_LABELS,
  PAIN_POINTS,
  painPointSentence,
  type LeadStatus,
  type LeadActivityType,
  type PainPointKey,
} from '@/lib/leads';
import { SALES_TEMPLATES } from '@/lib/sales-templates';
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
} from 'lucide-react';
import {
  ADD_ON_CATEGORIES,
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
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
  assignedTo: { name: string | null } | null;
  activities: Activity[];
}

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const leadId = params.leadId as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
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

  const load = async () => {
    try {
      const response = await fetch(`/api/admin/leads/${leadId}`);
      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await response.json();
      if (data.success) {
        const l: LeadDetail = data.lead;
        setLead(l);
        setCompany(l.company);
        setContactName(l.contactName || '');
        setEmail(l.email || '');
        setPhone(l.phone || '');
        setSource(l.source || '');
        setEstimatedValue(l.estimatedValue ? String(l.estimatedValue / 100) : '');
        setNotes(l.notes || '');
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
          painPoints,
        }),
      });
      setEditing(false);
      load();
    } finally {
      setSaving(false);
    }
  };

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
  };

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
        <div className="flex flex-wrap items-center gap-2">
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/25 text-amber-300 hover:bg-amber-400/20 transition-colors"
            >
              <Phone size={13} /> Call
            </a>
          )}
          {lead.email && lead.coldEmailDraft && !lead.coldEmailSentAt && !coldDraftSent && (
            <button
              onClick={handleSendColdDraft}
              disabled={sendingColdDraft}
              className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              <Send size={13} /> {sendingColdDraft ? 'Sending...' : 'Send cold email'}
            </button>
          )}
          {(lead.coldEmailSentAt || coldDraftSent) && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-300/70">
              <CheckCircle2 size={13} /> Cold email sent
            </span>
          )}
          <button
            onClick={() => setComposingEmail(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-full bg-gradient-to-r from-sky-400 to-purple-500 text-black hover:opacity-90 transition-opacity"
          >
            <Mail size={13} /> Compose email
          </button>
          {confirmingDeleteLead ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-white/40">Delete {lead.company}?</span>
              <button
                onClick={handleDeleteLead}
                disabled={deletingLead}
                className="px-3 py-1.5 rounded-full bg-red-500/90 text-white text-xs font-semibold disabled:opacity-50 hover:bg-red-500 transition-colors"
              >
                {deletingLead ? 'Deleting...' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmingDeleteLead(false)}
                className="px-3 py-1.5 rounded-full border border-white/15 text-xs hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDeleteLead(true)}
              className="text-xs text-white/30 hover:text-red-300 transition-colors px-2"
            >
              Delete lead
            </button>
          )}
        </div>
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

      <div className="grid lg:grid-cols-3 gap-6 mt-4">
        {/* LEFT: Lead info */}
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6">
            <div className="flex justify-between items-start gap-3 mb-5">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  onClick={handleToggleHot}
                  title={lead.hotLead ? 'Unmark as hot' : 'Mark as hot lead'}
                  className={`shrink-0 text-lg leading-none transition-colors ${lead.hotLead ? 'text-amber-400' : 'text-white/20 hover:text-white/50'}`}
                >
                  ★
                </button>
                <h1 className="text-2xl font-bold truncate">{lead.company}</h1>
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
              <div className="min-w-0">
                <label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-sky-300/70 mb-1.5">
                  <CalendarClock size={11} /> Follow-up
                </label>
                <input
                  type="date"
                  defaultValue={lead.nextFollowUpAt ? lead.nextFollowUpAt.slice(0, 10) : ''}
                  onChange={(e) => handleSetFollowUp(e.target.value)}
                  className={`${inputClass} block w-full min-w-0 max-w-full box-border border-sky-400/20 focus:ring-sky-400/50 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:ml-0.5 [&::-webkit-calendar-picker-indicator]:mr-0`}
                />
              </div>
            </div>

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
                      <a href={`mailto:${lead.email}`} className="hover:text-sky-300 transition-colors truncate">
                        {lead.email}
                      </a>
                    ) : (
                      <span className="text-amber-300/80 italic">No email — call instead</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 px-3 py-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-400/10 text-amber-300 shrink-0">
                      <Phone size={14} />
                    </span>
                    {lead.phone ? (
                      <a href={`tel:${lead.phone}`} className="hover:text-amber-300 transition-colors">
                        {lead.phone}
                      </a>
                    ) : (
                      <span className="text-white/30 italic">No phone on file</span>
                    )}
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
                    <p className="text-white/70 leading-relaxed whitespace-pre-line">{lead.notes}</p>
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
              <StepLabel n={3} label="Client Details" />
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
              </div>
              <div className="flex justify-between items-baseline border-t border-white/10 pt-3">
                <span className="font-semibold text-sm">Total</span>
                <span className="text-2xl font-bold bg-gradient-to-r from-sky-300 to-purple-300 bg-clip-text text-transparent">
                  {formatCents(proposalBreakdown.totalPrice)}
                </span>
              </div>

              <label className="flex items-start gap-2 text-xs text-white/55 mt-4 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={depositOnly} onChange={(e) => setDepositOnly(e.target.checked)} />
                <span>
                  Charge 50% deposit only ({formatCents(depositAmount(proposalBreakdown.totalPrice))}) — collect the rest later
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
